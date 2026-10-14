import { isTurnstileTestSecret, TURNSTILE_TOKEN_MAX, type TurnstileResult } from "./index.js";

export {
	isTurnstileTestSecret,
	TURNSTILE_FIELD,
	TURNSTILE_TEST_KEYS,
	type TurnstileFailure,
	type TurnstileResult,
} from "./index.js";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface VerifyTurnstileOptions {
	/** The widget's secret key. Missing gives `missing-secret`, never a pass. */
	secret: string | null | undefined;
	/** The visitor's IP (`CF-Connecting-IP` on Workers), sent to Cloudflare as a signal. */
	remoteIp?: string | null;
	/** Refuse a token issued for a different action (another form or page). */
	expectedAction?: string;
	/** Refuse a token issued on another site. One name, or several. */
	expectedHostname?: string | readonly string[];
	/**
	 * Lets the same token be checked again, by retries of one request, within
	 * a few minutes. Without it a second check of a token always fails.
	 */
	idempotencyKey?: string;
	/** How long to wait for Cloudflare. Defaults to 5 seconds. */
	timeoutMs?: number;
	/** For tests; defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

interface SiteverifyResponse {
	success?: boolean;
	"error-codes"?: string[];
	challenge_ts?: string;
	hostname?: string;
	action?: string;
	cdata?: string;
}

const fail = (
	reason: Extract<TurnstileResult, { ok: false }>["reason"],
	errorCodes: string[] = [],
): TurnstileResult => ({ ok: false, reason, errorCodes });

/**
 * Asks Cloudflare whether a Turnstile token is good. Never throws: a timeout,
 * a network error or an unreadable reply all come back as `unavailable`, so
 * the caller decides what to do and an outage never lets everything through.
 *
 * A token can be checked once (unless `idempotencyKey` is given) and is good
 * for five minutes. With one of Cloudflare's test secrets the action and
 * hostname are not compared, because the test responses carry placeholders.
 * Runs in Workers, Node and browsers: it needs only `fetch`.
 */
export async function verifyTurnstile(
	token: unknown,
	options: VerifyTurnstileOptions,
): Promise<TurnstileResult> {
	if (typeof token !== "string" || token.trim() === "" || token.length > TURNSTILE_TOKEN_MAX) {
		return fail("missing-token");
	}
	if (!options.secret) return fail("missing-secret");

	const body = new URLSearchParams({ secret: options.secret, response: token });
	if (options.remoteIp) body.set("remoteip", options.remoteIp);
	if (options.idempotencyKey) body.set("idempotency_key", options.idempotencyKey);

	let data: SiteverifyResponse;
	try {
		const res = await (options.fetch ?? fetch)(SITEVERIFY_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body,
			signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
		});
		if (!res.ok) return fail("unavailable", [`http-${res.status}`]);
		data = (await res.json()) as SiteverifyResponse;
	} catch (err) {
		const name = err instanceof Error ? err.name : "";
		return fail("unavailable", [name === "TimeoutError" ? "timeout" : "network-error"]);
	}

	const errorCodes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
	if (data.success !== true) return fail("rejected", errorCodes);

	if (!isTurnstileTestSecret(options.secret)) {
		if (options.expectedAction !== undefined && data.action !== options.expectedAction) {
			return fail("action-mismatch", errorCodes);
		}
		if (options.expectedHostname !== undefined) {
			const allowed =
				typeof options.expectedHostname === "string"
					? [options.expectedHostname]
					: options.expectedHostname;
			if (!data.hostname || !allowed.includes(data.hostname)) {
				return fail("hostname-mismatch", errorCodes);
			}
		}
	}

	return {
		ok: true,
		action: data.action ?? null,
		hostname: data.hostname ?? null,
		challengeTs: data.challenge_ts ?? null,
		cdata: data.cdata ?? null,
	};
}
