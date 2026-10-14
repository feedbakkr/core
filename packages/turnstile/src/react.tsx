import { useCallback, useEffect, useRef, useState } from "react";
import { renderTurnstile, type TurnstileHandle } from "./browser.js";
import type { TurnstileWidgetOptions } from "./index.js";

export {
	TURNSTILE_FIELD,
	TURNSTILE_TEST_KEYS,
	type TurnstileWidgetOptions,
} from "./index.js";

/**
 * Where the widget stands:
 * - `disabled`: no site key, so there is nothing to show and nothing to wait for.
 * - `loading`: the script or the widget is on its way.
 * - `waiting`: shown, no token yet (or the last one expired or was used).
 * - `verified`: a token is ready to send.
 * - `error`: the script failed to load, or the widget reported an error.
 */
export type TurnstileState = "disabled" | "loading" | "waiting" | "verified" | "error";

export interface UseTurnstileOptions extends Omit<TurnstileWidgetOptions, "siteKey"> {
	/** Without one the widget is `disabled` and forms send without a token. */
	siteKey?: string | null;
	/** Called with each fresh token. */
	onToken?: (token: string) => void;
}

export interface Turnstile {
	/** Give this to the element the widget renders into (see `TurnstileWidget`). */
	ref: (element: HTMLElement | null) => void;
	token: string | null;
	state: TurnstileState;
	/** Cloudflare's error code, when `state` is `error`. */
	error: string | null;
	/** Whether a form may be sent now: a token is ready, or Turnstile is off. */
	ready: boolean;
	/** Asks for a new token. Call after every submit: a token is good for one check. */
	reset: () => void;
}

/**
 * A Turnstile widget's token and state, for a form built with React.
 *
 * Renders only in the browser, once per element and site key: callbacks are
 * held in refs, so re-rendering the form never rebuilds the widget. Expired
 * tokens refresh themselves; call `reset()` after each submit, successful or
 * not, so a retry never sends a used token.
 */
export function useTurnstile({ siteKey, onToken, ...widget }: UseTurnstileOptions): Turnstile {
	const [element, setElement] = useState<HTMLElement | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [state, setState] = useState<TurnstileState>(siteKey ? "loading" : "disabled");
	const [error, setError] = useState<string | null>(null);
	const handle = useRef<TurnstileHandle | null>(null);
	const onTokenRef = useRef(onToken);
	onTokenRef.current = onToken;

	const { action, cData, theme, size, appearance, language } = widget;

	useEffect(() => {
		if (!siteKey) {
			setState("disabled");
			setToken(null);
			return;
		}
		if (!element) return;
		let cancelled = false;
		setState("loading");
		setToken(null);
		setError(null);
		renderTurnstile(element, {
			siteKey,
			action,
			cData,
			theme,
			size,
			appearance,
			language,
			onToken: (t) => {
				if (cancelled) return;
				setToken(t);
				setState("verified");
				setError(null);
				onTokenRef.current?.(t);
			},
			onExpire: () => {
				if (cancelled) return;
				setToken(null);
				setState("waiting");
			},
			onError: (code) => {
				if (cancelled) return;
				setToken(null);
				setState("error");
				setError(code);
			},
		}).then(
			(h) => {
				if (cancelled) {
					h.remove();
					return;
				}
				handle.current = h;
				setState((s) => (s === "loading" ? "waiting" : s));
			},
			(err: unknown) => {
				if (cancelled) return;
				setState("error");
				setError(err instanceof Error ? err.message : "load-failed");
			},
		);
		return () => {
			cancelled = true;
			handle.current?.remove();
			handle.current = null;
		};
	}, [element, siteKey, action, cData, theme, size, appearance, language]);

	const reset = useCallback(() => {
		if (!handle.current) return;
		handle.current.reset();
		setToken(null);
		setState("waiting");
	}, []);

	return {
		ref: setElement,
		token,
		state,
		error,
		ready: state === "disabled" || token !== null,
		reset,
	};
}

/**
 * Where the widget appears. Renders nothing visible while Turnstile is
 * `disabled`.
 */
export function TurnstileWidget({
	turnstile,
	className,
}: {
	turnstile: Turnstile;
	className?: string;
}) {
	if (turnstile.state === "disabled") return null;
	return <div ref={turnstile.ref} className={className} data-turnstile={turnstile.state} />;
}
