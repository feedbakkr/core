// Cloudflare Turnstile, shared by the server check (`/server`), the browser
// loader (`/browser`) and the React hook (`/react`). This entry holds only
// constants and types, so any of them can import it.

/** The form field the widget writes its token into, and where servers look. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/** Longest token Cloudflare issues; anything longer is not a token. */
export const TURNSTILE_TOKEN_MAX = 2048;

/**
 * Cloudflare's test keys, for local development and tests. They work on any
 * hostname, including localhost, and never show a real challenge. An
 * environment using them has no bot protection, so never use them in
 * production.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_KEYS = {
	site: {
		/** Always passes, visibly. */
		passes: "1x00000000000000000000AA",
		/** Always passes, invisibly. */
		passesInvisible: "1x00000000000000000000BB",
		/** Always blocks. */
		blocks: "2x00000000000000000000AB",
		/** Always asks the visitor to interact. */
		challenges: "3x00000000000000000000FF",
	},
	secret: {
		/** Every token passes. */
		passes: "1x0000000000000000000000000000000AA",
		/** Every token fails. */
		fails: "2x0000000000000000000000000000000AA",
		/** Every token reads as already used. */
		spent: "3x0000000000000000000000000000000AA",
	},
	/** The token the test site keys produce. */
	dummyToken: "XXXX.DUMMY.TOKEN.XXXX",
} as const;

const TEST_SECRETS: readonly string[] = Object.values(TURNSTILE_TEST_KEYS.secret);

/** Whether a secret is one of Cloudflare's test secrets. */
export function isTurnstileTestSecret(secret: string | null | undefined): boolean {
	return !!secret && TEST_SECRETS.includes(secret);
}

/**
 * Why a check failed:
 * - `missing-token`: no token was sent (or it was not a string of a token's length).
 * - `missing-secret`: the server has no secret, so nothing can be checked.
 * - `rejected`: Cloudflare said no (see `errorCodes`; `timeout-or-duplicate`
 *   is a token used twice or older than five minutes).
 * - `action-mismatch`: the token was issued for another form or page.
 * - `hostname-mismatch`: the token was issued on another site.
 * - `unavailable`: Cloudflare could not be reached in time. Treated as a
 *   failure, so an outage never lets everything through.
 */
export type TurnstileFailure =
	| "missing-token"
	| "missing-secret"
	| "rejected"
	| "action-mismatch"
	| "hostname-mismatch"
	| "unavailable";

export type TurnstileResult =
	| {
			ok: true;
			/** The widget's action, if it set one. */
			action: string | null;
			hostname: string | null;
			/** When the challenge was solved (ISO 8601). */
			challengeTs: string | null;
			/** Whatever the page put in `cData`. */
			cdata: string | null;
	  }
	| { ok: false; reason: TurnstileFailure; errorCodes: string[] };

/** Widget settings shared by the browser loader and the React hook. */
export interface TurnstileWidgetOptions {
	siteKey: string;
	/**
	 * Names the form or page (up to 32 letters, digits, `-` and `_`), so a
	 * token issued for one cannot be spent on another. Check it on the server
	 * with `expectedAction`.
	 */
	action?: string;
	/** Up to 255 characters echoed back to the server as `cdata`. */
	cData?: string;
	theme?: "auto" | "light" | "dark";
	size?: "normal" | "flexible" | "compact";
	/**
	 * `always` shows the widget; `interaction-only` shows it only when the
	 * visitor must click something. Defaults to `always`.
	 */
	appearance?: "always" | "execute" | "interaction-only";
	/** A language code such as "en", or "auto". */
	language?: string;
}
