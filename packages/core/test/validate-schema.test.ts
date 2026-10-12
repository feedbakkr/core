import { describe, expect, it } from "vitest";
import { validateSchema } from "../src/index.js";

const valid = {
	v: 1,
	fields: [
		{ k: "name", label: "Name", t: "text", req: true },
		{ k: "topic", label: "Topic", t: "fixed", opts: [{ k: "a" }, { k: "b" }], default: "a" },
	],
};

describe("validateSchema", () => {
	it("returns the parsed schema when every check passes", () => {
		expect(validateSchema(valid)).toEqual({ ok: true, schema: valid, issues: [] });
		expect(validateSchema(valid, { publish: true }).ok).toBe(true);
	});

	it("reports structure errors with their path, and stops there", () => {
		const result = validateSchema({ v: 1, fields: [{ k: "name", label: "", t: "text" }] });
		expect(result.ok).toBe(false);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).toMatchObject({
			code: "invalid_structure",
			path: ["fields", 0, "label"],
		});
	});

	it("rejects anything that is not a schema", () => {
		for (const input of [undefined, null, "schema", [], { v: 2, fields: [] }]) {
			expect(validateSchema(input).ok).toBe(false);
		}
	});

	it("reports a default that does not fit its field", () => {
		const result = validateSchema({
			...valid,
			fields: [{ k: "topic", label: "Topic", t: "fixed", opts: [{ k: "a" }], default: "z" }],
		});
		expect(result.issues).toEqual([
			{
				code: "invalid_default",
				message: 'Default value for field "topic": must be one of: a',
				path: [],
			},
		]);
	});

	it("runs the publish checks only when asked, as FeedBakkr does on save", () => {
		const draft = { v: 1, fields: [] };
		expect(validateSchema(draft).ok).toBe(true);
		expect(validateSchema(draft, { publish: true }).issues).toEqual([
			{ code: "not_publishable", message: "Schema must have at least one field", path: [] },
		]);

		const duplicate = { v: 1, fields: [valid.fields[0], valid.fields[0]] };
		expect(validateSchema(duplicate).ok).toBe(true);
		expect(validateSchema(duplicate, { publish: true }).issues[0]?.message).toBe(
			'Duplicate field key: "name"',
		);
	});
});
