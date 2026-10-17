// @vitest-environment jsdom
// The builder renders the same HTML on the server and in the browser, so a
// host can server-render it and hydrate without a mismatch (drag-and-drop IDs).
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeedbakkrBuilder } from "../src/builder/index.js";
import type { SchemaDslV1 } from "../src/schema/schema-dsl.js";

const contact: SchemaDslV1 = {
	v: 1,
	title: "Contact us",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, max: 100 },
		{ k: "email", label: "Email", t: "email", req: true },
	],
};

describe("FeedbakkrBuilder server rendering", () => {
	it("gives drag-and-drop the same IDs on every render", () => {
		const first = renderToString(<FeedbakkrBuilder value={contact} />);
		const second = renderToString(<FeedbakkrBuilder value={contact} />);
		expect(first).toContain("aria-describedby");
		expect(second).toBe(first);
	});

	it("hydrates server HTML without a mismatch", async () => {
		// Another render first, as on a server that has handled earlier requests.
		renderToString(<FeedbakkrBuilder value={contact} />);
		const container = document.createElement("div");
		container.innerHTML = renderToString(<FeedbakkrBuilder value={contact} />);
		document.body.append(container);
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const recoverable: unknown[] = [];
		await act(async () => {
			hydrateRoot(container, <FeedbakkrBuilder value={contact} />, {
				onRecoverableError: (error) => recoverable.push(error),
			});
		});
		const mismatches = errors.mock.calls.filter((call) => String(call[0]).includes("didn't match"));
		errors.mockRestore();
		expect(recoverable).toEqual([]);
		expect(mismatches).toEqual([]);
		container.remove();
	});
});
