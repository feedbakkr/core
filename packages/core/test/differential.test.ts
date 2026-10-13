// Core must accept and reject exactly what FeedBakkr does. Each case runs
// through core and through the verbatim FeedBakkr copies in
// test/reference/feedbakkr-8ae744e, and the two verdicts must match.
import { describe, expect, it } from "vitest";
import { generateZod, schemaDslV1Schema } from "../src/index.js";
import { allFixtures } from "./fixtures.js";
import { payloadsFor } from "./probes.js";
import { generateZod as refGenerateZod } from "./reference/feedbakkr-8ae744e/generate-zod.js";
import { schemaDslV1Schema as refSchema } from "./reference/feedbakkr-8ae744e/schema-dsl.js";

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
