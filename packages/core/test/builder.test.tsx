// @vitest-environment jsdom
// FeedbakkrBuilder through its props: edits reach onChange, saves are checked,
// dirty state is reported, and a new value replaces the state.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
	preview: { mode: "custom", fields: ["name"] },
};

/** The field list comes before the preview, which repeats the labels. */
function inList(text: string) {
	return screen.getAllByText(text)[0] as HTMLElement;
}

function last<T>(fn: { mock: { calls: T[][] } }): T {
	return fn.mock.calls.at(-1)?.[0] as T;
}

function addField(label: string, type?: string) {
	fireEvent.change(screen.getByPlaceholderText("e.g. Full Name"), { target: { value: label } });
	if (type) fireEvent.change(screen.getByDisplayValue("Short text"), { target: { value: type } });
	fireEvent.click(screen.getByRole("button", { name: "Add" }));
}

describe("FeedbakkrBuilder", () => {
	it("lists the fields and adds one, with a key made from its label", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={contact} onChange={onChange} />);
		expect(inList("Your name")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "2 fields" })).toBeTruthy();

		addField("Phone number", "phone");
		const next = last<SchemaDslV1>(onChange);
		expect(next.fields.at(-1)).toEqual({ k: "phoneNumber", label: "Phone number", t: "phone" });
		expect(next.title).toBe("Contact us");
		expect(screen.getByRole("heading", { name: "3 fields" })).toBeTruthy();
	});

	it("refuses a key that is already used", () => {
		render(<FeedbakkrBuilder value={contact} />);
		fireEvent.change(screen.getByPlaceholderText("e.g. Full Name"), { target: { value: "Email" } });
		expect(screen.getByText("A field with this key already exists.")).toBeTruthy();
		expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("edits a field in its dialog", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={contact} onChange={onChange} />);
		fireEvent.click(inList("Email"));
		const dialog = screen.getByRole("dialog");
		// The label input; the type select also shows "Email".
		const [label] = within(dialog).getAllByDisplayValue("Email");
		fireEvent.change(label as HTMLElement, { target: { value: "Work email" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(last<SchemaDslV1>(onChange).fields[1]).toMatchObject({
			k: "email",
			label: "Work email",
		});
	});

	it("deletes a field, updates the preview and says so", () => {
		const onChange = vi.fn();
		const onNotify = vi.fn();
		render(<FeedbakkrBuilder value={contact} onChange={onChange} onNotify={onNotify} />);
		fireEvent.click(screen.getByRole("button", { name: "Delete Your name" }));
		expect(last<SchemaDslV1>(onChange)).toMatchObject({
			fields: [{ k: "email" }],
			preview: { mode: "auto" },
		});
		expect(onNotify).toHaveBeenCalledWith({
			type: "info",
			message: "Preview configuration has been updated because a referenced field was removed.",
		});
	});

	it("checks the schema before saving, and reports dirty state", async () => {
		const onSave = vi.fn();
		const onDirtyChange = vi.fn();
		const onNotify = vi.fn();
		render(
			<FeedbakkrBuilder
				value={contact}
				onSave={onSave}
				onDirtyChange={onDirtyChange}
				onNotify={onNotify}
			/>,
		);
		const save = screen.getByRole("button", { name: "Save Changes" }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);

		addField("Message", "textarea");
		expect(onDirtyChange).toHaveBeenLastCalledWith(true);
		expect(screen.getByText("Unsaved changes")).toBeTruthy();

		await act(async () => fireEvent.click(save));
		expect(last<SchemaDslV1>(onSave).fields.map((f) => f.k)).toEqual(["name", "email", "message"]);
		expect(onDirtyChange).toHaveBeenLastCalledWith(false);
		expect(onNotify).toHaveBeenCalledWith({ type: "success", message: "Draft saved." });
	});

	it("does not save a schema that fails the checks, and shows why", async () => {
		const onSave = vi.fn();
		const bad = {
			v: 1,
			fields: [{ k: "size", label: "Size", t: "fixed", opts: [{ k: "s" }], default: "xl" }],
		} as SchemaDslV1;
		render(<FeedbakkrBuilder value={bad} onSave={onSave} />);
		addField("Notes");
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" })));
		expect(onSave).not.toHaveBeenCalled();
		expect(screen.getByText(/default/i)).toBeTruthy();
	});

	it("shows a save that failed", async () => {
		const onSave = vi.fn().mockRejectedValue(new Error("The server is down"));
		render(<FeedbakkrBuilder value={contact} onSave={onSave} />);
		addField("Notes");
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" })));
		expect(screen.getByText("The server is down")).toBeTruthy();
		expect(screen.getByText("Unsaved changes")).toBeTruthy();
	});

	it("takes a new value from the host, but not its own echo", () => {
		const onChange = vi.fn();
		const view = render(<FeedbakkrBuilder value={contact} onChange={onChange} />);
		addField("Notes");
		const echoed = last<SchemaDslV1>(onChange);
		view.rerender(<FeedbakkrBuilder value={echoed} onChange={onChange} />);
		expect(screen.getByRole("heading", { name: "3 fields" })).toBeTruthy();
		expect(onChange).toHaveBeenCalledTimes(1);

		const other: SchemaDslV1 = { v: 1, fields: [{ k: "only", label: "Only", t: "text" }] };
		view.rerender(<FeedbakkrBuilder value={other} onChange={onChange} />);
		expect(screen.getByRole("heading", { name: "1 field" })).toBeTruthy();
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it("keeps every edit when the host does not pass the schema back", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={contact} onChange={onChange} />);
		addField("Phone");
		addField("Notes");
		expect(screen.getByRole("heading", { name: "4 fields" })).toBeTruthy();
		expect(last<SchemaDslV1>(onChange).fields.map((f) => f.k)).toEqual([
			"name",
			"email",
			"phone",
			"notes",
		]);
	});

	it("shows but does not edit a read-only schema", () => {
		render(<FeedbakkrBuilder value={contact} readOnly onSave={() => {}} />);
		expect(inList("Your name")).toBeTruthy();
		expect(screen.queryByPlaceholderText("e.g. Full Name")).toBeNull();
		expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
		expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
	});

	it("previews the form and checks answers locally", () => {
		render(<FeedbakkrBuilder value={contact} />);
		const preview = screen.getByRole("region", { name: "Preview" });
		fireEvent.change(within(preview).getByLabelText(/Your name/), { target: { value: "Ada" } });
		fireEvent.change(within(preview).getByLabelText(/Email/), {
			target: { value: "ada@example.com" },
		});
		fireEvent.click(within(preview).getByRole("button", { name: "Check answers" }));
		// Shown as the message they make, not as data.
		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("These answers pass the form's checks.");
		expect(dialog.textContent).toContain("Your name");
		expect(dialog.textContent).toContain("Ada");
		expect(dialog.textContent).toContain("ada@example.com");
		expect(dialog.textContent).not.toContain('"email"');
		// The summary is labelled, so it isn't mistaken for an answer.
		expect(within(dialog).getByText("Inbox summary")).toBeTruthy();

		// The same answers as data, to copy.
		fireEvent.click(within(dialog).getByRole("button", { name: "JSON" }));
		const json = JSON.parse(dialog.querySelector("pre code")?.textContent ?? "");
		expect(json).toMatchObject({ name: "Ada", email: "ada@example.com" });
		expect(within(dialog).getByRole("button", { name: "Copy to clipboard" })).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Message" }));
		expect(dialog.textContent).toContain("ada@example.com");
	});

	it("hides the preview when the host offers its own test", () => {
		const onTest = vi.fn();
		render(<FeedbakkrBuilder value={contact} showPreview={false} onTest={onTest} />);
		expect(screen.queryByRole("region", { name: "Preview" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Test the form" }));
		expect(onTest).toHaveBeenCalledOnce();
	});

	it("leaves the inbox summary out of checked answers when the host builds its own labels", () => {
		render(<FeedbakkrBuilder value={contact} showInboxPreview={false} />);
		const preview = screen.getByRole("region", { name: "Preview" });
		fireEvent.change(within(preview).getByLabelText(/Your name/), { target: { value: "Ada" } });
		fireEvent.change(within(preview).getByLabelText(/Email/), {
			target: { value: "ada@example.com" },
		});
		fireEvent.click(within(preview).getByRole("button", { name: "Check answers" }));
		const dialog = screen.getByRole("dialog");
		expect(within(dialog).queryByText("Inbox summary")).toBeNull();
		expect(dialog.textContent).toContain("Ada");
	});

	it("hides the inbox summary setting when the host asks, and keeps the schema's preview", () => {
		const noPreview: SchemaDslV1 = { ...contact, preview: undefined };
		const { unmount } = render(<FeedbakkrBuilder value={noPreview} simple />);
		expect(screen.getByText("Inbox preview not configured")).toBeTruthy();
		unmount();

		const onChange = vi.fn();
		render(
			<FeedbakkrBuilder value={noPreview} simple showInboxPreview={false} onChange={onChange} />,
		);
		expect(screen.queryByText("Inbox preview not configured")).toBeNull();
		expect(screen.queryByRole("button", { name: "Enable Auto Preview" })).toBeNull();
		addField("Topic");
		expect(last(onChange)).not.toHaveProperty("preview");
	});

	it("starts empty with the add row and template import", () => {
		render(<FeedbakkrBuilder value={{ v: 1, fields: [] }} />);
		expect(screen.getByText("No fields yet")).toBeTruthy();
		expect(screen.getByText("Load from Template")).toBeTruthy();
	});

	it("exports the schema as text", () => {
		render(<FeedbakkrBuilder value={contact} />);
		fireEvent.click(screen.getByRole("button", { name: "Export" }));
		fireEvent.click(screen.getByText("Text DSL"));
		expect(screen.getByRole("dialog").textContent).toContain('name: text "Your name" required');
	});
});

describe("field type guidance", () => {
	it("puts every field type in exactly one group, with guidance", async () => {
		const { FIELD_TYPE_GROUPS, FIELD_TYPE_GUIDE } = await import(
			"../src/builder/field-type-guide.js"
		);
		const { FIELD_TYPES } = await import("../src/schema/schema-dsl.js");
		const grouped = FIELD_TYPE_GROUPS.flatMap((g: { types: string[] }) => g.types);
		expect([...grouped].sort()).toEqual([...FIELD_TYPES].sort());
		for (const t of FIELD_TYPES) {
			expect(FIELD_TYPE_GUIDE[t].what).toBeTruthy();
			// Read after "For example:", so it starts in lower case.
			expect(FIELD_TYPE_GUIDE[t].example).toMatch(/^[a-z]/);
		}
	});

	it("explains the chosen type, and opens a guide to all of them", () => {
		render(<FeedbakkrBuilder value={contact} />);
		const type = screen.getByRole("combobox", { name: /Type/ });
		const hint = document.getElementById(type.getAttribute("aria-describedby") ?? "");
		expect(hint?.textContent).toContain(
			"Short text: One line of text. For example: a name, a subject or an order number.",
		);
		fireEvent.change(type, { target: { value: "fixed" } });
		expect(hint?.textContent).toContain(
			"Choice from a list: One option, picked from a list you write.",
		);

		const [guideButton] = screen.getAllByRole("button", { name: "Which type should I use?" });
		if (!guideButton) throw new Error("no guide button");
		fireEvent.click(guideButton);
		const guide = screen.getByRole("dialog", { name: "Field types" });
		for (const group of [
			"Text",
			"Contact details",
			"Dates and times",
			"Numbers",
			"Choices and lists",
		])
			expect(within(guide).getByRole("heading", { name: group })).toBeTruthy();
		expect(guide.textContent).toContain("List of entries");
	});
});
