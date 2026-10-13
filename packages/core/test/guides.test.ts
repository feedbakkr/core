import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateZod } from "../src/schema/generate-zod.js";
import type { SchemaDslV1 } from "../src/schema/schema-dsl.js";
import { validateSchema } from "../src/schema/validate-schema.js";
import { parseFormDslText } from "../src/text/form-dsl-text.js";

// The guides are what agents copy from, so every example in them must pass.

function codeBlocks(file: string, language: string): string[] {
	const source = readFileSync(new URL(`../docs/${file}`, import.meta.url), "utf8");
	const fence = new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\`\`\``, "g");
	return [...source.matchAll(fence)].map((m) => m[1] as string);
}

describe("schema-guide.md", () => {
	const json = codeBlocks("schema-guide.md", "json").map((block) => JSON.parse(block));

	it("has examples to check", () => {
		expect(json.length).toBeGreaterThanOrEqual(4);
	});

	it("has whole schemas that pass every check", () => {
		const schemas = json.filter((block) => block.v === 1);
		expect(schemas.length).toBeGreaterThanOrEqual(1);
		for (const schema of schemas)
			expect(validateSchema(schema, { publish: true }).issues).toEqual([]);
	});

	it("has field examples that pass inside a schema", () => {
		const fields = json.filter((block) => typeof block.t === "string");
		expect(fields.length).toBeGreaterThanOrEqual(2);
		for (const field of fields) {
			expect(validateSchema({ v: 1, fields: [field] }, { publish: true }).issues).toEqual([]);
		}
	});

	it("has preview examples that pass with the fields they name", () => {
		const previews = json.filter((block) => typeof block.mode === "string");
		expect(previews.length).toBeGreaterThanOrEqual(1);
		const fields = ["name", "topic", "email"].map((k) => ({ k, label: k, t: "text" }));
		for (const preview of previews) {
			expect(validateSchema({ v: 1, fields, preview }, { publish: true }).issues).toEqual([]);
		}
	});

	it("has a text example that reads as a valid schema", () => {
		const [text] = codeBlocks("schema-guide.md", "text");
		const parsed = parseFormDslText(text ?? "");
		if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
		expect(validateSchema(parsed.schema, { publish: true }).issues).toEqual([]);
		expect(parsed.schema.fields.map((f) => f.k)).toEqual([
			"name",
			"email",
			"topic",
			"message",
			"source_page",
			"dishes",
		]);
	});

	it("names every field type", () => {
		const guide = readFileSync(new URL("../docs/schema-guide.md", import.meta.url), "utf8");
		const types = ["text", "textarea", "markdown", "email", "url", "phone", "date", "datetime"];
		for (const t of [
			...types,
			"time",
			"daterange",
			"bool",
			"number",
			"integer",
			"fixed",
			"dynlist",
		]) {
			expect(guide, t).toContain(`| \`${t}\` |`);
		}
	});
});

describe("claude-guide.md", () => {
	// The example from the guide, compiled here so the typecheck covers it.
	const contactForm = {
		v: 1,
		title: "Contact us",
		fields: [
			{ k: "name", label: "Your name", t: "text", req: true, min: 1, max: 100 },
			{ k: "email", label: "Email", t: "email", req: true },
			{ k: "message", label: "Message", t: "textarea", req: true, min: 10, max: 2000 },
		],
		preview: { mode: "custom", fields: ["name"] },
	} satisfies SchemaDslV1;

	it("has the example from the guide, verbatim", () => {
		const [example] = codeBlocks("claude-guide.md", "ts");
		expect(example).toContain(
			'{ k: "message", label: "Message", t: "textarea", req: true, min: 10, max: 2000 },',
		);
		expect(example).toContain("} satisfies SchemaDslV1;");
	});

	it("is a valid form whose server check rejects an empty name", () => {
		expect(validateSchema(contactForm, { publish: true }).ok).toBe(true);
		const answers = generateZod(contactForm);
		expect(
			answers.safeParse({ name: "Sam", email: "sam@example.com", message: "Hello there" }).success,
		).toBe(true);
		expect(
			answers.safeParse({ name: "", email: "sam@example.com", message: "Hello there" }).success,
		).toBe(false);
	});
});
