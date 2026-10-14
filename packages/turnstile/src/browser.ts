import type { TurnstileWidgetOptions } from "./index.js";

export {
	TURNSTILE_FIELD,
	TURNSTILE_TEST_KEYS,
	type TurnstileWidgetOptions,
} from "./index.js";

/** The parts of Cloudflare's `window.turnstile` this package uses. */
export interface TurnstileApi {
	render(container: HTMLElement, params: Record<string, unknown>): string | undefined;
	reset(widgetId: string): void;
	remove(widgetId: string): void;
	getResponse(widgetId: string): string | undefined;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
		__fbkTurnstileLoaded?: () => void;
	}
}

export const TURNSTILE_SCRIPT_URL =
	"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__fbkTurnstileLoaded";

let loading: Promise<TurnstileApi> | null = null;

/**
 * Loads Cloudflare's script once per page, however many widgets ask, and
 * resolves with `window.turnstile`. Rejects on the server (no `window`) and if
 * the script fails to load or takes longer than `timeoutMs`; a later call
 * tries again.
 */
export function loadTurnstile(timeoutMs = 15_000): Promise<TurnstileApi> {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return Promise.reject(new Error("Turnstile runs in the browser only"));
	}
	if (window.turnstile) return Promise.resolve(window.turnstile);
	if (loading) return loading;

	loading = new Promise<TurnstileApi>((resolve, reject) => {
		const timer = setTimeout(() => {
			loading = null;
			reject(new Error("Turnstile took too long to load"));
		}, timeoutMs);
		const done = () => {
			clearTimeout(timer);
			if (window.turnstile) resolve(window.turnstile);
			else {
				loading = null;
				reject(new Error("Turnstile loaded without its API"));
			}
		};
		window.__fbkTurnstileLoaded = done;
		// Another copy of the script (from this package or not) may already be
		// on its way: wait for it rather than adding a second.
		const existing = document.querySelector<HTMLScriptElement>(
			'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
		);
		if (existing) {
			existing.addEventListener("load", () => setTimeout(done, 0), { once: true });
			return;
		}
		const script = document.createElement("script");
		script.src = TURNSTILE_SCRIPT_URL;
		script.async = true;
		script.defer = true;
		script.addEventListener(
			"error",
			() => {
				clearTimeout(timer);
				loading = null;
				script.remove();
				reject(new Error("Turnstile could not be loaded"));
			},
			{ once: true },
		);
		document.head.appendChild(script);
	});
	return loading;
}

export interface TurnstileCallbacks {
	/** A fresh token, good for one check within five minutes. */
	onToken: (token: string) => void;
	/** The token ran out before it was used; a new one follows on its own. */
	onExpire?: () => void;
	/** The widget failed (network, or the visitor could not be verified). */
	onError?: (code: string) => void;
}

/** One widget on the page. */
export interface TurnstileHandle {
	/** Starts again for a new token: after every submit, as tokens are single use. */
	reset(): void;
	remove(): void;
	/** The current token, if any. */
	token(): string | null;
}

/**
 * Renders a widget into `container` (explicit rendering, so it never runs on
 * the server). Expired tokens refresh themselves and failures retry, as
 * Cloudflare does by default.
 */
export async function renderTurnstile(
	container: HTMLElement,
	options: TurnstileWidgetOptions & TurnstileCallbacks,
): Promise<TurnstileHandle> {
	const api = await loadTurnstile();
	const id = api.render(container, {
		sitekey: options.siteKey,
		...(options.action ? { action: options.action } : {}),
		...(options.cData ? { cData: options.cData } : {}),
		theme: options.theme ?? "auto",
		size: options.size ?? "flexible",
		appearance: options.appearance ?? "always",
		...(options.language ? { language: options.language } : {}),
		retry: "auto",
		"refresh-expired": "auto",
		callback: (token: string) => options.onToken(token),
		"expired-callback": () => options.onExpire?.(),
		"timeout-callback": () => options.onExpire?.(),
		"error-callback": (code: string) => {
			options.onError?.(String(code));
			// Handled: Cloudflare retries on its own.
			return true;
		},
	});
	if (!id) throw new Error("Turnstile did not render");
	let removed = false;
	return {
		reset: () => {
			if (!removed) api.reset(id);
		},
		remove: () => {
			if (removed) return;
			removed = true;
			api.remove(id);
		},
		token: () => (removed ? null : (api.getResponse(id) ?? null)),
	};
}

/** For tests: forget the loaded script so the next call loads it again. */
export function resetTurnstileLoaderForTests(): void {
	loading = null;
}
