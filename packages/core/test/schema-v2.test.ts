// Schema v2: conditions, sections, help and placeholder.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateCondition, visibleFields, visibleSections } from "../src/conditions/index.js";
import { checkFields, createFormState, sectionStatus } from "../src/form/index.js";
import { interpretSubmission, prepareMessage } from "../src/messages/index.js";
import type { Condition, SchemaDslV2 } from "../src/schema/schema-dsl-v2.js";
import { schemaDslV2Schema } from "../src/schema/schema-dsl-v2.js";
import { validateSchema } from "../src/schema/validate-schema.js";
import {
	normalizeSubmission,
	validateFields,
	validateSubmission,
} from "../src/submissions/index.js";
import { allFixtures } from "./fixtures.js";
import { schemaDslV1Schema as refV1 } from "./reference/feedbakkr-8ae744e/schema-dsl.js";

const enquiry = JSON.parse(
	readFileSync(new URL("../../../fixtures/v2/conditional-enquiry.json", import.meta.url), "utf8"),
) as SchemaDslV2;

function v2(fields: unknown[], extra: Record<string, unknown> = {}) {
	return { v: 2, fields, ...extra };
}

function issues(input: unknown): string[] {
	const result = validateSchema(input, { allowV2: true });
	return result.ok ? [] : result.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

const choice = { k: "kind", label: "Kind", t: "fixed", opts: [{ k: "a" }, { k: "b" }] };

describe("parsing", () => {
	it("accepts the conditional enquiry, with the publish checks", () => {
		expect(validateSchema(enquiry, { allowV2: true, publish: true })).toMatchObject({ ok: true });
	});

	it("refuses v2 unless asked for it", () => {
		expect(validateSchema(enquiry)).toEqual({
			ok: false,
			issues: [
				{
					code: "invalid_structure",
					message: "This is a v2 schema, which is not accepted here (pass allowV2: true)",
					path: ["v"],
				},
			],
		});
	});

	it("is refused by FeedBakkr's v1 parser, so old readers fail loudly", () => {
		expect(refV1.safeParse(enquiry).success).toBe(false);
		// A v1 reader that ignored `v` would drop the conditions silently.
		expect(refV1.safeParse({ ...enquiry, v: 1, sections: undefined }).success).toBe(true);
	});

	it("leaves every v1 fixture exactly as it was", () => {
		for (const { schema } of allFixtures()) {
			expect(validateSchema(schema, { allowV2: true })).toEqual(validateSchema(schema));
		}
	});

	it("keeps help and placeholder", () => {
		const parsed = schemaDslV2Schema.parse(enquiry);
		expect(parsed.fields[1]).toMatchObject({ placeholder: "you@example.com" });
		expect(parsed.fields[3]).toMatchObject({ help: "Roughly, in cases a month." });
	});

	it("allows more than 25 fields, with maxFields as the limit", () => {
		const many = v2(Array.from({ length: 30 }, (_, i) => ({ k: `f${i}`, label: "F", t: "text" })));
		expect(issues(many)).toEqual([]);
		expect(validateSchema(many, { allowV2: true, maxFields: 20 })).toMatchObject({
			ok: false,
			issues: [{ message: "At most 20 fields are allowed", path: ["fields"] }],
		});
	});
});

describe("rules for conditions", () => {
	it("refuses a condition on an unknown, later or the same field", () => {
		expect(
			issues(v2([{ k: "a", label: "A", t: "text", when: { k: "nope", filled: true } }])),
		).toEqual(['fields.0.when.k: Field "a" refers to "nope", which is not a field']);
		expect(
			issues(
				v2([
					{ k: "a", label: "A", t: "text", when: { k: "b", filled: true } },
					{ k: "b", label: "B", t: "text", when: { k: "a", filled: true } },
				]),
			),
		).toEqual(['fields.0.when.k: Field "a" refers to "b", which does not come before it']);
		expect(issues(v2([{ k: "a", label: "A", t: "text", when: { k: "a", empty: true } }]))).toEqual([
			'fields.0.when.k: Field "a" refers to "a", which does not come before it',
		]);
	});

	it("finds a bad reference inside all and any", () => {
		const when = {
			any: [
				{ k: "kind", eq: "a" },
				{
					all: [
						{ k: "kind", eq: "b" },
						{ k: "late", filled: true },
					],
				},
			],
		};
		expect(
			issues(
				v2([choice, { k: "x", label: "X", t: "text", when }, { k: "late", label: "L", t: "text" }]),
			),
		).toEqual([
			'fields.1.when.any.1.all.1.k: Field "x" refers to "late", which does not come before it',
		]);
	});

	it("refuses compared values that do not suit the field", () => {
		const fields = [
			choice,
			{ k: "ok", label: "OK", t: "bool" },
			{ k: "n", label: "N", t: "number" },
			{
				k: "x",
				label: "X",
				t: "text",
				when: {
					all: [
						{ k: "kind", in: ["a", "c"] },
						{ k: "ok", eq: "yes" },
						{ k: "n", neq: "1" },
					],
				},
			},
		];
		expect(issues(v2(fields))).toEqual([
			'fields.3.when.all.0: "c" is not an option of "kind"',
			'fields.3.when.all.1: "ok" is answered yes or no',
			'fields.3.when.all.2: "n" is answered with a number',
		]);
	});

	it("refuses conditions that are not one of the forms", () => {
		expect(
			issues(
				v2([choice, { k: "x", label: "X", t: "text", when: { k: "kind", eq: "a", neq: "b" } }]),
			),
		).not.toEqual([]);
		expect(issues(v2([choice, { k: "x", label: "X", t: "text", when: { all: [] } }]))).not.toEqual(
			[],
		);
		expect(
			issues(v2([choice, { k: "x", label: "X", t: "text", when: { k: "kind", filled: false } }])),
		).not.toEqual([]);
	});
});

describe("rules for sections", () => {
	const fields = [choice, { k: "x", label: "X", t: "text" }, { k: "y", label: "Y", t: "text" }];

	it("needs every field once, in order", () => {
		const wrong = [
			[{ id: "s", title: "S", fields: ["kind", "x"] }],
			[{ id: "s", title: "S", fields: ["kind", "y", "x"] }],
			[
				{ id: "s", title: "S", fields: ["kind", "x"] },
				{ id: "t", title: "T", fields: ["x", "y"] },
			],
		];
		for (const sections of wrong) {
			expect(issues(v2(fields, { sections }))).toEqual([
				"sections: Sections must list every field exactly once, in the same order as fields: expected kind, x, y",
			]);
		}
	});

	it("refuses duplicate ids and a condition on the section's own fields", () => {
		const sections = [
			{ id: "s", title: "S", fields: ["kind"] },
			{ id: "s", title: "T", fields: ["x", "y"], when: { k: "x", filled: true } },
		];
		expect(issues(v2(fields, { sections }))).toEqual([
			'sections.1.id: Duplicate section id "s"',
			'sections.1.when.k: Section "s" refers to "x", which does not come before it',
		]);
	});
});

describe("evaluateCondition", () => {
	const values = { s: "a", n: 3, b: false, list: ["x", "y"], empty: [] as string[] };
	const table: [Condition, boolean][] = [
		[{ k: "s", eq: "a" }, true],
		[{ k: "s", eq: "b" }, false],
		[{ k: "missing", eq: "a" }, false],
		[{ k: "n", eq: 3 }, true],
		[{ k: "n", eq: "3" }, false],
		[{ k: "b", eq: false }, true],
		[{ k: "list", eq: "y" }, true],
		[{ k: "s", neq: "b" }, true],
		[{ k: "s", neq: "a" }, false],
		[{ k: "missing", neq: "a" }, true],
		[{ k: "list", neq: "x" }, false],
		[{ k: "s", in: ["b", "a"] }, true],
		[{ k: "s", in: ["b"] }, false],
		[{ k: "missing", in: ["a"] }, false],
		[{ k: "list", in: ["z", "x"] }, true],
		[{ k: "s", filled: true }, true],
		[{ k: "b", filled: true }, true],
		[{ k: "empty", filled: true }, false],
		[{ k: "missing", empty: true }, true],
		[{ k: "s", empty: true }, false],
		[
			{
				all: [
					{ k: "s", eq: "a" },
					{ k: "n", eq: 3 },
				],
			},
			true,
		],
		[
			{
				all: [
					{ k: "s", eq: "a" },
					{ k: "n", eq: 4 },
				],
			},
			false,
		],
		[
			{
				any: [
					{ k: "s", eq: "b" },
					{ k: "n", eq: 3 },
				],
			},
			true,
		],
		[
			{
				any: [
					{ k: "s", eq: "b" },
					{ k: "n", eq: 4 },
				],
			},
			false,
		],
		[
			{
				any: [
					{
						all: [
							{ k: "s", filled: true },
							{ k: "missing", empty: true },
						],
					},
				],
			},
			true,
		],
	];
	it.each(table)("%j is %s", (condition, expected) => {
		expect(evaluateCondition(condition, values)).toBe(expected);
	});
});

describe("answers to a conditional form", () => {
	const base = {
		name: "Jane",
		email: "jane@example.com",
		details: "We would like to talk.",
		source_page: "https://foodacn.com/work-with-us",
	};

	it("checks only the fields that apply", () => {
		expect(validateSubmission(enquiry, { ...base, enquiryType: "other" })).toMatchObject({
			ok: true,
		});
		const supplier = validateSubmission(enquiry, { ...base, enquiryType: "supplier" });
		expect(supplier.ok ? [] : Object.keys(supplier.errors)).toEqual(["volume"]);
		const venue = validateSubmission(enquiry, { ...base, enquiryType: "venue", covers: "80" });
		expect(venue.ok ? [] : Object.keys(venue.errors)).toEqual(["bigVenueContact"]);
	});

	it("drops answers to fields that do not apply, and later conditions see them as empty", () => {
		const result = validateSubmission(enquiry, {
			...base,
			enquiryType: "other",
			volume: "500",
			covers: "80",
			bigVenueContact: "not checked",
			callMe: "off",
			callTime: "25:99",
		});
		expect(result).toEqual({
			ok: true,
			values: { ...base, enquiryType: "other", callMe: false },
		});
	});

	it("reads form text before judging a condition", () => {
		const result = validateSubmission(enquiry, { ...base, enquiryType: "other", callMe: "on" });
		expect(result.ok ? [] : Object.keys(result.errors)).toEqual(["callTime"]);
	});

	it("treats answers to fields that do not apply as known keys, not unknown ones", () => {
		const result = validateSubmission(enquiry, { ...base, enquiryType: "other", volume: 5 });
		expect(result.ok).toBe(true);
	});

	it("lists the fields and sections that apply", () => {
		const venue = { ...base, enquiryType: "venue", covers: 80 };
		expect(visibleFields(enquiry, venue).map((f) => f.k)).toEqual([
			"name",
			"email",
			"enquiryType",
			"covers",
			"bigVenueContact",
			"details",
			"callMe",
			"source_page",
		]);
		expect(visibleSections(enquiry, { enquiryType: "other" }).map((s) => s.id)).toEqual([
			"you",
			"request",
		]);
		expect(normalizeSubmission(enquiry, { enquiryType: "other", covers: 9 })).toEqual({
			enquiryType: "other",
		});
	});

	it("interprets only the fields that apply, with their sections", async () => {
		const rows = interpretSubmission(enquiry, {
			...base,
			enquiryType: "supplier",
			volume: 40,
		});
		expect(rows.map((r) => `${r.section}/${r.key}`)).toEqual([
			"you/name",
			"you/email",
			"you/enquiryType",
			"business/volume",
			"business/products",
			"request/details",
			"request/callMe",
			"request/source_page",
		]);
		const message = await prepareMessage(enquiry, { ...base, enquiryType: "supplier", volume: 40 });
		expect(message).toMatchObject({ ok: true, summary: "Jane · I'm a supplier" });
	});
});

describe("sections in the browser and the server agree", () => {
	// Answers built from every combination of a few choices: each section is
	// checked alone, as a wizard would, and the form as a whole, as the
	// server does. The two must agree on every field.
	const choices = {
		enquiryType: [undefined, "supplier", "venue", "other", "bad"],
		volume: [undefined, "0", "40", "x"],
		covers: [undefined, "80", "5000"],
		bigVenueContact: [undefined, "+44 20 7946 0000", "call me"],
		callMe: [undefined, "on", false],
		callTime: [undefined, "09:30", "9am"],
		name: [undefined, "Jane"],
	};
	const keys = Object.keys(choices) as (keyof typeof choices)[];
	const combinations: Record<string, unknown>[] = [{}];
	for (const key of keys) {
		const next: Record<string, unknown>[] = [];
		for (const combo of combinations) {
			for (const value of choices[key])
				next.push(value === undefined ? combo : { ...combo, [key]: value });
		}
		combinations.splice(0, combinations.length, ...next);
	}

	it(`on all ${combinations.length} combinations`, () => {
		for (const combo of combinations) {
			const answers = { email: "jane@example.com", details: "We would like to talk.", ...combo };
			const whole = validateSubmission(enquiry, answers);
			const perSection: Record<string, unknown> = {};
			let allPass = true;
			for (const section of enquiry.sections ?? []) {
				const result = validateFields(enquiry, answers, section.fields);
				allPass &&= result.ok;
				Object.assign(perSection, result.errors);
			}
			expect({ answers, ok: allPass, errors: perSection }).toEqual({
				answers,
				ok: whole.ok,
				errors: whole.ok ? {} : whole.errors,
			});
		}
	});
});

describe("form state", () => {
	it("reports each section's fields and whether they pass", () => {
		let state = createFormState(enquiry, { name: "Jane", email: "jane@example.com" });
		const status = () =>
			sectionStatus(enquiry, state).map((s) => [
				s.id,
				s.applies,
				s.fields.map((f) => f.k),
				s.valid,
			]);
		expect(status()).toEqual([
			["you", true, ["name", "email", "enquiryType"], false],
			["business", false, [], true],
			["request", true, ["details", "callMe"], false],
		]);
		state = { ...state, values: { ...state.values, enquiryType: "supplier" } };
		expect(status()[1]).toEqual(["business", true, ["volume", "products"], false]);
		state = checkFields(enquiry, state, ["volume"]);
		expect(sectionStatus(enquiry, state)[1]?.errorCount).toBe(1);
	});
});
