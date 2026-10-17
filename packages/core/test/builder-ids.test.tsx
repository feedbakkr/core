// @vitest-environment jsdom
// Drag-and-drop IDs come from React's useId: unique per builder on a page,
// never part of the schema.
import { act, cleanup, render } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbakkrBuilder } from "../src/builder/index.js";
import type { SchemaDslV1 } from "../src/schema/schema-dsl.js";

afterEach(cleanup);

const contact: SchemaDslV1 = {
	v: 1,
	title: "Contact us",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, max: 100 },
		{ k: "email", label: "Email", t: "email", req: true },
	],
};

/** The accessibility descriptions referenced by drag handles in `root`. */
function describedBy(root: ParentNode): string[] {
	return [
		...new Set(
			[...root.querySelectorAll("[aria-roledescription='sortable']")].map(
				(el) => el.getAttribute("aria-describedby") ?? "",
			),
		),
	];
}

function duplicateIds(): string[] {
	const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
	return ids.filter((id, i) => ids.indexOf(id) !== i);
}

describe("builder drag-and-drop IDs", () => {
	it("are distinct for two builders in one React root", () => {
		const { container } = render(
			<>
				<div data-host="a">
					<FeedbakkrBuilder value={contact} />
				</div>
				<div data-host="b">
					<FeedbakkrBuilder value={contact} />
				</div>
			</>,
		);
		const [a = [], b = []] = [...container.querySelectorAll("[data-host]")].map(describedBy);
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
		expect(a[0]).not.toBe(b[0]);
		for (const id of [...a, ...b]) expect(document.getElementById(id), id).not.toBeNull();
		expect(duplicateIds()).toEqual([]);
	});

	it("are distinct across separate React roots given distinct identifierPrefix values", async () => {
		const hosts = [document.createElement("div"), document.createElement("div")];
		const roots = hosts.map((host, i) => {
			document.body.append(host);
			return createRoot(host, { identifierPrefix: `form${i}-` });
		});
		await act(async () => {
			for (const root of roots) root.render(<FeedbakkrBuilder value={contact} />);
		});
		const [a, b] = hosts.map(describedBy);
		expect(a?.[0]).toBeTruthy();
		expect(a?.[0]).not.toBe(b?.[0]);
		expect(duplicateIds()).toEqual([]);
		await act(async () => {
			for (const root of roots) root.unmount();
		});
		for (const host of hosts) host.remove();
	});

	it("never reach the schema the builder reports", async () => {
		const onChange = vi.fn();
		const { container } = render(<FeedbakkrBuilder value={contact} onChange={onChange} />);
		const id = describedBy(container)[0] ?? "";
		expect(id).not.toBe("");
		// Reorder by keyboard is dnd-kit's; any edit reports the schema, so remove a field.
		const del = container.querySelector<HTMLButtonElement>("button[aria-label^='Delete']");
		expect(del).not.toBeNull();
		await act(async () => del?.click());
		const confirm = [...document.querySelectorAll("button")].find(
			(b) => b.textContent === "Delete",
		);
		if (confirm) await act(async () => confirm.click());
		expect(onChange).toHaveBeenCalled();
		for (const [schema] of onChange.mock.calls) {
			const json = JSON.stringify(schema);
			expect(json).not.toContain(id);
			expect(json).not.toContain("DndDescribedBy");
			expect(Object.keys(schema).sort()).toEqual(
				Object.keys(schema)
					.filter((k) =>
						["v", "title", "fields", "preview", "description", "meta", "sections"].includes(k),
					)
					.sort(),
			);
		}
	});
});
