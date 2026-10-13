// The builder's reducer and helpers, moved from FeedBakkr's form-builder route.
import { describe, expect, it } from "vitest";
import {
	cleanPreviewFieldKeys,
	createDefaultField,
	migratePreviewConfig,
	schemaReducer,
	toCamelCase,
} from "../src/builder/reducer.js";
import { FIELD_TYPES, type SchemaDslV1 } from "../src/schema/schema-dsl.js";
import { validateSchema } from "../src/schema/validate-schema.js";

const schema: SchemaDslV1 = {
	v: 1,
	fields: [
		{ k: "name", label: "Name", t: "text" },
		{ k: "email", label: "Email", t: "email" },
		{ k: "topic", label: "Topic", t: "text" },
	],
	preview: { mode: "custom", fields: ["name", "topic"], fallbackFields: ["email"] },
};
const keys = (s: SchemaDslV1) => s.fields.map((f) => f.k);

describe("schemaReducer", () => {
	it("adds a field at the end", () => {
		const next = schemaReducer(schema, {
			type: "ADD_FIELD",
			field: { k: "phone", label: "Phone", t: "phone" },
		});
		expect(keys(next)).toEqual(["name", "email", "topic", "phone"]);
		expect(keys(schema)).toEqual(["name", "email", "topic"]);
	});

	it("replaces a field", () => {
		const next = schemaReducer(schema, {
			type: "UPDATE_FIELD",
			index: 1,
			field: { k: "email", label: "Work email", t: "email", req: true },
		});
		expect(next.fields[1]).toEqual({ k: "email", label: "Work email", t: "email", req: true });
	});

	it("removes a field and takes it out of the preview", () => {
		const next = schemaReducer(schema, { type: "REMOVE_FIELD", index: 2 });
		expect(keys(next)).toEqual(["name", "email"]);
		expect(next.preview).toEqual({ mode: "custom", fields: ["name"], fallbackFields: ["email"] });
	});

	it("falls back to an automatic preview when its last field is removed", () => {
		const one = { ...schema, preview: { mode: "custom" as const, fields: ["name"] } };
		expect(schemaReducer(one, { type: "REMOVE_FIELD", index: 0 }).preview).toEqual({
			mode: "auto",
		});
	});

	it("moves a field", () => {
		const next = schemaReducer(schema, { type: "REORDER_FIELDS", oldIndex: 0, newIndex: 2 });
		expect(keys(next)).toEqual(["email", "topic", "name"]);
	});

	it("sets the preview and the meta, and loads a schema", () => {
		expect(
			schemaReducer(schema, { type: "SET_PREVIEW", preview: { mode: "none" } }).preview,
		).toEqual({ mode: "none" });
		expect(schemaReducer(schema, { type: "SET_META", meta: "x" }).meta).toBe("x");
		const other: SchemaDslV1 = { v: 1, fields: [] };
		expect(schemaReducer(schema, { type: "LOAD_SCHEMA", schema: other })).toBe(other);
	});
});

describe("createDefaultField", () => {
	it.each(FIELD_TYPES)("makes a valid %s field", (type) => {
		const field = createDefaultField(type, "answer", "Answer");
		expect(field).toMatchObject({ k: "answer", label: "Answer", t: type });
		const result = validateSchema({ v: 1, fields: [field] }, { publish: true });
		expect(result.ok ? [] : result.issues).toEqual([]);
	});
});

describe("helpers", () => {
	it("makes a key from a label", () => {
		expect(toCamelCase("Full Name")).toBe("fullName");
		expect(toCamelCase("What's your e-mail?")).toBe("whatsYourEmail");
		expect(toCamelCase("2 Guests")).toBe("Guests");
	});

	it("upgrades an old preview config", () => {
		expect(migratePreviewConfig({ enabled: false })).toEqual({ mode: "none" });
		expect(migratePreviewConfig({ fieldKeys: ["name"] })).toEqual({
			mode: "custom",
			fields: ["name"],
			separator: " · ",
		});
		expect(migratePreviewConfig({ mode: "auto" })).toEqual({ mode: "auto" });
		expect(migratePreviewConfig(undefined)).toBeUndefined();
	});

	it("removes a key from a custom preview only", () => {
		expect(cleanPreviewFieldKeys({ mode: "auto" }, "name")).toEqual({ mode: "auto" });
	});
});
