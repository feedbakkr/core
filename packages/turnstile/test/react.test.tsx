// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetTurnstileLoaderForTests } from "../src/browser.js";
import { TurnstileWidget, type UseTurnstileOptions, useTurnstile } from "../src/react.js";
import { fakeTurnstile } from "./fake-turnstile.js";

let fake: ReturnType<typeof fakeTurnstile>;
beforeEach(() => {
	fake = fakeTurnstile();
	window.turnstile = fake.api;
});
afterEach(() => {
	cleanup();
	resetTurnstileLoaderForTests();
	delete window.turnstile;
});

/** A form that shows the hook's state, and re-renders on a click. */
function Form(props: UseTurnstileOptions) {
	const turnstile = useTurnstile(props);
	const [renders, setRenders] = useState(0);
	return (
		<div>
			<TurnstileWidget turnstile={turnstile} />
			<p data-testid="state">
				{turnstile.state}|{turnstile.token ?? "-"}|{String(turnstile.ready)}
			</p>
			<button type="button" onClick={() => setRenders(renders + 1)}>
				rerender
			</button>
			<button type="button" onClick={turnstile.reset}>
				reset
			</button>
		</div>
	);
}

const state = () => screen.getByTestId("state").textContent;
const flush = () => act(async () => {});

describe("useTurnstile", () => {
	it("is off without a site key, and lets the form send", () => {
		render(<Form siteKey={null} />);
		expect(state()).toBe("disabled|-|true");
		expect(fake.calls.render).toBe(0);
	});

	it("waits for a token, and holds the form until there is one", async () => {
		render(<Form siteKey="site" action="contact" />);
		await flush();
		expect(state()).toBe("waiting|-|false");
		act(() => fake.fire("callback", "tok"));
		expect(state()).toBe("verified|tok|true");
	});

	it("renders the widget once however often the form re-renders", async () => {
		render(<Form siteKey="site" onToken={() => {}} />);
		await flush();
		for (let i = 0; i < 3; i++) act(() => screen.getByText("rerender").click());
		await flush();
		expect(fake.calls.render).toBe(1);
	});

	it("drops a used token on reset, and an expired one by itself", async () => {
		render(<Form siteKey="site" />);
		await flush();
		act(() => fake.fire("callback", "tok"));
		act(() => screen.getByText("reset").click());
		expect(state()).toBe("waiting|-|false");
		expect(fake.calls.reset).toEqual(["w1"]);
		act(() => fake.fire("callback", "tok2"));
		act(() => fake.fire("expired-callback"));
		expect(state()).toBe("waiting|-|false");
	});

	it("reports an error, and removes the widget when the form goes", async () => {
		const { unmount } = render(<Form siteKey="site" />);
		await flush();
		act(() => {
			fake.params()?.["error-callback"]?.("110200");
		});
		expect(state()).toBe("error|-|false");
		unmount();
		expect(fake.calls.remove).toEqual(["w1"]);
	});
});
