// The text format for schema v2: sections, conditions, help and placeholder.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Condition, SchemaDslV2 } from "../src/schema/schema-dsl-v2.js";
import { validateSchema } from "../src/schema/validate-schema.js";
import { conditionToText, parseCondition } from "../src/text/condition-text.js";
import { parseFormDslText, schemaToTextDsl } from "../src/text/index.js";

const enquiry = JSON.parse(
	readFileSync(new URL("../../../fixtures/v2/conditional-enquiry.json", import.meta.url), "utf8"),
) as SchemaDslV2;

function errors(text: string): string[] {
	const result = parseFormDslText(text);
	return result.ok ? [] : result.errors.map((e) => `${e.line}: ${e.message}`);
}

describe("a v2 schema as text", () => {
	const text = schemaToTextDsl(enquiry);

	it("is readable", () => {
		expect(text).toContain("@version 2");
		expect(text).toContain(
			'@section business "Your business" desc="Only for suppliers and venues." when enquiryType in [supplier, venue]',
		);
		expect(text).toContain(
			'volume: integer "Expected monthly volume" required min=1 help="Roughly, in cases a month." when enquiryType = supplier',
		);
		expect(text).toContain("when enquiryType = venue and covers filled");
		expect(text).toContain('callTime: time "Best time to call" required when callMe = true');
		expect(text).toContain('email: email "Email" required placeholder="you@example.com"');
	});

	it("reads back as the same schema, which passes the checks", () => {
		const back = parseFormDslText(text);
		if (!back.ok) throw new Error(JSON.stringify(back.errors));
		expect(back.schema).toEqual(enquiry);
		expect(validateSchema(back.schema, { allowV2: true, publish: true }).ok).toBe(true);
		expect(schemaToTextDsl(back.schema)).toBe(text);
	});
});

describe("conditions as text", () => {
	const leaves: Condition[] = [
		{ k: "a", eq: "x" },
		{ k: "a", eq: "two words" },
		{ k: "a", eq: "true" },
		{ k: "a", eq: true },
		{ k: "a", eq: "12" },
		{ k: "a", eq: 12 },
		{ k: "a", eq: -1.5 },
		{ k: "a", eq: 'say "hi" \\ now' },
		{ k: "a", eq: "and" },
		{ k: "b", neq: "x,y" },
		{ k: "c", in: ["s", 2, false, "(odd)"] },
		{ k: "d", filled: true },
		{ k: "e", empty: true },
	];
	const compounds: Condition[] = [
		{ all: [leaves[0] as Condition, leaves[9] as Condition] },
		{ any: [leaves[3] as Condition, leaves[11] as Condition] },
		{ any: [{ all: [leaves[0] as Condition, leaves[12] as Condition] }, leaves[10] as Condition] },
		{ all: [{ any: [leaves[1] as Condition, leaves[2] as Condition] }, leaves[4] as Condition] },
		{ all: [{ all: [leaves[5] as Condition, leaves[6] as Condition] }, leaves[7] as Condition] },
		{ any: [{ any: [leaves[8] as Condition, leaves[11] as Condition] }, leaves[12] as Condition] },
	];

	it.each([...leaves, ...compounds])("%j reads back the same", (condition) => {
		expect(parseCondition(conditionToText(condition))).toEqual(condition);
	});

	it("binds and tighter than or, and groups with parentheses", () => {
		expect(parseCondition("a = 1 or b = 2 and c filled")).toEqual({
			any: [
				{ k: "a", eq: 1 },
				{
					all: [
						{ k: "b", eq: 2 },
						{ k: "c", filled: true },
					],
				},
			],
		});
		expect(parseCondition("(a = 1 or b = 2) and c filled")).toEqual({
			all: [
				{
					any: [
						{ k: "a", eq: 1 },
						{ k: "b", eq: 2 },
					],
				},
				{ k: "c", filled: true },
			],
		});
	});

	it("says what is wrong", () => {
		expect(() => parseCondition("")).toThrow("The condition is empty");
		expect(() => parseCondition("a")).toThrow("The condition ends too soon");
		expect(() => parseCondition("a == 1")).toThrow('Expected a value but found "="');
		expect(() => parseCondition("a is 1")).toThrow("Expected =, !=, in, filled or empty");
		expect(() => parseCondition("a = 1 b = 2")).toThrow('Unexpected "b"');
		expect(() => parseCondition('a = "open')).toThrow("A quoted value is not closed");
		expect(() => parseCondition("(a = 1")).toThrow("The condition ends too soon");
	});
});

describe("errors in v2 text", () => {
	it("needs @version 2 for v2 features", () => {
		expect(errors('@version 1\na: text "A" help="x"')).toEqual([
			"2: Conditions, sections, help, placeholder and reply-to need @version 2",
		]);
		expect(errors('a: text "A"\nb: text "B" when a filled')).toEqual([
			"2: Conditions, sections, help, placeholder and reply-to need @version 2",
		]);
	});

	it("needs every field in a section once sections are used", () => {
		expect(errors('@version 2\na: text "A"\n@section s "S"\nb: text "B"')).toEqual([
			"3: With sections, every field must be in one: put a @section before the first field",
		]);
	});

	it("reports a bad condition or section on its line", () => {
		expect(errors('@version 2\na: text "A"\nb: text "B" when a ==')).toEqual([
			'3: Invalid condition "a ==": Expected a value but found "="',
		]);
		expect(errors('@version 2\n@section 1bad "S"\na: text "A"')).toEqual([
			"2: Invalid section: expected an id",
		]);
	});

	it("refuses conditions on a list's item", () => {
		expect(
			errors('@version 2\nok: bool "OK"\nl: dynlist "L"\n  item i: text "I" when ok = true'),
		).toEqual(["4: A list's item takes no when, help, placeholder or reply-to"]);
	});

	it("keeps `when` inside quotes as text", () => {
		const result = parseFormDslText('@version 2\na: text "Say when" help="when ready"');
		expect(result).toMatchObject({
			ok: true,
			schema: { fields: [{ label: "Say when", help: "when ready" }] },
		});
	});
});
