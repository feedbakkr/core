// Core must accept and reject exactly what FeedBakkr does. Each case runs
// through core and through the verbatim FeedBakkr copies in
// test/reference/feedbakkr-8ae744e, and the two verdicts must match.
import { describe, expect, it } from "vitest";
import { type DslField, generateSampleData, generateZod, schemaDslV1Schema } from "../src/index.js";
import { allFixtures } from "./fixtures.js";
import { generateZod as refGenerateZod } from "./reference/feedbakkr-8ae744e/generate-zod.js";
import { schemaDslV1Schema as refSchema } from "./reference/feedbakkr-8ae744e/schema-dsl.js";

/** Values that probe each field's type and limits. */
function probesFor(field: DslField): unknown[] {
	const probes: unknown[] = [undefined, null, "", "   ", "x", 0, 1.5, -1, true, false, [], {}];
	if ("max" in field && typeof field.max === "number") {
		probes.push("a".repeat(field.max), "a".repeat(field.max + 1), field.max, field.max + 1);
	}
	if ("min" in field && typeof field.min === "number") {
		probes.push("a".repeat(field.min), "a".repeat(Math.max(0, field.min - 1)), field.min - 1);
	}
	probes.push("a".repeat(600), "a".repeat(10_001));
	if (field.t === "fixed") probes.push(...field.opts.map((o) => o.k), "not-an-option");
	if (field.t === "dynlist")
		probes.push(
			["a"],
			Array.from({ length: 101 }, () => "a"),
		);
	if (field.t === "daterange") {
		probes.push({ from: "2026-01-01", to: "2026-01-02" }, { from: "2026-01-05", to: "2026-01-01" });
	}
	probes.push(
		"2026-01-01",
		"2026-01-01T09:00",
		"09:00",
		"25:00",
		"name@example.com",
		"https://example.com",
		"+44 20 7946 0000",
	);
	return probes;
}

function payloadsFor(schema: { fields: DslField[] }): Record<string, unknown>[] {
	const base = generateSampleData(schema as never);
	const payloads: Record<string, unknown>[] = [{}, base, { ...base, unknownKey: "x" }];
	for (let i = 0; i < 5; i++) payloads.push(generateSampleData(schema as never));
	for (const field of schema.fields) {
		for (const probe of probesFor(field)) {
			payloads.push({ ...base, [field.k]: probe });
		}
	}
	return payloads;
}

describe.each(allFixtures())("$name", ({ schema }) => {
	it("validates payloads exactly as FeedBakkr does", () => {
		const core = generateZod(schemaDslV1Schema.parse(schema));
		const ref = refGenerateZod(refSchema.parse(schema));
		for (const payload of payloadsFor(schemaDslV1Schema.parse(schema))) {
			const a = core.safeParse(payload);
			const b = ref.safeParse(payload);
			expect({ payload, ok: a.success }).toEqual({ payload, ok: b.success });
			if (a.success && b.success) expect(a.data).toEqual(b.data);
		}
	});

	it("accepts and rejects broken schemas exactly as FeedBakkr does", () => {
		const fields = schema.fields as Record<string, unknown>[];
		const first = fields[0] ?? {};
		const variants: unknown[] = [
			schema,
			{ ...schema, v: 2 },
			{ ...schema, fields: undefined },
			{ ...schema, fields: Array.from({ length: 26 }, (_, i) => ({ ...first, k: `f${i}` })) },
			{ ...schema, fields: [{ ...first, k: "1bad" }, ...fields.slice(1)] },
			{ ...schema, fields: [{ ...first, label: "" }, ...fields.slice(1)] },
			{ ...schema, fields: [{ ...first, t: "rating" }, ...fields.slice(1)] },
			{ ...schema, fields: [{ ...first, max: -1 }, ...fields.slice(1)] },
			{ ...schema, title: "" },
			{ ...schema, preview: { mode: "custom", fields: [] } },
		];
		for (const variant of variants) {
			const a = schemaDslV1Schema.safeParse(variant);
			const b = refSchema.safeParse(variant);
			expect(a.success).toBe(b.success);
			if (a.success && b.success) expect(a.data).toEqual(b.data);
		}
	});
});
