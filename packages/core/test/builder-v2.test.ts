// The builder's v2 reducer: sections and conditions stay consistent as fields
// change, and the schema is v2 only while it needs to be.
import { describe, expect, it } from "vitest";
import { type BuilderAction, builderReducer, withoutKey } from "../src/builder/v2-ops.js";
import type { SchemaDsl, SchemaDslV2 } from "../src/schema/schema-dsl-v2.js";
import { validateSchema } from "../src/schema/validate-schema.js";

const text = (k: string) => ({ k, label: k.toUpperCase(), t: "text" as const });

const grouped: SchemaDslV2 = {
	v: 2,
	fields: [
		{ k: "kind", label: "Kind", t: "fixed", opts: [{ k: "a" }, { k: "b" }] },
		text("x"),
		{ ...text("y"), when: { k: "kind", eq: "b" } },
		text("z"),
	],
	sections: [
		{ id: "s1", title: "One", fields: ["kind", "x"] },
		{ id: "s2", title: "Two", fields: ["y", "z"], when: { k: "kind", filled: true } },
	],
};

function run(state: SchemaDsl, ...actions: BuilderAction[]): SchemaDsl {
	return actions.reduce(builderReducer, state);
}

function valid(schema: SchemaDsl): boolean {
	return validateSchema(schema, { allowV2: true }).ok;
}

describe("version", () => {
	it("becomes v2 with a condition and returns to v1 without one", () => {
		const v1: SchemaDsl = { v: 1, fields: [text("a"), text("b")] };
		const conditional = run(v1, {
			type: "UPDATE_FIELD",
			index: 1,
			field: { ...text("b"), when: { k: "a", filled: true } } as never,
		});
		expect(conditional.v).toBe(2);
		const plain = run(conditional, { type: "UPDATE_FIELD", index: 1, field: text("b") });
		expect(plain).toEqual(v1);
	});

	it("becomes v2 when grouped into sections, and v1 when the last section goes", () => {
		const v1: SchemaDsl = { v: 1, fields: [text("a"), text("b")] };
		const sectioned = run(v1, { type: "START_SECTION", index: 0 });
		expect(sectioned).toEqual({
			v: 2,
			fields: v1.fields,
			sections: [{ id: "section_1", fields: ["a", "b"] }],
		});
		expect(run(sectioned, { type: "REMOVE_SECTION", id: "section_1" })).toEqual(v1);
	});
});

describe("sections", () => {
	it("splits a section at a field, and refuses to split at a section's first field", () => {
		const split = run(grouped, { type: "START_SECTION", index: 1 }) as SchemaDslV2;
		expect(split.sections?.map((s) => [s.id, s.fields])).toEqual([
			["s1", ["kind"]],
			["section_3", ["x"]],
			["s2", ["y", "z"]],
		]);
		expect(valid(split)).toBe(true);
		expect(run(grouped, { type: "START_SECTION", index: 2 })).toBe(grouped);
	});

	it("puts a new field in the last section", () => {
		const next = run(grouped, { type: "ADD_FIELD", field: text("w") }) as SchemaDslV2;
		expect(next.sections?.[1]?.fields).toEqual(["y", "z", "w"]);
	});

	it("moves a field into the section of the field above it", () => {
		const down = run(grouped, { type: "REORDER_FIELDS", oldIndex: 1, newIndex: 3 }) as SchemaDslV2;
		expect(down.fields.map((f) => f.k)).toEqual(["kind", "y", "z", "x"]);
		expect(down.sections?.map((s) => s.fields)).toEqual([["kind"], ["y", "z", "x"]]);
		const top = run(grouped, { type: "REORDER_FIELDS", oldIndex: 3, newIndex: 0 }) as SchemaDslV2;
		expect(top.sections?.map((s) => s.fields)).toEqual([["z", "kind", "x"], ["y"]]);
	});

	it("drops a section that loses its last field", () => {
		const next = run(
			grouped,
			{ type: "REMOVE_FIELD", index: 3 },
			{ type: "REMOVE_FIELD", index: 2 },
		) as SchemaDslV2;
		expect(next.sections?.map((s) => s.id)).toEqual(["s1"]);
	});

	it("merges a removed section into the one before it, or after it for the first", () => {
		const second = run(grouped, { type: "REMOVE_SECTION", id: "s2" }) as SchemaDslV2;
		expect(second.sections).toEqual([{ id: "s1", title: "One", fields: ["kind", "x", "y", "z"] }]);
		const first = run(grouped, { type: "REMOVE_SECTION", id: "s1" }) as SchemaDslV2;
		expect(first.sections?.[0]).toMatchObject({ id: "s2", fields: ["kind", "x", "y", "z"] });
	});

	it("updates a section's title, description and condition", () => {
		const next = run(grouped, {
			type: "UPDATE_SECTION",
			id: "s2",
			patch: { title: "Later", desc: "More", when: undefined },
		}) as SchemaDslV2;
		expect(next.sections?.[1]).toEqual({
			id: "s2",
			title: "Later",
			desc: "More",
			fields: ["y", "z"],
		});
	});
});

describe("conditions follow the fields", () => {
	it("renaming a key renames it in conditions, sections and the preview", () => {
		const withPreview = { ...grouped, preview: { mode: "custom" as const, fields: ["kind"] } };
		const next = run(withPreview, {
			type: "UPDATE_FIELD",
			index: 0,
			field: { ...grouped.fields[0], k: "type" } as never,
		}) as SchemaDslV2;
		expect(next.fields[2]?.when).toEqual({ k: "type", eq: "b" });
		expect(next.sections?.[0]?.fields).toEqual(["type", "x"]);
		expect(next.sections?.[1]?.when).toEqual({ k: "type", filled: true });
		expect(next.preview).toEqual({ mode: "custom", fields: ["type"] });
		expect(valid(next)).toBe(true);
	});

	it("removing a field removes the conditions on it", () => {
		const next = run(grouped, { type: "REMOVE_FIELD", index: 0 }) as SchemaDslV2;
		expect(next.fields.find((f) => f.k === "y")).toEqual(text("y"));
		expect(next.sections?.find((s) => s.id === "s2")).not.toHaveProperty("when");
		expect(valid(next)).toBe(true);
	});

	it("simplifies all and any when one part is left", () => {
		const c = {
			all: [
				{ k: "a", filled: true as const },
				{ k: "b", eq: "x" },
			],
		};
		expect(withoutKey(c, "a")).toEqual({ k: "b", eq: "x" });
		expect(withoutKey({ any: [{ k: "a", empty: true as const }, c] }, "a")).toEqual({
			k: "b",
			eq: "x",
		});
		expect(withoutKey({ k: "a", filled: true }, "a")).toBeUndefined();
	});
});
