// @vitest-environment jsdom
// The builder's v2 controls: conditions, sections, help and placeholder,
// locked fields, and the preview following conditions.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbakkrBuilder } from "../src/builder/index.js";
import type { SchemaDsl, SchemaDslV2 } from "../src/schema/schema-dsl-v2.js";

afterEach(cleanup);

const start: SchemaDsl = {
	v: 1,
	fields: [
		{
			k: "kind",
			label: "Enquiry type",
			t: "fixed",
			req: true,
			opts: [
				{ k: "supplier", label: "Supplier" },
				{ k: "other", label: "Other" },
			],
		},
		{ k: "volume", label: "Volume", t: "integer" },
		{ k: "email", label: "Email", t: "email", req: true },
	],
};

function last(fn: { mock: { calls: unknown[][] } }): SchemaDsl {
	return fn.mock.calls.at(-1)?.[0] as SchemaDsl;
}

/** The field list comes before the preview, which repeats the labels. */
function row(label: string) {
	return screen.getAllByText(label)[0] as HTMLElement;
}

function openField(label: string) {
	fireEvent.click(row(label));
	return screen.getByRole("dialog");
}

describe("conditions", () => {
	it("are edited as 'Show this field only when ...', and make the schema v2", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={start} onChange={onChange} allowV2 />);
		const dialog = openField("Volume");
		fireEvent.change(within(dialog).getByLabelText("Show this field"), {
			target: { value: "when" },
		});
		expect((within(dialog).getByLabelText("Field") as HTMLSelectElement).value).toBe("kind");
		fireEvent.change(within(dialog).getByLabelText("Value"), { target: { value: "supplier" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

		const schema = last(onChange) as SchemaDslV2;
		expect(schema.v).toBe(2);
		expect(schema.fields[1]).toMatchObject({ when: { k: "kind", eq: "supplier" } });
		expect(screen.getByText("when kind = supplier")).toBeTruthy();
	});

	it("offer only fields above the one being edited", () => {
		render(<FeedbakkrBuilder value={start} allowV2 />);
		const dialog = openField("Email");
		fireEvent.change(within(dialog).getByLabelText("Show this field"), {
			target: { value: "when" },
		});
		const options = within(within(dialog).getByLabelText("Field")).getAllByRole("option");
		expect(options.map((o) => o.textContent)).toEqual(["Enquiry type", "Volume"]);
	});

	it("go back to v1 when the last one is removed", () => {
		const onChange = vi.fn();
		const v2: SchemaDsl = {
			...start,
			v: 2,
			fields: start.fields.map((f) =>
				f.k === "volume" ? { ...f, when: { k: "kind", eq: "supplier" } } : f,
			),
		} as SchemaDslV2;
		render(<FeedbakkrBuilder value={v2} onChange={onChange} />);
		const dialog = openField("Volume");
		fireEvent.change(within(dialog).getByLabelText("Show this field"), {
			target: { value: "always" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(last(onChange)).toEqual(start);
	});

	it("drive the preview", () => {
		const v2 = {
			...start,
			v: 2,
			fields: start.fields.map((f) =>
				f.k === "volume" ? { ...f, when: { k: "kind", eq: "supplier" } } : f,
			),
		} as SchemaDslV2;
		render(<FeedbakkrBuilder value={v2} />);
		const preview = screen.getByRole("region", { name: "Preview" });
		expect(within(preview).queryByLabelText(/Volume/)).toBeNull();
		fireEvent.change(within(preview).getByLabelText(/Enquiry type/), {
			target: { value: "supplier" },
		});
		expect(within(preview).getByLabelText(/Volume/)).toBeTruthy();
	});

	it("are not offered unless asked for", () => {
		render(<FeedbakkrBuilder value={start} />);
		const dialog = openField("Volume");
		expect(within(dialog).queryByLabelText("Show this field")).toBeNull();
		expect(within(dialog).queryByLabelText("Help text")).toBeNull();
		expect(screen.queryByRole("button", { name: "Group into sections" })).toBeNull();
	});
});

describe("help and placeholder", () => {
	it("are saved on the field", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={start} onChange={onChange} allowV2 />);
		const dialog = openField("Email");
		fireEvent.change(within(dialog).getByLabelText("Help text"), {
			target: { value: "We reply here" },
		});
		fireEvent.change(within(dialog).getByLabelText("Placeholder"), {
			target: { value: "you@example.com" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(last(onChange).fields[2]).toMatchObject({
			help: "We reply here",
			placeholder: "you@example.com",
		});
	});
});

describe("sections", () => {
	it("are made by grouping, split at a field, renamed and given a condition", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={start} onChange={onChange} allowV2 />);
		fireEvent.click(screen.getByRole("button", { name: "Group into sections" }));
		fireEvent.click(screen.getByRole("button", { name: "Add a section break above Volume" }));
		expect((last(onChange) as SchemaDslV2).sections?.map((s) => s.fields)).toEqual([
			["kind"],
			["volume", "email"],
		]);

		fireEvent.click(screen.getByRole("button", { name: "Edit section Section 2" }));
		const dialog = screen.getByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "Business" } });
		fireEvent.change(within(dialog).getByLabelText("Show this section"), {
			target: { value: "when" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
		expect((last(onChange) as SchemaDslV2).sections?.[1]).toEqual({
			id: "section_2",
			title: "Business",
			fields: ["volume", "email"],
			when: { k: "kind", eq: "supplier" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Remove section Business" }));
		expect((last(onChange) as SchemaDslV2).sections).toEqual([
			{ id: "section_1", fields: ["kind", "volume", "email"] },
		]);
	});

	it("show in the preview", () => {
		const v2 = {
			...start,
			v: 2,
			sections: [
				{ id: "a", title: "About you", fields: ["kind"] },
				{ id: "b", title: "More", fields: ["volume", "email"] },
			],
		} as SchemaDslV2;
		render(<FeedbakkrBuilder value={v2} />);
		const preview = screen.getByRole("region", { name: "Preview" });
		expect(within(preview).getByRole("group", { name: "About you" })).toBeTruthy();
	});
});

describe("locked fields", () => {
	it("cannot be deleted, renamed or change type", () => {
		render(<FeedbakkrBuilder value={start} lockedFields={["email"]} />);
		expect(screen.queryByRole("button", { name: "Delete Email" })).toBeNull();
		expect(screen.getByRole("button", { name: "Delete Volume" })).toBeTruthy();
		const dialog = openField("Email");
		const [key] = within(dialog).getAllByDisplayValue("email");
		expect((key as HTMLInputElement).disabled).toBe(true);
		// The label input (the type select also shows "Email", and is locked).
		const [label, type] = within(dialog).getAllByDisplayValue("Email");
		expect((label as HTMLInputElement).disabled).toBe(false);
		expect((type as HTMLSelectElement).disabled).toBe(true);
	});

	it("say why they stay, where the delete button would be", () => {
		render(
			<FeedbakkrBuilder
				value={start}
				lockedFields={["email"]}
				lockedReason="Your replies go to this address."
			/>,
		);
		expect(screen.getByTitle("Your replies go to this address.")).toBeTruthy();
	});
});

describe("the toolbar", () => {
	it("heads the list with how many questions it holds, in plain words when simple", () => {
		render(<FeedbakkrBuilder value={start} simple />);
		expect(screen.getByRole("heading", { name: "3 questions" }).textContent).toBe("Questions3");
	});

	it("has room for the host's own controls", () => {
		render(
			<FeedbakkrBuilder value={start} simple toolbar={<button type="button">Titles</button>} />,
		);
		expect(screen.getByRole("button", { name: "Titles" })).toBeTruthy();
	});
});

describe("saving", () => {
	it("checks a v2 schema as v2, and reports a broken condition", async () => {
		const onSave = vi.fn();
		const broken = {
			...start,
			v: 2,
			fields: [
				{ ...start.fields[1], when: { k: "kind", eq: "supplier" } },
				start.fields[0],
				start.fields[2],
			],
		} as SchemaDslV2;
		render(<FeedbakkrBuilder value={broken} onSave={onSave} />);
		fireEvent.change(screen.getByPlaceholderText("e.g. Full Name"), { target: { value: "Notes" } });
		fireEvent.click(screen.getByRole("button", { name: "Add" }));
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" })));
		expect(onSave).not.toHaveBeenCalled();
		expect(screen.getAllByText(/does not come before it/).length).toBeGreaterThan(0);
	});

	it("is done in one go when the host answers with its stored, tidied copy", async () => {
		const dirty: boolean[] = [];
		function Host() {
			const [value, setValue] = useState<SchemaDsl>(start);
			return (
				<FeedbakkrBuilder
					value={value}
					onDirtyChange={(d) => dirty.push(d)}
					onSave={async (schema) => {
						// The server stores it with a little more, as a real one might.
						setValue({ ...schema, title: "Stored" });
					}}
				/>
			);
		}
		render(<Host />);
		fireEvent.change(screen.getByPlaceholderText("e.g. Full Name"), { target: { value: "Notes" } });
		fireEvent.click(screen.getByRole("button", { name: "Add" }));
		expect(dirty.at(-1)).toBe(true);
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" })));
		expect(dirty.at(-1)).toBe(false);
	});
});

describe("the reply address", () => {
	const twoEmails: SchemaDsl = {
		v: 1,
		fields: [...start.fields, { k: "other", label: "Colleague email", t: "email" }],
	};

	it("is offered on email fields only, makes the schema v2, and moves rather than doubles", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={twoEmails} onChange={onChange} allowV2 />);
		let dialog = openField("Volume");
		expect(within(dialog).queryByLabelText(/Reply address/)).toBeNull();
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

		dialog = openField("Email");
		fireEvent.click(within(dialog).getByLabelText(/Reply address/));
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
		let schema = last(onChange) as SchemaDslV2;
		expect(schema.v).toBe(2);
		expect(schema.fields.filter((f) => f.replyTo).map((f) => f.k)).toEqual(["email"]);

		dialog = openField("Colleague email");
		fireEvent.click(within(dialog).getByLabelText(/Reply address/));
		fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
		schema = last(onChange) as SchemaDslV2;
		expect(schema.fields.filter((f) => f.replyTo).map((f) => f.k)).toEqual(["other"]);
	});
});

describe("simple mode", () => {
	it("leaves out the developer tools, and offers a test instead of the preview", () => {
		const onTest = vi.fn();
		render(<FeedbakkrBuilder value={start} allowV2 simple onTest={onTest} />);
		expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
		expect(screen.queryByText(/Validation schemas/)).toBeNull();
		expect(screen.queryByRole("region", { name: "Preview" })).toBeNull();
		// Keys are not shown or asked for; the inbox summary setting stays.
		expect(screen.queryByText("volume")).toBeNull();
		expect(screen.queryByPlaceholderText("e.g. fullName")).toBeNull();
		expect(screen.getByText(/Inbox Preview/i)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Test the form" }));
		expect(onTest).toHaveBeenCalled();
	});

	it("makes keys from labels, numbered when taken", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={start} onChange={onChange} simple />);
		fireEvent.change(screen.getByPlaceholderText("e.g. Full Name"), { target: { value: "Email" } });
		fireEvent.click(screen.getByRole("button", { name: "Add" }));
		expect(last(onChange).fields.at(-1)?.k).toBe("email2");
	});

	it("hides key, meta and default value when editing a field", () => {
		render(<FeedbakkrBuilder value={start} simple />);
		const dialog = openField("Volume");
		expect(within(dialog).queryByText("Key")).toBeNull();
		expect(within(dialog).queryByText(/meta/i)).toBeNull();
		expect(within(dialog).queryByText("Hidden field")).toBeNull();
	});
});

describe("untitled sections", () => {
	it("are numbered by their place, and a name is optional", () => {
		const onChange = vi.fn();
		render(<FeedbakkrBuilder value={start} onChange={onChange} allowV2 />);
		fireEvent.click(screen.getByRole("button", { name: "Group into sections" }));
		const grouped = last(onChange) as SchemaDslV2;
		expect(grouped.sections?.[0]?.title).toBeUndefined();
		expect(screen.getAllByText("Section 1").length).toBeGreaterThan(0);
	});
});
