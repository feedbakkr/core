// Every place core deliberately behaves differently from FeedBakkr (8ae744e).
// Each test shows FeedBakkr's behaviour (the reference copy) next to core's,
// so a difference cannot appear or disappear unnoticed.
//
// Milestone 1 changes only the text format, so that every schema round-trips
// exactly. Payload and schema validation are unchanged (differential.test.ts).
import { describe, expect, it } from "vitest";
import type { SchemaDslV1 } from "../src/index.js";
import { parseFormDslText, schemaToTextDsl } from "../src/text/index.js";
import {
	parseFormDslText as refParse,
	schemaToTextDsl as refPrint,
} from "./reference/feedbakkr-8ae744e/form-dsl-text.js";

function parsed(text: string): SchemaDslV1 {
	const result = parseFormDslText(text);
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	return result.schema;
}

function refParsed(text: string): SchemaDslV1 {
	const result = refParse(text);
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	return result.schema;
}

const one = (field: Record<string, unknown>, extra: Partial<SchemaDslV1> = {}): SchemaDslV1 =>
	({ v: 1, fields: [field], ...extra }) as SchemaDslV1;

describe("text format: preview", () => {
	const text = '@preview name, topic separator=" - "\nname: text "Name"\ntopic: text "Topic"';

	it("1. no longer reads the separator as part of the field list", () => {
		expect(refParsed(text).preview).toMatchObject({ fields: ["name", "topic separator"] });
		expect(parsed(text).preview).toEqual({
			mode: "custom",
			fields: ["name", "topic"],
			separator: " - ",
		});
	});

	it("2. no longer adds a separator and maxLength that the text did not set", () => {
		const bare = '@preview name\nname: text "Name"';
		expect(refParsed(bare).preview).toEqual({
			mode: "custom",
			fields: ["name"],
			separator: " · ",
			maxLength: 100,
		});
		expect(parsed(bare).preview).toEqual({ mode: "custom", fields: ["name"] });
	});

	it("3. writes and reads maxLength and fallback fields", () => {
		const schema = one(
			{ k: "name", label: "Name", t: "text" },
			{
				preview: {
					mode: "custom",
					fields: ["name"],
					separator: " · ",
					maxLength: 80,
					fallbackFields: ["name"],
				},
			},
		);
		expect(refPrint(schema)).not.toContain("maxLength");
		expect(schemaToTextDsl(schema)).toContain(
			'@preview name separator=" · " maxLength=80 fallback=name',
		);
		expect(parsed(schemaToTextDsl(schema))).toEqual(schema);
	});
});

describe("text format: dynlist items", () => {
	const schema = one({
		k: "links",
		label: "Links",
		t: "dynlist",
		item: { k: "link", label: "Link", t: "url", req: true, max: 200 },
	});

	it("4. writes the item's key and every item setting", () => {
		expect(refPrint(schema)).toContain('  item: url "Link"');
		expect(schemaToTextDsl(schema)).toContain('  item link: url "Link" required max=200');
		expect(parsed(schemaToTextDsl(schema))).toEqual(schema);
	});

	it("5. reads options for a fixed item", () => {
		const text =
			'sizes: dynlist "Sizes"\n  item size: fixed "Size"\n    - s "Small"\n    - l "Large"';
		expect(refParse(text).ok).toBe(false);
		expect(parsed(text).fields[0]).toEqual({
			k: "sizes",
			label: "Sizes",
			t: "dynlist",
			item: {
				k: "size",
				label: "Size",
				t: "fixed",
				opts: [
					{ k: "s", label: "Small" },
					{ k: "l", label: "Large" },
				],
			},
		});
	});

	it("keeps FeedBakkr's key for a bare item: line", () => {
		const text = 'steps: dynlist "Steps"\n  item: text "Step"';
		expect(parsed(text)).toEqual(refParsed(text));
	});
});

describe("text format: values", () => {
	it("6. reads integer defaults as numbers", () => {
		const text = 'people: integer "People" default=2';
		expect(refParsed(text).fields[0]).toMatchObject({ default: "2" });
		expect(parsed(text).fields[0]).toMatchObject({ default: 2 });
	});

	it("7. escapes quotes in labels, meta and option labels", () => {
		const schema = one({
			k: "q",
			label: 'Say "hi"',
			t: "fixed",
			meta: 'a "b"',
			opts: [{ k: "x", label: 'The "x"' }],
		});
		expect(refParse(refPrint(schema)).ok && refParsed(refPrint(schema))).not.toEqual(schema);
		expect(parsed(schemaToTextDsl(schema))).toEqual(schema);
	});

	it("8. keeps an option label that equals its key", () => {
		const schema = one({ k: "c", label: "C", t: "fixed", opts: [{ k: "yes", label: "yes" }] });
		expect(refParsed(refPrint(schema)).fields[0]).toMatchObject({ opts: [{ k: "yes" }] });
		expect(parsed(schemaToTextDsl(schema))).toEqual(schema);
	});

	it("9. accepts option keys that are not single words", () => {
		const text = 'r: fixed "Rating"\n  - very-good "Very good"';
		expect(refParse(text).ok).toBe(false);
		expect(parsed(text).fields[0]).toMatchObject({
			opts: [{ k: "very-good", label: "Very good" }],
		});
	});

	it("10. writes text defaults with spaces, and list defaults, so they read back", () => {
		const schema = one({ k: "n", label: "N", t: "text", default: "two words" });
		expect(refParsed(refPrint(schema)).fields[0]).toMatchObject({ default: "two" });
		expect(parsed(schemaToTextDsl(schema))).toEqual(schema);
		const list = one({
			k: "l",
			label: "L",
			t: "dynlist",
			item: { k: "_item", label: "I", t: "text" },
			default: ["a b", "c"],
		});
		expect(parsed(schemaToTextDsl(list))).toEqual(list);
	});

	it("11. writes an explicit req: false as `optional`", () => {
		const schema = one({ k: "b", label: "B", t: "bool", req: false });
		expect(refParsed(refPrint(schema)).fields[0]).not.toHaveProperty("req");
		expect(schemaToTextDsl(schema)).toContain('b: bool "B" optional');
		expect(parsed(schemaToTextDsl(schema))).toEqual(schema);
	});
});
