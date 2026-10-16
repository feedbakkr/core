import { describe, expect, it } from "vitest";
import { hashSchema, validateSchema } from "../src/index.js";
import {
	httpTransport,
	type PreparedSubmission,
	prepareSubmission,
} from "../src/transport/index.js";

const schema = {
	v: 1,
	fields: [
		{ k: "name", t: "text", label: "Name", req: true },
		{ k: "email", t: "email", label: "Email", req: true },
	],
};

async function prepared(): Promise<PreparedSubmission> {
	const result = await prepareSubmission(schema, { name: "  Pat ", email: "pat@example.com" });
	if (!result.ok) throw new Error("prepare failed");
	return result.submission;
}

type Call = { url: string; init: RequestInit };
function fakeFetch(reply: (call: Call) => Response | Promise<Response>) {
	const calls: Call[] = [];
	const fn = (async (url: string | URL | Request, init?: RequestInit) => {
		const call = { url: String(url), init: init ?? {} };
		calls.push(call);
		return reply(call);
	}) as typeof fetch;
	return { fn, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});

describe("prepareSubmission", () => {
	it("validates, normalises and fingerprints like a server", async () => {
		const submission = await prepared();
		const checked = validateSchema(schema);
		if (!checked.ok) throw new Error("schema");
		expect(submission.schemaFingerprint).toBe(`sha256:${await hashSchema(checked.schema)}`);
		expect(submission.answers).toEqual({ name: "Pat", email: "pat@example.com" });
		expect(submission.idempotencyKey).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it("gives each logical submission a new key unless one is supplied", async () => {
		const a = await prepared();
		const b = await prepared();
		expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
		const kept = await prepareSubmission(
			schema,
			{ name: "Pat", email: "p@example.com" },
			{ idempotencyKey: "draft-7" },
		);
		expect(kept.ok && kept.submission.idempotencyKey).toBe("draft-7");
	});

	it("reports invalid schemas and invalid answers without sending anything", async () => {
		const badSchema = await prepareSubmission({ v: 9 }, {});
		expect(badSchema.ok === false && badSchema.reason).toBe("invalid_schema");
		const badAnswers = await prepareSubmission(schema, { email: "nope", extra: 1 });
		expect(badAnswers.ok).toBe(false);
		if (badAnswers.ok || badAnswers.reason !== "invalid_answers")
			throw new Error("expected invalid_answers");
		expect(Object.keys(badAnswers.errors).sort()).toEqual(["email", "extra", "name"]);
	});
});

describe("httpTransport", () => {
	it("posts the v1 envelope with the idempotency key and returns success", async () => {
		const submission = { ...(await prepared()), context: { test: true }, turnstileToken: "tok" };
		const { fn, calls } = fakeFetch(() =>
			json(201, { ok: true, submissionId: "abc", receivedAt: "2026-10-16T12:00:00.000Z" }),
		);
		const send = httpTransport({
			endpoint: "https://example.test/v1/a/b",
			fetch: fn,
			headers: { "X-Extra": "1", "Content-Type": "text/plain" },
		});
		expect(await send(submission)).toEqual({
			status: "success",
			submissionId: "abc",
			receivedAt: "2026-10-16T12:00:00.000Z",
			replayed: false,
		});
		const [call] = calls;
		expect(call?.url).toBe("https://example.test/v1/a/b");
		expect(call?.init.method).toBe("POST");
		const headers = call?.init.headers as Record<string, string>;
		expect(headers["Idempotency-Key"]).toBe(submission.idempotencyKey);
		expect(headers["Content-Type"]).toBe("application/json");
		expect(headers["X-Extra"]).toBe("1");
		const body = JSON.parse(String(call?.init.body));
		expect(Object.keys(body).sort()).toEqual([
			"answers",
			"context",
			"schema",
			"schemaFingerprint",
			"turnstileToken",
		]);
		expect(body.idempotencyKey).toBeUndefined();
	});

	it("resends the same key on retry and reports a replay", async () => {
		const submission = await prepared();
		let n = 0;
		const { fn, calls } = fakeFetch(() =>
			++n === 1
				? json(
						503,
						{ ok: false, error: { code: "SUBMISSIONS_UNAVAILABLE", message: "later" } },
						{ "Retry-After": "30" },
					)
				: json(
						201,
						{ ok: true, submissionId: "abc", receivedAt: "t" },
						{ "Idempotent-Replayed": "true" },
					),
		);
		const send = httpTransport({ endpoint: "https://example.test", fetch: fn });
		expect(await send(submission)).toMatchObject({
			status: "form-error",
			code: "SUBMISSIONS_UNAVAILABLE",
			retryable: true,
			retryAfterSeconds: 30,
		});
		expect(await send(submission)).toMatchObject({ status: "success", replayed: true });
		const keys = calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
		expect(keys[0]).toBe(keys[1]);
	});

	it("maps 422 field errors back to errors keyed by field", async () => {
		const { fn } = fakeFetch(() =>
			json(422, {
				ok: false,
				error: {
					code: "VALIDATION_FAILED",
					message: "x",
					fields: [
						{ path: "email", code: "invalid_email" },
						{ path: "items.2", code: "too_long" },
					],
				},
			}),
		);
		const result = await httpTransport({ endpoint: "https://example.test", fetch: fn })(
			await prepared(),
		);
		expect(result).toEqual({
			status: "field-errors",
			errors: {
				email: [{ code: "invalid_email", message: "invalid_email" }],
				items: [{ code: "too_long", message: "too_long", path: ["2"] }],
			},
		});
	});

	it("marks client errors as not retryable and rate limits as retryable", async () => {
		const conflict = fakeFetch(() =>
			json(409, {
				ok: false,
				error: { code: "IDEMPOTENCY_CONFLICT", message: "m", requestId: "r1" },
			}),
		);
		expect(
			await httpTransport({ endpoint: "https://example.test", fetch: conflict.fn })(
				await prepared(),
			),
		).toEqual({
			status: "form-error",
			code: "IDEMPOTENCY_CONFLICT",
			message: "m",
			retryable: false,
			requestId: "r1",
		});
		const limited = fakeFetch(() =>
			json(
				429,
				{ ok: false, error: { code: "RATE_LIMITED", message: "m" } },
				{ "Retry-After": "60" },
			),
		);
		expect(
			await httpTransport({ endpoint: "https://example.test", fetch: limited.fn })(
				await prepared(),
			),
		).toMatchObject({
			retryable: true,
			retryAfterSeconds: 60,
		});
	});

	it("treats unreadable replies, network failures, aborts and timeouts as retryable", async () => {
		const html = fakeFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
		expect(
			await httpTransport({ endpoint: "https://example.test", fetch: html.fn })(await prepared()),
		).toMatchObject({
			code: "INVALID_RESPONSE",
			retryable: true,
		});
		const offline = fakeFetch(() => {
			throw new TypeError("fetch failed");
		});
		expect(
			await httpTransport({ endpoint: "https://example.test", fetch: offline.fn })(
				await prepared(),
			),
		).toMatchObject({
			code: "NETWORK_ERROR",
			retryable: true,
		});
		const hang = fakeFetch(
			({ init }) =>
				new Promise<Response>((_, reject) =>
					init.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					),
				),
		);
		const controller = new AbortController();
		const pending = httpTransport({ endpoint: "https://example.test", fetch: hang.fn })(
			await prepared(),
			{ signal: controller.signal },
		);
		controller.abort();
		expect(await pending).toMatchObject({ code: "ABORTED", retryable: true });
		expect(
			await httpTransport({ endpoint: "https://example.test", fetch: hang.fn, timeoutMs: 20 })(
				await prepared(),
			),
		).toMatchObject({
			code: "TIMEOUT",
			retryable: true,
		});
	});
});
