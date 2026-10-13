// @vitest-environment jsdom
// DynamicForm in core must render and submit exactly as FeedBakkr's does. Each
// fixture renders through core and through the verbatim copy in
// test/reference/feedbakkr-8ae744e/dynamic-form.tsx, and the HTML and the
// submitted values must match.
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DynamicForm, type DynamicFormProps } from "../src/react/index.js";
import { generateSampleData } from "../src/schema/generate-sample-data.js";
import { generateZod } from "../src/schema/generate-zod.js";
import { type SchemaDslV1, schemaDslV1Schema } from "../src/schema/schema-dsl.js";
import { allFixtures } from "./fixtures.js";
import { DynamicForm as RefDynamicForm } from "./reference/feedbakkr-8ae744e/dynamic-form.js";

// Date bounds such as "today" are resolved when the form renders.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

type Form = ComponentType<DynamicFormProps>;

/** Renders a form, optionally acts on it, submits it and reports what happened. */
function run(
	Form: Form,
	props: Omit<DynamicFormProps, "onSubmit">,
	act?: (form: HTMLElement) => void,
) {
	const onSubmit = vi.fn();
	const { container } = render(<Form {...props} onSubmit={onSubmit} />);
	const form = container.querySelector("form") as HTMLFormElement;
	act?.(form);
	const before = form.outerHTML;
	fireEvent.submit(form);
	return { before, after: form.outerHTML, submitted: onSubmit.mock.calls };
}

function both(props: Omit<DynamicFormProps, "onSubmit">, act?: (form: HTMLElement) => void) {
	const core = run(DynamicForm, props, act);
	cleanup();
	const ref = run(RefDynamicForm as Form, props, act);
	return { core, ref };
}

/** Presses "+ Add Item" twice on every list, adding two empty entries to each. */
function addTwoItemsToEveryList(form: HTMLElement) {
	for (const button of within(form).queryAllByRole("button", { name: "+ Add Item" })) {
		fireEvent.click(button);
		fireEvent.click(button);
	}
}

const fixtures = allFixtures().map(({ name, schema }) => ({
	name,
	schema: schemaDslV1Schema.parse(schema) as SchemaDslV1,
}));

describe.each(fixtures)("$name", ({ schema }) => {
	it("renders, shows errors and submits exactly as FeedBakkr does", () => {
		const { core, ref } = both({ schema });
		expect(core).toEqual(ref);
	});

	it("submits valid starting values exactly as FeedBakkr does", () => {
		const initialValues = generateSampleData(schema);
		const { core, ref } = both({ schema, initialValues });
		expect(core).toEqual(ref);
		if (generateZod(schema).safeParse(initialValues).success) {
			expect(core.submitted).toHaveLength(1);
		}
	});

	it("adds list items exactly as FeedBakkr does", () => {
		const { core, ref } = both({ schema }, addTwoItemsToEveryList);
		expect(core).toEqual(ref);
	});

	it("submits only answers the server check accepts after a JSON round trip", () => {
		const initialValues = generateSampleData(schema);
		const server = generateZod(schema);
		for (const act of [undefined, addTwoItemsToEveryList]) {
			const { core, ref } = both({ schema, initialValues }, act);
			// The form renders as FeedBakkr's does; only what it submits differs.
			expect(core.before).toEqual(ref.before);
			for (const [answers] of core.submitted) {
				const sent = JSON.parse(JSON.stringify(answers));
				expect(server.safeParse(sent).success, JSON.stringify(sent)).toBe(true);
			}
		}
	});

	it("gives every control a label", () => {
		const { container } = render(<DynamicForm schema={schema} onSubmit={() => {}} />);
		for (const control of container.querySelectorAll("input, select, textarea")) {
			const labelled =
				(control as HTMLInputElement).labels?.length || control.getAttribute("aria-label");
			expect(labelled, control.outerHTML).toBeTruthy();
		}
	});
});

const contact = schemaDslV1Schema.parse({
	v: 1,
	title: "Contact us",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, min: 1, max: 100 },
		{ k: "email", label: "Email", t: "email", req: true },
		{
			k: "topic",
			label: "Topic",
			t: "fixed",
			req: true,
			opts: [{ k: "order", label: "An order" }, { k: "other" }],
		},
		{ k: "guests", label: "Guests", t: "integer", min: 1, max: 8 },
		{ k: "subscribe", label: "Send me news", t: "bool" },
		{ k: "page", label: "Page", t: "url", hidden: true },
	],
});

describe("DynamicForm", () => {
	it("submits what the person enters, with hidden values from initialValues", () => {
		const onSubmit = vi.fn();
		const view = render(
			<DynamicForm
				schema={contact}
				initialValues={{ page: "https://example.com/contact" }}
				onSubmit={onSubmit}
			/>,
		);
		fireEvent.change(view.getByLabelText(/Your name/), { target: { value: "Ada" } });
		fireEvent.change(view.getByLabelText(/Email/), { target: { value: "ada@example.com" } });
		fireEvent.change(view.getByLabelText(/Topic/), { target: { value: "order" } });
		fireEvent.change(view.getByLabelText(/Guests/), { target: { value: "2" } });
		fireEvent.click(view.getByLabelText(/Send me news/));
		expect(view.queryByLabelText(/Page/)).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Submit" }));
		expect(onSubmit).toHaveBeenCalledWith({
			name: "Ada",
			email: "ada@example.com",
			topic: "order",
			guests: 2,
			subscribe: true,
			page: "https://example.com/contact",
		});
	});

	it("shows each error under its field and clears it when the field changes", () => {
		const onSubmit = vi.fn();
		const view = render(<DynamicForm schema={contact} onSubmit={onSubmit} />);
		fireEvent.change(view.getByLabelText(/Email/), { target: { value: "not an email" } });
		// A browser would stop a click on Submit with its own email check first.
		fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
		expect(onSubmit).not.toHaveBeenCalled();

		const email = view.getByLabelText(/Email/);
		const wrapper = email.closest("label")?.parentElement as HTMLElement;
		expect(wrapper.querySelector("p")?.textContent).toBeTruthy();
		fireEvent.change(email, { target: { value: "ada@example.com" } });
		expect(wrapper.querySelector("p")).toBeNull();
	});

	it.todo("links each error to its control with aria-describedby (milestone 9)");

	// Intentional difference 12 (see intentional-differences.test.ts).
	it("drops list entries that were added but left empty", () => {
		const schema = schemaDslV1Schema.parse({
			v: 1,
			fields: [
				{
					k: "dietary",
					label: "Dietary needs",
					t: "dynlist",
					item: { k: "need", label: "Need", t: "text" },
				},
				{ k: "extras", label: "Extras", t: "dynlist", item: { k: "x", label: "X", t: "text" } },
			],
		});
		const fill = (form: HTMLElement) => {
			const [dietary, extras] = within(form).getAllByRole("button", { name: "+ Add Item" });
			fireEvent.click(dietary as HTMLElement);
			fireEvent.click(dietary as HTMLElement);
			fireEvent.change(within(form).getAllByLabelText("Item 1")[0] as HTMLElement, {
				target: { value: "Vegan" },
			});
			fireEvent.click(extras as HTMLElement);
		};
		const { core, ref } = both({ schema }, fill);
		const server = generateZod(schema);

		// FeedBakkr submits the empty entries, which JSON turns into nulls that
		// the server refuses.
		expect(ref.submitted).toEqual([[{ dietary: ["Vegan", undefined], extras: [undefined] }]]);
		const refSent = JSON.parse(JSON.stringify(ref.submitted[0]?.[0]));
		expect(server.safeParse(refSent).success).toBe(false);

		// Core leaves them out, and a list with nothing in it altogether.
		expect(core.submitted).toEqual([[{ dietary: ["Vegan"] }]]);
		expect(server.safeParse(JSON.parse(JSON.stringify(core.submitted[0]?.[0]))).success).toBe(true);
	});

	it("passes className and style to the form", () => {
		const { container } = render(
			<DynamicForm
				schema={contact}
				onSubmit={() => {}}
				className="enquiry"
				style={{ maxWidth: "30rem" }}
			/>,
		);
		const form = container.querySelector("form") as HTMLFormElement;
		expect(form.className).toBe("enquiry");
		expect(form.style.maxWidth).toBe("30rem");
	});

	it("uses renderFooter in place of the submit button", () => {
		const view = render(
			<DynamicForm
				schema={contact}
				onSubmit={() => {}}
				submitting
				renderFooter={({ submitting }) => (
					<button type="submit">{submitting ? "Wait" : "Send"}</button>
				)}
			/>,
		);
		expect(view.getByRole("button", { name: "Wait" })).toBeTruthy();
		expect(view.queryByRole("button", { name: "Submit" })).toBeNull();
	});
});
