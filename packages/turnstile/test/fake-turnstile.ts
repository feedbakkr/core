import type { TurnstileApi } from "../src/browser.js";

/** A stand-in for Cloudflare's widget: renders, and lets a test fire its callbacks. */
export function fakeTurnstile() {
	const widgets = new Map<string, Record<string, (...args: unknown[]) => unknown>>();
	const calls = { render: 0, reset: [] as string[], remove: [] as string[] };
	let n = 0;
	const api: TurnstileApi = {
		render: (_container, params) => {
			calls.render++;
			const id = `w${++n}`;
			widgets.set(id, params as never);
			return id;
		},
		reset: (id) => {
			calls.reset.push(id);
		},
		remove: (id) => {
			calls.remove.push(id);
			widgets.delete(id);
		},
		getResponse: () => undefined,
	};
	const fire = (event: "callback" | "expired-callback" | "error-callback", arg?: unknown) => {
		for (const w of widgets.values()) w[event]?.(arg);
	};
	const params = () => [...widgets.values()][0];
	return { api, calls, fire, params };
}
