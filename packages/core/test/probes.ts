// Answers that probe each field's type and limits, shared by the tests that
// compare core's answer checks with FeedBakkr's.
import { type DslField, generateSampleData } from "../src/index.js";

/** Values that probe each field's type and limits. */
export function probesFor(field: DslField): unknown[] {
	const probes: unknown[] = [undefined, null, "", "   ", "x", 0, 1.5, -1, true, false, [], {}];
	if ("max" in field && typeof field.max === "number") {
		probes.push("a".repeat(field.max), "a".repeat(field.max + 1), field.max, field.max + 1);
	}
	if ("min" in field && typeof field.min === "number") {
		probes.push("a".repeat(field.min), "a".repeat(Math.max(0, field.min - 1)), field.min - 1);
	}
	// Either side of each default maximum length (500, 320 and 10,000).
	for (const n of [500, 320, 10_000]) probes.push("a".repeat(n), "a".repeat(n + 1));
	// 320 and 321 characters, valid apart from their length.
	probes.push("1".repeat(320), "1".repeat(321));
	probes.push(`https://example.com/${"a".repeat(300)}`, `https://example.com/${"a".repeat(301)}`);
	probes.push("a".repeat(600), "a".repeat(10_001));
	if (field.t === "fixed") probes.push(...field.opts.map((o) => o.k), "not-an-option");
	if (field.t === "dynlist") {
		probes.push(
			["a"],
			Array.from({ length: 101 }, () => "a"),
		);
		if (field.maxItems !== undefined) {
			for (const n of [field.maxItems, field.maxItems + 1]) {
				probes.push(Array.from({ length: n }, () => "a"));
			}
		}
	}
	if (field.t === "daterange") {
		probes.push({ from: "2026-01-01", to: "2026-01-02" }, { from: "2026-01-05", to: "2026-01-01" });
		// Ranges starting soon, in order and reversed, so they fall inside
		// relative bounds such as "today" to "+1y" and reach the order check.
		const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
		probes.push({ from: day(3), to: day(5) }, { from: day(5), to: day(3) });
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

export function payloadsFor(schema: { fields: DslField[] }): Record<string, unknown>[] {
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
