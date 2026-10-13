import { describe, expect, it } from "vitest";
import { checkFields, createFormState } from "../dist/form.js";
import { normalizeSubmission, prepareMessage, validateSubmission } from "../dist/index.js";
import { interpretSubmission, summarizeSubmission } from "../dist/messages.js";
import { validateFields } from "../dist/submissions.js";

/*
 * Milestone 5's test in the runtime FoodACN deploys to: a contact schema's
 * answers are validated, interpreted and summarised by the published build
 * inside workerd, with no Node APIs.
 */

const contact = {
	v: 1,
	title: "Contact us",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, max: 100 },
		{ k: "email", label: "Email", t: "email", req: true },
		{
			k: "topic",
			label: "What is it about?",
			t: "fixed",
			req: true,
			opts: [
				{ k: "order", label: "An order" },
				{ k: "other", label: "Something else" },
			],
		},
		{ k: "visit", label: "Visit date", t: "date" },
		{ k: "message", label: "Message", t: "textarea", req: true, min: 10, max: 2000 },
		{ k: "source_page", label: "Page", t: "url", hidden: true },
	],
	preview: { mode: "custom", fields: ["name", "topic"], separator: " · " },
} as const;

// A form post: everything arrives as text.
const posted = {
	name: "  Jane Smith ",
	email: "jane@example.com",
	topic: "order",
	visit: "2026-06-15",
	message: "Where is my order, please?",
	source_page: "https://foodacn.com/contact",
};

describe("submissions in the Workers runtime", () => {
	it("validates, interprets and summarises a contact form's answers", async () => {
		const result = await prepareMessage(contact as never, posted);
		if (!result.ok) throw new Error(JSON.stringify(result.errors));
		expect(result.values.name).toBe("Jane Smith");
		expect(result.summary).toBe("Jane Smith · An order");
		expect(result.rows.map((r) => [r.label, r.display])).toEqual([
			["Your name", "Jane Smith"],
			["Email", "jane@example.com"],
			["What is it about?", "An order"],
			["Visit date", "15 June 2026"],
			["Message", "Where is my order, please?"],
			["Page", "https://foodacn.com/contact"],
		]);
		expect(result.schemaHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("refuses bad answers with stable codes", () => {
		const result = validateSubmission(contact as never, { ...posted, email: "nope", extra: 1 });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.email?.[0]?.code).toBe("invalid_email");
		expect(result.errors.extra?.[0]?.code).toBe("unknown_field");
	});

	it("runs every pure entry", () => {
		const values = normalizeSubmission(contact as never, posted);
		expect(interpretSubmission(contact as never, values)).toHaveLength(6);
		expect(summarizeSubmission(contact as never, values)).toBe("Jane Smith · An order");
		expect(validateFields(contact as never, {}, ["name"]).ok).toBe(false);
		expect(checkFields(contact as never, createFormState(contact as never)).errors).toHaveProperty(
			"message",
		);
	});
});
