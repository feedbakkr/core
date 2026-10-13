// @vitest-environment jsdom
// The pure form state (/form), and useFeedbakkrForm driving a form made of
// plain inputs, as an app's own components would.
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFields, createFormState, setValue, touch } from "../src/form/index.js";
import { type FeedbakkrFormApi, useFeedbakkrForm } from "../src/react/index.js";
import type { SchemaDslV1 } from "../src/schema/schema-dsl.js";

afterEach(cleanup);

const contact: SchemaDslV1 = {
	v: 1,
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, max: 50 },
		{ k: "email", label: "Email", t: "email", req: true },
		{ k: "guests", label: "Guests", t: "integer", min: 1, max: 8 },
		{ k: "source", label: "Source", t: "text", hidden: true, default: "web" },
	],
};

describe("form state", () => {
	it("starts from defaults and initial values", () => {
		expect(createFormState(contact, { name: "Ada" })).toEqual({
			values: { source: "web", name: "Ada" },
			errors: {},
			touched: {},
		});
	});

	it("checks fields, and clears a field's errors when it changes", () => {
		let state = createFormState(contact);
		state = checkFields(contact, state, ["name", "email"]);
		expect(Object.keys(state.errors)).toEqual(["name", "email"]);
		state = setValue(state, "name", "Ada");
		expect(Object.keys(state.errors)).toEqual(["email"]);
		state = touch(state, "email");
		expect(state.touched).toEqual({ email: true });
		state = checkFields(contact, state);
		expect(Object.keys(state.errors)).toEqual(["email"]);
	});
});

/** A form built on the hook from plain inputs. */
function ContactForm({
	onSubmit,
	expose,
}: {
	onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
	expose?: (form: FeedbakkrFormApi) => void;
}) {
	const form = useFeedbakkrForm(contact, { onSubmit });
	expose?.(form);
	return (
		<form onSubmit={form.handleSubmit} noValidate>
			{form.fields.map((field) => (
				<label key={field.k}>
					{field.label}
					<input
						value={String(form.values[field.k] ?? "")}
						onChange={(e) => form.setValue(field.k, e.target.value)}
						onBlur={() => form.blur(field.k)}
						aria-invalid={form.errors[field.k] ? true : undefined}
					/>
					{form.errorFor(field.k) && <span role="alert">{form.errorFor(field.k)}</span>}
				</label>
			))}
			<button type="submit" disabled={form.submitting}>
				Send
			</button>
		</form>
	);
}

describe("useFeedbakkrForm", () => {
	it("lists the visible fields", () => {
		const { result } = renderHook(() => useFeedbakkrForm(contact));
		expect(result.current.fields.map((f) => f.k)).toEqual(["name", "email", "guests"]);
	});

	it("checks a field when the person leaves it", () => {
		render(<ContactForm onSubmit={() => {}} />);
		const email = screen.getByLabelText(/^Email/);
		fireEvent.change(email, { target: { value: "nope" } });
		fireEvent.blur(email);
		expect(screen.getByRole("alert").textContent).toBe("Invalid email address");
		fireEvent.change(email, { target: { value: "ada@example.com" } });
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("refuses to submit until every field passes, then sends normalised answers", async () => {
		const onSubmit = vi.fn();
		render(<ContactForm onSubmit={onSubmit} />);
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
			"Required",
			"Required",
		]);

		fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: "  Ada " } });
		fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "ada@example.com" } });
		fireEvent.change(screen.getByLabelText(/^Guests/), { target: { value: "3" } });
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
		expect(onSubmit).toHaveBeenCalledWith({
			name: "Ada",
			email: "ada@example.com",
			guests: 3,
			source: "web",
		});
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("shows errors the server returns, and validates a chosen set of fields", async () => {
		let form: FeedbakkrFormApi | undefined;
		render(<ContactForm onSubmit={() => {}} expose={(f) => (form = f)} />);
		act(() => form?.setErrors({ email: [{ code: "invalid_email", message: "Taken" }] }));
		expect(screen.getByRole("alert").textContent).toBe("Taken");

		let passed = true;
		act(() => {
			passed = form?.validate(["name"]) ?? true;
		});
		expect(passed).toBe(false);
		expect(screen.getAllByRole("alert")).toHaveLength(2);
	});

	it("is submitting while onSubmit runs, and can start again", async () => {
		let finish: () => void = () => {};
		const onSubmit = () => new Promise<void>((resolve) => (finish = resolve));
		let form: FeedbakkrFormApi | undefined;
		render(<ContactForm onSubmit={onSubmit} expose={(f) => (form = f)} />);
		fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: "Ada" } });
		fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "ada@example.com" } });
		let done: Promise<boolean> | undefined;
		act(() => {
			done = form?.handleSubmit();
		});
		expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
		await act(async () => {
			finish();
			await done;
		});
		expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
			false,
		);
		expect(form?.submitCount).toBe(1);

		act(() => form?.reset());
		expect((screen.getByLabelText(/^Your name/) as HTMLInputElement).value).toBe("");
	});
});
