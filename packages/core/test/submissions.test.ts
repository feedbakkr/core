// validateSubmission: a table of answers per field type, then every way it
// deliberately differs from FeedBakkr's validator, shown next to FeedBakkr's
// verdict from the reference copy.
import { describe, expect, it } from "vitest";
import type { DslField, SchemaDslV1 } from "../src/schema/schema-dsl.js";
import {
	normalizeSubmission,
	type SubmissionErrorCode,
	validateFields,
	validateSubmission,
} from "../src/submissions/index.js";
import { generateZod as refGenerateZod } from "./reference/feedbakkr-8ae744e/generate-zod.js";

const NOW = new Date("2026-06-15T12:00:00Z");

function one(field: Record<string, unknown>): SchemaDslV1 {
	return { v: 1, fields: [{ k: "a", label: "A", ...field } as DslField] };
}

/** The codes for field `a`, or "ok". */
function verdict(field: Record<string, unknown>, value: unknown): SubmissionErrorCode[] | "ok" {
	const result = validateSubmission(one(field), value === undefined ? {} : { a: value }, {
		now: NOW,
	});
	return result.ok ? "ok" : (result.errors.a ?? []).map((e) => e.code);
}

type Row = [unknown, SubmissionErrorCode[] | "ok"];

const TABLE: [string, Record<string, unknown>, Row[]][] = [
	[
		"text",
		{ t: "text", req: true, min: 2, max: 5 },
		[
			["ab", "ok"],
			["  ab  ", "ok"],
			[undefined, ["required"]],
			["", ["required"]],
			["   ", ["required"]],
			["a", ["too_short"]],
			["abcdef", ["too_long"]],
			[12, ["invalid_type"]],
		],
	],
	[
		"text, default maximum",
		{ t: "text" },
		[
			["a".repeat(500), "ok"],
			["a".repeat(501), ["too_long"]],
		],
	],
	[
		"textarea",
		{ t: "textarea", max: 3 },
		[
			["abc", "ok"],
			["abcd", ["too_long"]],
			[undefined, "ok"],
		],
	],
	[
		"markdown",
		{ t: "markdown" },
		[
			["**hi**  ", "ok"],
			["a".repeat(10_001), ["too_long"]],
			[[], ["invalid_type"]],
		],
	],
	[
		"email",
		{ t: "email" },
		[
			["ada@example.com", "ok"],
			["ada@", ["invalid_email"]],
			[`${"a".repeat(320)}@x.io`, ["too_long"]],
		],
	],
	[
		"url",
		{ t: "url" },
		[
			["https://example.com/a", "ok"],
			["example", ["invalid_url"]],
		],
	],
	[
		"phone",
		{ t: "phone" },
		[
			["+44 20 7946 0000", "ok"],
			["020 7946-0000", "ok"],
			// FeedBakkr's rule: it must start with + or a digit.
			["(020) 7946-0000", ["invalid_phone"]],
			["call me", ["invalid_phone"]],
		],
	],
	[
		"date",
		{ t: "date", min: "today", max: "+1m" },
		[
			["2026-06-15", "ok"],
			["2026-07-15", "ok"],
			["2026-06-14", ["out_of_range"]],
			["2026-07-16", ["out_of_range"]],
			["15/06/2026", ["invalid_date"]],
		],
	],
	[
		"datetime",
		{ t: "datetime", min: "2026-01-01T09:00" },
		[
			["2026-01-01T09:00", "ok"],
			["2026-01-01T08:59", ["out_of_range"]],
			["2026-01-01 09:00", ["invalid_datetime"]],
		],
	],
	[
		"time",
		{ t: "time", min: "09:00", max: "17:30" },
		[
			["09:00", "ok"],
			["17:31", ["out_of_range"]],
			["24:00", ["invalid_time"]],
			["9:00", ["invalid_time"]],
		],
	],
	[
		"daterange",
		{ t: "daterange", minSpanDays: 1, maxSpanDays: 7 },
		[
			[{ from: "2026-07-01", to: "2026-07-03" }, "ok"],
			[{ from: "2026-07-03", to: "2026-07-01" }, ["invalid_range", "out_of_range"]],
			[{ from: "2026-07-01", to: "2026-07-01" }, ["out_of_range"]],
			[{ from: "2026-07-01", to: "2026-07-20" }, ["out_of_range"]],
			[{ from: "2026-07-01" }, ["invalid_date"]],
			[{ from: "", to: "" }, "ok"],
			["2026-07-01", ["invalid_type"]],
		],
	],
	[
		"bool",
		{ t: "bool", req: true },
		[
			[true, "ok"],
			[false, "ok"],
			["on", "ok"],
			["no", "ok"],
			["maybe", ["invalid_type"]],
			[undefined, ["required"]],
		],
	],
	[
		"number",
		{ t: "number", min: 0, max: 10 },
		[
			[2.5, "ok"],
			["2.5", "ok"],
			[11, ["out_of_range"]],
			[-1, ["out_of_range"]],
			["ten", ["invalid_type"]],
			[Number.NaN, ["invalid_type"]],
			[Number.POSITIVE_INFINITY, ["invalid_type"]],
		],
	],
	[
		"integer",
		{ t: "integer", min: 1, max: 5 },
		[
			[3, "ok"],
			["4", "ok"],
			[2.5, ["not_integer"]],
			[0, ["out_of_range"]],
		],
	],
	[
		"fixed",
		{ t: "fixed", opts: [{ k: "s" }, { k: "m" }] },
		[
			["s", "ok"],
			[" m ", "ok"],
			["xl", ["invalid_option"]],
			[1, ["invalid_option"]],
		],
	],
	[
		"dynlist",
		{ t: "dynlist", maxItems: 2, item: { k: "i", label: "I", t: "integer", max: 9 } },
		[
			[[1, 2], "ok"],
			[["1", "", null, 2], "ok"],
			[[1, 2, 3], ["too_many_items"]],
			[[1, 20], ["out_of_range"]],
			[[], "ok"],
			[{}, ["invalid_type"]],
		],
	],
];

describe.each(TABLE)("%s", (_name, field, rows) => {
	it.each(rows)("%j: %j", (value, expected) => {
		expect(verdict(field, value)).toEqual(expected);
	});
});

describe("errors", () => {
	it("say where in a list or range the problem is", () => {
		const list = validateSubmission(
			one({ t: "dynlist", item: { k: "i", label: "I", t: "email" } }),
			{ a: ["ada@example.com", "nope"] },
		);
		expect(list).toMatchObject({
			ok: false,
			errors: { a: [{ code: "invalid_email", path: [1] }] },
		});
		const range = validateSubmission(one({ t: "daterange" }), {
			a: { from: "x", to: "2026-01-01" },
		});
		expect(range).toMatchObject({ errors: { a: [{ code: "invalid_date", path: ["from"] }] } });
	});

	it("give back the normalised answers with the errors", () => {
		const schema: SchemaDslV1 = {
			v: 1,
			fields: [
				{ k: "name", label: "Name", t: "text", req: true },
				{ k: "email", label: "Email", t: "email" },
			],
		};
		expect(validateSubmission(schema, { name: " Ada ", email: "nope" })).toEqual({
			ok: false,
			values: { name: "Ada", email: "nope" },
			errors: { email: [{ code: "invalid_email", message: "Invalid email address" }] },
		});
	});

	it("refuse answers that are not an object", () => {
		expect(validateSubmission(one({ t: "text" }), "hello")).toMatchObject({
			ok: false,
			errors: { "": [{ code: "invalid_type" }] },
		});
	});
});

describe("validateFields", () => {
	const schema: SchemaDslV1 = {
		v: 1,
		fields: [
			{ k: "name", label: "Name", t: "text", req: true },
			{ k: "email", label: "Email", t: "email", req: true },
		],
	};

	it("reports only the fields asked about", () => {
		expect(validateFields(schema, { email: "nope" }, ["email"])).toEqual({
			ok: false,
			errors: { email: [{ code: "invalid_email", message: "Invalid email address" }] },
		});
		expect(validateFields(schema, { email: "ada@example.com" }, ["email"])).toEqual({
			ok: true,
			errors: {},
		});
	});
});

// ─── Differences from FeedBakkr ───────────────────────────────────────────────
// FeedBakkr checked answers with generateZod alone. Each test shows its
// verdict (the reference copy) and core's.

function feedbakkr(field: Record<string, unknown>, answers: unknown): boolean {
	return refGenerateZod(one(field)).safeParse(answers).success;
}

function core(field: Record<string, unknown>, answers: unknown) {
	return validateSubmission(one(field), answers, { now: NOW });
}

describe("differences from FeedBakkr", () => {
	it("1. required text refuses an empty or blank answer", () => {
		const field = { t: "text", req: true };
		for (const blank of ["", "   "]) {
			expect(feedbakkr(field, { a: blank })).toBe(true);
			expect(core(field, { a: blank })).toMatchObject({ errors: { a: [{ code: "required" }] } });
		}
	});

	it("2. strings are trimmed before they are checked and stored", () => {
		const field = { t: "email" };
		expect(feedbakkr(field, { a: " ada@example.com " })).toBe(false);
		expect(core(field, { a: " ada@example.com " })).toEqual({
			ok: true,
			values: { a: "ada@example.com" },
		});
	});

	it("3. an empty optional answer counts as not given", () => {
		expect(feedbakkr({ t: "email" }, { a: "" })).toBe(false);
		expect(core({ t: "email" }, { a: "" })).toEqual({ ok: true, values: {} });
		expect(refGenerateZod(one({ t: "text" })).parse({ a: "" })).toEqual({ a: "" });
		expect(core({ t: "text" }, { a: "" })).toEqual({ ok: true, values: {} });
	});

	it("4. null counts as not given", () => {
		expect(feedbakkr({ t: "text" }, { a: null })).toBe(false);
		expect(core({ t: "text" }, { a: null })).toEqual({ ok: true, values: {} });
		expect(core({ t: "text", req: true }, { a: null })).toMatchObject({
			errors: { a: [{ code: "required" }] },
		});
	});

	it("5. answers to unknown keys are refused, unless told to drop them", () => {
		expect(refGenerateZod(one({ t: "text" })).parse({ a: "x", b: "y" })).toEqual({ a: "x" });
		expect(core({ t: "text" }, { a: "x", b: "y" })).toMatchObject({
			ok: false,
			errors: { b: [{ code: "unknown_field" }] },
		});
		expect(
			validateSubmission(one({ t: "text" }), { a: "x", b: "y" }, { unknownFields: "strip" }),
		).toEqual({ ok: true, values: { a: "x" } });
	});

	it("6. numbers and yes or no are read from form text", () => {
		expect(feedbakkr({ t: "integer" }, { a: "4" })).toBe(false);
		expect(core({ t: "integer" }, { a: "4" })).toEqual({ ok: true, values: { a: 4 } });
		expect(feedbakkr({ t: "bool" }, { a: "on" })).toBe(false);
		expect(core({ t: "bool" }, { a: "on" })).toEqual({ ok: true, values: { a: true } });
	});

	it("7. empty list entries are dropped, and a single value is a list of one", () => {
		const field = { t: "dynlist", item: { k: "i", label: "I", t: "text" } };
		expect(refGenerateZod(one(field)).parse({ a: ["x", undefined] })).toEqual({
			a: ["x", undefined],
		});
		expect(core(field, { a: ["x", undefined, "", " "] })).toEqual({
			ok: true,
			values: { a: ["x"] },
		});
		expect(feedbakkr(field, { a: "x" })).toBe(false);
		expect(core(field, { a: "x" })).toEqual({ ok: true, values: { a: ["x"] } });
	});

	it("8. a hidden field that was not given takes its default", () => {
		const field = { t: "text", hidden: true, default: "web" };
		expect(refGenerateZod(one(field)).parse({})).toEqual({});
		expect(core(field, {})).toEqual({ ok: true, values: { a: "web" } });
		expect(core(field, { a: "app" })).toEqual({ ok: true, values: { a: "app" } });
	});
});

describe("normalizeSubmission", () => {
	it("returns only the schema's fields", () => {
		expect(normalizeSubmission(one({ t: "text" }), { a: " x ", other: 1 })).toEqual({ a: "x" });
		expect(normalizeSubmission(one({ t: "text" }), null)).toEqual({});
	});
});
