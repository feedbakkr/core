import { describe, expect, it } from "vitest";
import {
	canonicalizeDsl,
	canonicalJson,
	hashDsl,
	hashSchema,
	type SchemaDslV1,
} from "../src/index.js";

const a = { v: 1, fields: [{ k: "name", label: "Name", t: "text", req: true }] };
const sameKeysReordered = { fields: [{ t: "text", req: true, label: "Name", k: "name" }], v: 1 };

describe("canonical hash", () => {
	it("sorts keys at every level and keeps array order", () => {
		expect(canonicalJson(sameKeysReordered)).toBe(canonicalJson(a));
		expect(canonicalJson({ b: 1, a: [3, 1, { d: 1, c: 2 }] })).toBe(
			'{"a":[3,1,{"c":2,"d":1}],"b":1}',
		);
		expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
	});

	it("gives the same hash whatever the key order", async () => {
		expect(await hashSchema(sameKeysReordered)).toBe(await hashSchema(a));
		expect(await hashSchema(a)).toMatch(/^[0-9a-f]{64}$/);
	});

	it("changes when the schema changes, including field order", async () => {
		const reordered = { v: 1, fields: [...a.fields, { k: "b", label: "B", t: "bool" }].reverse() };
		const added = { v: 1, fields: [...a.fields, { k: "b", label: "B", t: "bool" }] };
		expect(await hashSchema(reordered)).not.toBe(await hashSchema(added));
	});

	it("keeps FeedBakkr's order-sensitive hash for comparing stored hashes", async () => {
		const legacy = await hashDsl(canonicalizeDsl(a as SchemaDslV1));
		expect(legacy).toBe(await hashDsl(JSON.stringify(a)));
		expect(await hashDsl(canonicalizeDsl(sameKeysReordered as unknown as SchemaDslV1))).not.toBe(
			legacy,
		);
	});
});
