// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
	loadTurnstile,
	renderTurnstile,
	resetTurnstileLoaderForTests,
	TURNSTILE_SCRIPT_URL,
} from "../src/browser.js";
import { fakeTurnstile } from "./fake-turnstile.js";

afterEach(() => {
	resetTurnstileLoaderForTests();
	delete window.turnstile;
	for (const s of document.querySelectorAll("script")) s.remove();
});

const scripts = () => [...document.querySelectorAll("script")];

describe("loading the script", () => {
	it("adds one script for any number of widgets, and resolves when it loads", async () => {
		const fake = fakeTurnstile();
		const a = loadTurnstile();
		const b = loadTurnstile();
		expect(scripts().map((s) => s.src)).toEqual([TURNSTILE_SCRIPT_URL]);
		window.turnstile = fake.api;
		window.__fbkTurnstileLoaded?.();
		expect(await a).toBe(fake.api);
		expect(await b).toBe(fake.api);
		expect(await loadTurnstile()).toBe(fake.api);
	});

	it("fails when the script cannot load, and tries again next time", async () => {
		const first = loadTurnstile();
		scripts()[0]?.dispatchEvent(new Event("error"));
		await expect(first).rejects.toThrow("could not be loaded");
		expect(scripts()).toHaveLength(0);
		void loadTurnstile().catch(() => {});
		expect(scripts()).toHaveLength(1);
	});

	it("gives up after the timeout", async () => {
		await expect(loadTurnstile(20)).rejects.toThrow("too long");
	});
});

describe("rendering a widget", () => {
	it("renders explicitly with its settings, and passes on tokens, expiry and errors", async () => {
		const fake = fakeTurnstile();
		window.turnstile = fake.api;
		const events: string[] = [];
		const handle = await renderTurnstile(document.createElement("div"), {
			siteKey: "site",
			action: "contact",
			onToken: (t) => events.push(`token:${t}`),
			onExpire: () => events.push("expired"),
			onError: (c) => events.push(`error:${c}`),
		});
		expect(fake.params()).toMatchObject({
			sitekey: "site",
			action: "contact",
			retry: "auto",
			"refresh-expired": "auto",
			appearance: "always",
		});
		fake.fire("callback", "tok");
		fake.fire("expired-callback");
		expect(fake.params()?.["error-callback"]?.("300030")).toBe(true);
		expect(events).toEqual(["token:tok", "expired", "error:300030"]);
		handle.reset();
		handle.remove();
		handle.remove();
		expect(fake.calls).toMatchObject({ reset: ["w1"], remove: ["w1"] });
		expect(handle.token()).toBeNull();
	});
});
