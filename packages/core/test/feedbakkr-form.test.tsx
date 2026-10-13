// @vitest-environment jsdom
// FeedbakkrForm: renders every v1 and v2 fixture, takes DynamicForm's props,
// follows conditions, and passes axe's accessibility checks.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbakkrForm } from "../src/react/index.js";
import { generateSampleData } from "../src/schema/generate-sample-data.js";
import { type SchemaDslV1, schemaDslV1Schema } from "../src/schema/schema-dsl.js";
import type { SchemaDslV2 } from "../src/schema/schema-dsl-v2.js";
import { validateSubmission } from "../src/submissions/index.js";
import { allFixtures } from "./fixtures.js";

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

const enquiry = JSON.parse(
	readFileSync(join(import.meta.dirname, "../../../fixtures/v2/conditional-enquiry.json"), "utf8"),
) as SchemaDslV2;

async function violations(container: HTMLElement): Promise<string[]> {
	const result = await axe.run(container, {
		rules: { region: { enabled: false } },
	});
	return result.violations.map(
		(v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
	);
}

function submit(container: HTMLElement) {
	return act(async () => {
		fireEvent.submit(container.querySelector("form") as HTMLFormElement);
	});
}

const fixtures = [
	...allFixtures().map(({ name, schema }) => ({
		name,
		schema: schemaDslV1Schema.parse(schema) as SchemaDslV1 | SchemaDslV2,
	})),
	{ name: "v2 conditional-enquiry", schema: enquiry },
];

describe.each(fixtures)("$name", ({ schema }) => {
	it("renders with a label for every control", () => {
		const { container } = render(<FeedbakkrForm schema={schema} onSubmit={() => {}} />);
		for (const control of container.querySelectorAll("input, select, textarea")) {
			const labelled =
				(control as HTMLInputElement).labels?.length || control.getAttribute("aria-label");
			expect(labelled, control.outerHTML).toBeTruthy();
		}
	});

	it("submits valid starting answers as the server would store them", async () => {
		const sample = generateSampleData(schema as SchemaDslV1);
		const expected = validateSubmission(schema, sample, { unknownFields: "strip" });
		const onSubmit = vi.fn();
		const { container } = render(
			<FeedbakkrForm schema={schema} initialValues={sample} onSubmit={onSubmit} />,
		);
		await submit(container);
		if (expected.ok) expect(onSubmit).toHaveBeenCalledWith(expected.values);
		else expect(onSubmit).not.toHaveBeenCalled();
	});
});

describe("accessibility", () => {
	it.each(fixtures.filter((_, i) => i % 10 === 0 || i === fixtures.length - 1))(
		"$name passes axe, before and after a refused submit",
		async ({ schema }) => {
			const { container } = render(<FeedbakkrForm schema={schema} onSubmit={() => {}} />);
			expect(await violations(container)).toEqual([]);
			await submit(container);
			expect(await violations(container)).toEqual([]);
		},
	);

	it("links each error to its control and marks it invalid", async () => {
		const { container } = render(<FeedbakkrForm schema={enquiry} onSubmit={() => {}} />);
		await submit(container);
		const name = screen.getByLabelText(/Your name/);
		expect(name.getAttribute("aria-invalid")).toBe("true");
		expect(name.getAttribute("aria-required")).toBe("true");
		const errorId = name.getAttribute("aria-describedby") ?? "";
		expect(document.getElementById(errorId)?.textContent).toBe("Required");
	});

	it("describes a field by its help as well", () => {
		render(
			<FeedbakkrForm
				schema={enquiry}
				onSubmit={() => {}}
				initialValues={{ enquiryType: "supplier" }}
			/>,
		);
		const volume = screen.getByLabelText(/Expected monthly volume/);
		const helpId = volume.getAttribute("aria-describedby") ?? "";
		expect(document.getElementById(helpId)?.textContent).toBe("Roughly, in cases a month.");
	});
});

describe("DynamicForm's props", () => {
	const contact = schemaDslV1Schema.parse({
		v: 1,
		title: "Contact us",
		fields: [
			{ k: "name", label: "Your name", t: "text", req: true },
			{ k: "page", label: "Page", t: "url", hidden: true },
		],
	});

	it("keep working", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<FeedbakkrForm
				schema={contact}
				onSubmit={onSubmit}
				initialValues={{ page: "https://example.com/" }}
				className="enquiry"
				style={{ maxWidth: "30rem" }}
				submitting
				renderFooter={({ submitting }) => (
					<button type="submit">{submitting ? "Wait" : "Send"}</button>
				)}
			/>,
		);
		const form = container.querySelector("form") as HTMLFormElement;
		expect(form.className).toBe("enquiry");
		expect(form.style.maxWidth).toBe("30rem");
		expect(screen.getByRole("heading").textContent).toBe("Contact us");
		expect(screen.getByRole("button", { name: "Wait" })).toBeTruthy();
		expect(screen.queryByLabelText("Page")).toBeNull();
		fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: " Ada " } });
		await submit(container);
		expect(onSubmit).toHaveBeenCalledWith({ name: "Ada", page: "https://example.com/" });
	});
});

describe("conditions and sections", () => {
	it("shows and hides fields as the answers change", () => {
		render(<FeedbakkrForm schema={enquiry} onSubmit={() => {}} />);
		expect(screen.queryByLabelText(/Expected monthly volume/)).toBeNull();
		fireEvent.change(screen.getByLabelText(/Enquiry type/), { target: { value: "supplier" } });
		expect(screen.getByLabelText(/Expected monthly volume/)).toBeTruthy();
		expect(screen.getByRole("group", { name: "Your business" })).toBeTruthy();
		fireEvent.change(screen.getByLabelText(/Enquiry type/), { target: { value: "other" } });
		expect(screen.queryByLabelText(/Expected monthly volume/)).toBeNull();
		expect(screen.queryByRole("group", { name: "Your business" })).toBeNull();
	});

	it("goes step by step with layout steps, checking each section", async () => {
		const onSubmit = vi.fn();
		const { container } = render(
			<FeedbakkrForm schema={enquiry} onSubmit={onSubmit} layout="steps" />,
		);
		expect(screen.getByRole("group", { name: "About you" })).toBeTruthy();
		expect(screen.queryByLabelText(/Details/)).toBeNull();
		await submit(container);
		expect(screen.getAllByRole("alert")).toHaveLength(3);

		fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Jane" } });
		fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "jane@example.com" } });
		fireEvent.change(screen.getByLabelText(/Enquiry type/), { target: { value: "other" } });
		await submit(container);
		expect(screen.getByRole("group", { name: "Your request" })).toBeTruthy();
		fireEvent.change(screen.getByLabelText(/Details/), { target: { value: "Just saying hello." } });
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.getByRole("group", { name: "About you" })).toBeTruthy();
		await submit(container);
		await submit(container);
		expect(onSubmit).toHaveBeenCalledWith({
			name: "Jane",
			email: "jane@example.com",
			enquiryType: "other",
			details: "Just saying hello.",
		});
	});
});

describe("customising", () => {
	const schema = schemaDslV1Schema.parse({
		v: 1,
		fields: [
			{ k: "email", label: "Email", t: "email", req: true },
			{ k: "visit", label: "Visit", t: "date" },
			{
				k: "tags",
				label: "Tags",
				t: "dynlist",
				item: { k: "t", label: "T", t: "integer", max: 9 },
			},
		],
	});

	it("uses the app's components, widgets and wording", async () => {
		const { container } = render(
			<FeedbakkrForm
				schema={schema}
				onSubmit={() => {}}
				components={{
					Input: (props) => <input className="app-input" {...props} />,
					Button: (props) => <button className="app-button" {...props} />,
				}}
				widgets={{
					date: ({ id, onChange }) => (
						<button type="button" id={id} onClick={() => onChange("2026-07-01")}>
							Pick a date
						</button>
					),
				}}
				strings={{ submit: "Send", errors: { required: "Please fill this in" } }}
			/>,
		);
		expect(screen.getByLabelText(/Email/).className).toBe("app-input");
		expect(screen.getByRole("button", { name: "Send" }).className).toBe("app-button");
		expect(screen.getByRole("button", { name: "Visit" }).textContent).toBe("Pick a date");
		await submit(container);
		expect(screen.getByRole("alert").textContent).toBe("Please fill this in");
	});

	it("shows an error under the list entry it belongs to", async () => {
		const { container } = render(<FeedbakkrForm schema={schema} onSubmit={() => {}} />);
		const list = screen.getByRole("group", { name: "Tags" });
		fireEvent.click(within(list).getByRole("button", { name: "Add item" }));
		fireEvent.click(within(list).getByRole("button", { name: "Add item" }));
		fireEvent.change(within(list).getByLabelText("Item 2"), { target: { value: "12" } });
		fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "a@b.co" } });
		await submit(container);
		const item = within(list).getByLabelText("Item 2");
		expect(item.getAttribute("aria-invalid")).toBe("true");
		expect(document.getElementById(item.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
			"Must be at most 9",
		);
	});

	it("can be controlled, and shows errors the host passes", async () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<FeedbakkrForm
				schema={schema}
				onSubmit={() => {}}
				values={{ email: "x@y.z" }}
				onChange={onChange}
			/>,
		);
		const email = screen.getByLabelText(/Email/) as HTMLInputElement;
		expect(email.value).toBe("x@y.z");
		fireEvent.change(email, { target: { value: "new@y.z" } });
		expect(onChange).toHaveBeenCalledWith({ email: "new@y.z" });
		expect(email.value).toBe("x@y.z");

		rerender(
			<FeedbakkrForm
				schema={schema}
				onSubmit={() => {}}
				values={{ email: "new@y.z" }}
				onChange={onChange}
				errors={{ email: [{ code: "invalid_email", message: "Already registered" }] }}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toBe("Already registered");
	});
});
