// The exports of a v2 schema agree with validateSubmission about conditions.
// Every combination of a few answers is normalised, as the server stores it,
// then judged three ways: validateSubmission, the JSON Schema export (with
// Ajv) and the Zod code export (run here). The exports are shape-only, as
// FeedBakkr's are (no default lengths or date bounds), so the answers stay
// within those; what is compared is required, optional and absent under
// conditions.
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateJsonSchema, generateZodCode } from "../src/export/index.js";
import type { SchemaDslV2 } from "../src/schema/schema-dsl-v2.js";
import { normalizeSubmission, validateSubmission } from "../src/submissions/index.js";

const enquiry = JSON.parse(
	readFileSync(new URL("../../../fixtures/v2/conditional-enquiry.json", import.meta.url), "utf8"),
) as SchemaDslV2;

/** Runs the exported Zod code and returns its schema. */
function loadZodCode(code: string): z.ZodType {
	const body = code
		.replace('import { z } from "zod";', "")
		.replace("export const schema", "const schema")
		.replace(/export type FormData[^\n]*/, "");
	return new Function("z", `${body}\nreturn schema;`)(z) as z.ZodType;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const jsonSchema = ajv.compile(generateJsonSchema(enquiry));
const zodCode = loadZodCode(generateZodCode(enquiry));

const choices: Record<string, unknown[]> = {
	enquiryType: [undefined, "supplier", "venue", "other"],
	volume: [undefined, 40],
	products: [undefined, ["Cheese"]],
	covers: [undefined, 80],
	bigVenueContact: [undefined, "+44 20 7946 0000"],
	callMe: [undefined, true, false],
	callTime: [undefined, "09:30"],
};

// Every operator on its own, each deciding whether one field is required.
const operators = {
	v: 2,
	fields: [
		{ k: "a", label: "A", t: "text" },
		{ k: "d", label: "D", t: "fixed", opts: [{ k: "x" }, { k: "y" }, { k: "z" }] },
		{
			k: "g",
			label: "G",
			t: "dynlist",
			item: { k: "i", label: "I", t: "fixed", opts: [{ k: "p" }, { k: "q" }] },
		},
		{ k: "filledA", label: "1", t: "text", req: true, when: { k: "a", filled: true } },
		{ k: "emptyA", label: "2", t: "text", req: true, when: { k: "a", empty: true } },
		{ k: "notX", label: "3", t: "text", req: true, when: { k: "d", neq: "x" } },
		{ k: "yOrZ", label: "4", t: "text", req: true, when: { k: "d", in: ["y", "z"] } },
		{ k: "hasP", label: "5", t: "text", req: true, when: { k: "g", eq: "p" } },
		{
			k: "either",
			label: "6",
			t: "text",
			when: {
				any: [
					{ k: "d", eq: "x" },
					{ k: "g", in: ["q"] },
				],
			},
		},
	],
} as SchemaDslV2;
const operatorChoices: Record<string, unknown[]> = {
	a: [undefined, "hi"],
	d: [undefined, "x", "y", "z"],
	g: [undefined, ["p"], ["q"], ["p", "q"]],
	filledA: [undefined, "v"],
	emptyA: [undefined, "v"],
	notX: [undefined, "v"],
	yOrZ: [undefined, "v"],
	hasP: [undefined, "v"],
	either: [undefined, "v"],
};

function combinationsOf(options: Record<string, unknown[]>): Record<string, unknown>[] {
	let all: Record<string, unknown>[] = [{}];
	for (const [key, values] of Object.entries(options)) {
		all = all.flatMap((combo) =>
			values.map((value) => (value === undefined ? combo : { ...combo, [key]: value })),
		);
	}
	return all;
}

describe("v2 exports agree with validateSubmission on every operator", () => {
	const json = ajv.compile(generateJsonSchema(operators));
	const zod = loadZodCode(generateZodCode(operators));
	const all = combinationsOf(operatorChoices);

	it(`on raw and stored answers, for all ${all.length} combinations`, () => {
		for (const combo of all) {
			const stored = normalizeSubmission(operators, combo);
			const ours = validateSubmission(operators, stored).ok;
			expect({ stored, json: json(stored), zod: zod.safeParse(stored).success }).toEqual({
				stored,
				json: ours,
				zod: ours,
			});
			// Raw answers may answer fields that do not apply, which stored
			// answers never do; the exports refuse those, the server drops them.
			const dropped = Object.keys(combo).some((k) => !(k in stored));
			if (!dropped) {
				expect({ combo, json: json(combo) }).toEqual({ combo, json: ours });
			}
		}
	});
});

describe("v2 exports agree with validateSubmission", () => {
	const base = { name: "Jane", email: "jane@example.com", details: "We would like to talk." };
	const all = combinationsOf(choices);

	it(`on stored answers, for all ${all.length} combinations`, () => {
		let accepted = 0;
		for (const combo of all) {
			const stored = normalizeSubmission(enquiry, { ...base, ...combo });
			const ours = validateSubmission(enquiry, stored).ok;
			expect({ stored, json: jsonSchema(stored) }).toEqual({ stored, json: ours });
			expect({ stored, zod: zodCode.safeParse(stored).success }).toEqual({ stored, zod: ours });
			if (ours) accepted++;
		}
		expect(accepted).toBeGreaterThan(10);
		expect(accepted).toBeLessThan(all.length);
	});

	it("refuse an answer to a field that does not apply", () => {
		const stored = { ...base, enquiryType: "other", volume: 40 };
		expect(validateSubmission(enquiry, stored).ok).toBe(true); // dropped when normalised
		expect(jsonSchema(stored)).toBe(false);
		expect(zodCode.safeParse(stored).success).toBe(false);
	});

	it("carry help as the description", () => {
		const schema = generateJsonSchema(enquiry) as { properties: Record<string, object> };
		expect(schema.properties.volume).toMatchObject({ description: "Roughly, in cases a month." });
	});

	it("leave v1 exports as they were", () => {
		const v1 = {
			v: 1 as const,
			fields: [{ k: "a", label: "A", t: "text" as const, req: true }],
		};
		expect(generateJsonSchema(v1)).not.toHaveProperty("allOf");
		expect(generateZodCode(v1)).not.toContain("superRefine");
	});
});
