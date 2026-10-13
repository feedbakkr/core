import { describe, expect, it } from "vitest";
import { generateJsonSchema, generateZodCode } from "../dist/export.js";
import { generateZod, hashSchema, validateSchema } from "../dist/index.js";
import { parseFormDslText, schemaToTextDsl } from "../dist/text.js";

/*
 * The published build, run inside workerd. The main suite runs in Node, which
 * would not notice a Node-only API or a runtime code generation that Workers
 * refuse, so this exercises every entry point once in the runtime FoodACN
 * deploys to.
 */

const schema = {
	v: 1,
	fields: [
		{ k: "name", label: "Name", t: "text", req: true },
		{ k: "visit", label: "Visit date", t: "date" },
		{ k: "rating", label: "Rating", t: "integer", min: 1, max: 5 },
		{
			k: "topic",
			label: "Topic",
			t: "fixed",
			opts: [{ k: "food" }, { k: "service" }],
			default: "food",
		},
	],
	preview: { mode: "custom", fields: ["name", "topic"] },
};

describe("core in the Workers runtime", () => {
	it("is running in workerd", () => {
		expect(navigator.userAgent).toBe("Cloudflare-Workers");
	});

	it("validates a schema and the answers to it", () => {
		const result = validateSchema(schema, { publish: true });
		if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("; "));
		const answers = generateZod(result.schema);
		expect(answers.safeParse({ name: "Sam", visit: "2026-10-13", rating: 4 }).success).toBe(true);
		expect(answers.safeParse({ name: "Sam", rating: 9 }).success).toBe(false);
		expect(validateSchema({ v: 1, fields: [{ k: "name", t: "text" }] }).ok).toBe(false);
	});

	it("hashes with Web Crypto", async () => {
		const reordered = { preview: schema.preview, fields: schema.fields, v: 1 };
		expect(await hashSchema(reordered)).toBe(await hashSchema(schema));
	});

	it("round-trips the text format and runs the exports", () => {
		const result = validateSchema(schema);
		if (!result.ok) throw new Error("schema should be valid");
		expect(parseFormDslText(schemaToTextDsl(result.schema))).toEqual({
			ok: true,
			schema: result.schema,
		});
		expect(generateJsonSchema(result.schema)).toMatchObject({ type: "object" });
		expect(generateZodCode(result.schema)).toContain("z.object");
	});
});
