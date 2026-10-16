// Sending a checked submission somewhere. Core prepares the submission (validated
// answers, the schema fingerprint and an idempotency key) and hands it to a
// transport: your own function, or the generic HTTP transport below. Nothing here
// knows about FeedBakkr Cloud; any endpoint that speaks the same JSON works.

import { hashSchema } from "../schema/hash.js";
import type { SchemaDsl } from "../schema/schema-dsl-v2.js";
import { type SchemaIssue, validateSchema } from "../schema/validate-schema.js";
import type { SubmissionErrorCode, SubmissionErrors } from "../submissions/errors.js";
import { validateSubmission } from "../submissions/validate.js";

/** What a transport sends. Prepare it once per logical submission and reuse it for retries. */
export interface PreparedSubmission {
	/** The schema the answers were checked against, as validated. */
	schema: SchemaDsl;
	/** `sha256:` + `hashSchema(schema)`: lower-case hex of the canonical JSON. */
	schemaFingerprint: string;
	/** The normalised answers that passed validation. */
	answers: Record<string, unknown>;
	/**
	 * Random per logical submission. A retry of the same submission must send the
	 * same key, so the receiver can recognise it; a new submission gets a new one.
	 */
	idempotencyKey: string;
	context?: { formInstanceId?: string; test?: boolean };
	/** A Cloudflare Turnstile token, when the receiver asks for one. Not part of the key. */
	turnstileToken?: string;
}

export interface PrepareSubmissionOptions {
	/** Accept schema v2 as well as v1. Defaults to true. */
	allowV2?: boolean;
	/** Supply your own key (for example one kept in a draft); otherwise a random UUID. */
	idempotencyKey?: string;
	context?: PreparedSubmission["context"];
	turnstileToken?: string;
	/** The moment relative date bounds such as "today" are measured from. */
	now?: Date;
}

export type PrepareSubmissionResult =
	| { ok: true; submission: PreparedSubmission }
	| { ok: false; reason: "invalid_schema"; issues: SchemaIssue[] }
	| { ok: false; reason: "invalid_answers"; errors: SubmissionErrors };

/**
 * Validates answers against a schema exactly as a server does, and prepares the
 * submission to send. Async because the fingerprint uses WebCrypto.
 */
export async function prepareSubmission(
	schema: unknown,
	raw: unknown,
	options: PrepareSubmissionOptions = {},
): Promise<PrepareSubmissionResult> {
	const checked =
		options.allowV2 === false ? validateSchema(schema) : validateSchema(schema, { allowV2: true });
	if (!checked.ok) return { ok: false, reason: "invalid_schema", issues: checked.issues };
	const answers = validateSubmission(checked.schema, raw, {
		unknownFields: "reject",
		now: options.now,
	});
	if (!answers.ok) return { ok: false, reason: "invalid_answers", errors: answers.errors };
	const submission: PreparedSubmission = {
		schema: checked.schema,
		schemaFingerprint: `sha256:${await hashSchema(checked.schema)}`,
		answers: answers.values,
		idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
	};
	if (options.context) submission.context = options.context;
	if (options.turnstileToken) submission.turnstileToken = options.turnstileToken;
	return { ok: true, submission };
}

/** What happened to a send. Only `success` means the receiver stored it. */
export type TransportResult =
	| { status: "success"; submissionId: string; receivedAt: string; replayed: boolean }
	| { status: "field-errors"; errors: SubmissionErrors }
	| {
			status: "form-error";
			/** The receiver's error code, or NETWORK_ERROR, TIMEOUT, ABORTED, INVALID_RESPONSE. */
			code: string;
			message: string;
			/**
			 * True when sending the same PreparedSubmission again (same idempotency key)
			 * is safe and may succeed: network failures, timeouts, 429 and 5xx.
			 */
			retryable: boolean;
			retryAfterSeconds?: number;
			requestId?: string;
	  };

/** Anything that can deliver a prepared submission: the HTTP transport or your own handler. */
export type SubmissionTransport = (
	submission: PreparedSubmission,
	options?: { signal?: AbortSignal },
) => Promise<TransportResult>;

export interface HttpTransportOptions {
	/** The full URL to POST to. */
	endpoint: string;
	/** Extra headers, e.g. `Authorization` for server-to-server use. Never put secrets in browser code. */
	headers?: Record<string, string>;
	/** Give up after this long. Defaults to 15 seconds. */
	timeoutMs?: number;
	/** For tests or custom runtimes; defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

type WireError = { code?: unknown; message?: unknown; fields?: unknown; requestId?: unknown };
type WireReply = { ok?: unknown; submissionId?: unknown; receivedAt?: unknown; error?: WireError };

function retryAfter(response: Response): number | undefined {
	const header = response.headers.get("Retry-After");
	if (header === null || header.trim() === "") return undefined;
	const value = Number(header);
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Turns the wire's `[{ path: "list.2", code }]` into errors keyed by field, like validateSubmission. */
function toSubmissionErrors(fields: unknown): SubmissionErrors {
	const errors: SubmissionErrors = {};
	if (!Array.isArray(fields)) return errors;
	for (const field of fields) {
		if (!field || typeof field !== "object") continue;
		const { path, code } = field as { path?: unknown; code?: unknown };
		if (typeof code !== "string") continue;
		const [key = "", ...rest] = typeof path === "string" && path ? path.split(".") : [""];
		const entry = {
			code: code as SubmissionErrorCode,
			message: code,
			...(rest.length ? { path: rest } : {}),
		};
		errors[key] ??= [];
		errors[key].push(entry);
	}
	return errors;
}

/**
 * POSTs the submission as JSON with an `Idempotency-Key` header and reads the
 * receiver's v1 reply. It never retries on its own: call it again with the same
 * PreparedSubmission when the result says `retryable`.
 */
export function httpTransport(options: HttpTransportOptions): SubmissionTransport {
	const doFetch = options.fetch ?? fetch;
	return async (submission, sendOptions = {}) => {
		const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
		const signal = sendOptions.signal ? AbortSignal.any([sendOptions.signal, timeout]) : timeout;
		const body: Record<string, unknown> = {
			schema: submission.schema,
			schemaFingerprint: submission.schemaFingerprint,
			answers: submission.answers,
		};
		if (submission.context) body.context = submission.context;
		if (submission.turnstileToken) body.turnstileToken = submission.turnstileToken;

		let response: Response;
		try {
			response = await doFetch(options.endpoint, {
				method: "POST",
				headers: {
					...options.headers,
					"Content-Type": "application/json",
					"Idempotency-Key": submission.idempotencyKey,
				},
				body: JSON.stringify(body),
				signal,
			});
		} catch {
			if (sendOptions.signal?.aborted) {
				return {
					status: "form-error",
					code: "ABORTED",
					message: "The submission was cancelled.",
					retryable: true,
				};
			}
			if (timeout.aborted) {
				return {
					status: "form-error",
					code: "TIMEOUT",
					message: "The receiver did not answer in time.",
					retryable: true,
				};
			}
			return {
				status: "form-error",
				code: "NETWORK_ERROR",
				message: "The submission could not be sent.",
				retryable: true,
			};
		}

		let reply: WireReply | null = null;
		try {
			reply = (await response.json()) as WireReply | null;
		} catch {
			reply = null;
		}

		if (
			response.ok &&
			reply?.ok === true &&
			typeof reply.submissionId === "string" &&
			typeof reply.receivedAt === "string"
		) {
			return {
				status: "success",
				submissionId: reply.submissionId,
				receivedAt: reply.receivedAt,
				replayed: response.headers.get("Idempotent-Replayed") === "true",
			};
		}

		const error = reply?.error;
		if (response.status === 422 && error && Array.isArray(error.fields)) {
			return { status: "field-errors", errors: toSubmissionErrors(error.fields) };
		}

		const retryable =
			response.status === 408 ||
			response.status === 429 ||
			response.status >= 500 ||
			reply === null;
		const result: TransportResult = {
			status: "form-error",
			code:
				typeof error?.code === "string"
					? error.code
					: reply === null
						? "INVALID_RESPONSE"
						: `HTTP_${response.status}`,
			message:
				typeof error?.message === "string" ? error.message : "The submission was not accepted.",
			retryable,
		};
		const wait = retryAfter(response);
		if (wait !== undefined) result.retryAfterSeconds = wait;
		if (typeof error?.requestId === "string") result.requestId = error.requestId;
		return result;
	};
}
