import { describe, expect, it } from "vitest";
import { parseFormDslText, schemaToTextDsl } from "../src/text/form-dsl-text.js";

function parseOrThrow(text: string) {
	const r = parseFormDslText(text);
	if (!r.ok) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
	return r.schema;
}

describe("form-dsl-text sensitive flag", () => {
	it('parses bare "sensitive" token as explicit true', () => {
		const schema = parseOrThrow('comment: text "Comment" sensitive');
		expect(schema.fields[0]?.sensitive).toBe(true);
	});

	it('parses bare "not-sensitive" token as explicit false', () => {
		const schema = parseOrThrow('rating: number "Rating" not-sensitive');
		expect(schema.fields[0]?.sensitive).toBe(false);
	});

	it("leaves sensitive undefined when no token present (auto-derive at consume time)", () => {
		const schema = parseOrThrow('rating: number "Rating"');
		expect(schema.fields[0]?.sensitive).toBeUndefined();
	});

	it("serializes explicit true as 'sensitive' token", () => {
		const text = schemaToTextDsl({
			v: 1,
			fields: [{ k: "rating", label: "Rating", t: "number", sensitive: true }],
		});
		expect(text).toContain("sensitive");
		expect(text).not.toContain("not-sensitive");
	});

	it("serializes explicit false as 'not-sensitive' token", () => {
		const text = schemaToTextDsl({
			v: 1,
			fields: [{ k: "category", label: "Category", t: "text", sensitive: false }],
		});
		expect(text).toContain("not-sensitive");
	});

	it("omits sensitive token entirely when undefined", () => {
		const text = schemaToTextDsl({
			v: 1,
			fields: [{ k: "rating", label: "Rating", t: "number" }],
		});
		expect(text).not.toContain("sensitive");
	});

	it("round-trips explicit override for normally-sensitive type", () => {
		const original = parseOrThrow('email: email "Email" not-sensitive');
		const text = schemaToTextDsl(original);
		const parsed = parseOrThrow(text);
		expect(parsed.fields[0]?.sensitive).toBe(false);
	});

	it("round-trips explicit override for normally-non-sensitive type", () => {
		const original = parseOrThrow('rating: number "Rating" sensitive');
		const text = schemaToTextDsl(original);
		const parsed = parseOrThrow(text);
		expect(parsed.fields[0]?.sensitive).toBe(true);
	});
});
