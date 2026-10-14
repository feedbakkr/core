// Schema v2 in the builder: sections and conditions kept consistent as fields
// are added, removed, renamed and moved. The v1 reducer (reducer.ts) is
// FeedBakkr's and stays as it was; builderReducer wraps it.
import type { DslField, SchemaDslV1 } from "../schema/schema-dsl.js";
import type {
	Condition,
	DslFieldV2,
	SchemaDsl,
	SchemaDslV2,
	SchemaSection,
} from "../schema/schema-dsl-v2.js";
import { type SchemaAction, schemaReducer } from "./reducer.js";

export type BuilderAction =
	| Exclude<SchemaAction, { type: "LOAD_SCHEMA" }>
	| { type: "LOAD_SCHEMA"; schema: SchemaDsl }
	/** Start a section at this field: split its section, or group every field into one. */
	| { type: "START_SECTION"; index: number }
	| { type: "UPDATE_SECTION"; id: string; patch: Partial<Omit<SchemaSection, "id" | "fields">> }
	/** Remove a section; its fields join the section before it (or after, for the first). */
	| { type: "REMOVE_SECTION"; id: string };

/** Whether the schema needs v2: a condition, a section, help or a placeholder. */
export function usesV2(schema: SchemaDsl): boolean {
	if (schema.v === 2 && (schema.sections?.length ?? 0) > 0) return true;
	return (schema.fields as DslFieldV2[]).some(
		(f) =>
			f.when !== undefined ||
			f.help !== undefined ||
			f.placeholder !== undefined ||
			f.replyTo !== undefined,
	);
}

/** Marks the schema v2 only while it needs it, as core writes v1 whenever it can. */
export function withVersion(schema: SchemaDsl): SchemaDsl {
	if (usesV2(schema)) return { ...schema, v: 2 } as SchemaDslV2;
	const { sections: _sections, ...rest } = schema as SchemaDslV2;
	return { ...rest, v: 1 } as SchemaDslV1;
}

function sectionsOf(schema: SchemaDsl): SchemaSection[] {
	return schema.v === 2 ? (schema.sections ?? []) : [];
}

/** The index of each field's section, by field position. */
function assignment(schema: SchemaDsl): number[] {
	const sections = sectionsOf(schema);
	return schema.fields.map((f) =>
		Math.max(
			0,
			sections.findIndex((s) => s.fields.includes(f.k)),
		),
	);
}

/** Rebuilds the sections' field lists from an assignment, dropping empty sections. */
function withAssignment(schema: SchemaDsl, sectionOfField: number[]): SchemaDsl {
	const sections = sectionsOf(schema);
	if (sections.length === 0) return schema;
	const rebuilt = sections
		.map((section, i) => ({
			...section,
			fields: schema.fields.filter((_, j) => sectionOfField[j] === i).map((f) => f.k),
		}))
		.filter((section) => section.fields.length > 0);
	return { ...schema, sections: rebuilt } as SchemaDslV2;
}

function mapConditionKeys(c: Condition, rename: (k: string) => string): Condition {
	if ("all" in c) return { all: c.all.map((x) => mapConditionKeys(x, rename)) };
	if ("any" in c) return { any: c.any.map((x) => mapConditionKeys(x, rename)) };
	return { ...c, k: rename(c.k) };
}

/** Removes the parts of a condition that name `key`; undefined when nothing is left. */
export function withoutKey(c: Condition, key: string): Condition | undefined {
	if ("all" in c || "any" in c) {
		const parts = ("all" in c ? c.all : c.any)
			.map((x) => withoutKey(x, key))
			.filter((x): x is Condition => x !== undefined);
		if (parts.length === 0) return undefined;
		if (parts.length === 1) return parts[0];
		return "all" in c ? { all: parts } : { any: parts };
	}
	return c.k === key ? undefined : c;
}

/** Renames a field key in conditions, sections and the preview setting. */
export function renameKey(schema: SchemaDsl, from: string, to: string): SchemaDsl {
	const rename = (k: string) => (k === from ? to : k);
	const fields = (schema.fields as DslFieldV2[]).map((f) =>
		f.when ? { ...f, when: mapConditionKeys(f.when, rename) } : f,
	);
	let preview = schema.preview;
	if (preview?.mode === "custom") {
		preview = {
			...preview,
			fields: preview.fields.map(rename),
			...(preview.fallbackFields ? { fallbackFields: preview.fallbackFields.map(rename) } : {}),
		};
	}
	const next = { ...schema, fields, preview } as SchemaDsl;
	if (preview === undefined) delete (next as { preview?: unknown }).preview;
	if (schema.v !== 2 || !schema.sections) return next;
	return {
		...next,
		sections: schema.sections.map((s) => ({
			...s,
			fields: s.fields.map(rename),
			...(s.when ? { when: mapConditionKeys(s.when, rename) } : {}),
		})),
	} as SchemaDslV2;
}

/** Removes conditions on a field that is gone. Returns whether any were removed. */
export function dropReferences(
	schema: SchemaDsl,
	key: string,
): { schema: SchemaDsl; changed: boolean } {
	let changed = false;
	const clean = <T extends { when?: Condition }>(item: T): T => {
		if (!item.when) return item;
		const when = withoutKey(item.when, key);
		if (JSON.stringify(when) === JSON.stringify(item.when)) return item;
		changed = true;
		const { when: _old, ...rest } = item;
		return (when ? { ...rest, when } : rest) as T;
	};
	const fields = (schema.fields as DslFieldV2[]).map(clean);
	const sections = schema.v === 2 && schema.sections ? schema.sections.map(clean) : undefined;
	const next = { ...schema, fields, ...(sections ? { sections } : {}) } as SchemaDsl;
	return { schema: next, changed };
}

function newSectionId(schema: SchemaDsl): string {
	const ids = new Set(sectionsOf(schema).map((s) => s.id));
	let n = ids.size + 1;
	while (ids.has(`section_${n}`)) n++;
	return `section_${n}`;
}

/**
 * The builder's reducer: FeedBakkr's, plus sections, and keeping conditions
 * and sections in step with the fields. The result is marked v2 only while it
 * uses a v2 feature.
 */
export function builderReducer(state: SchemaDsl, action: BuilderAction): SchemaDsl {
	const v1 = (s: SchemaDsl, a: SchemaAction) =>
		schemaReducer(s as SchemaDslV1, a) as unknown as SchemaDsl;
	const sections = sectionsOf(state);

	switch (action.type) {
		case "LOAD_SCHEMA":
			return action.schema;
		case "ADD_FIELD": {
			const next = v1(state, action);
			if (sections.length === 0) return withVersion(next);
			return withVersion(withAssignment(next, [...assignment(state), sections.length - 1]));
		}
		case "REMOVE_FIELD": {
			const key = state.fields[action.index]?.k;
			const before = assignment(state).filter((_, i) => i !== action.index);
			let next = withAssignment(v1(state, action), before);
			if (key) next = dropReferences(next, key).schema;
			return withVersion(next);
		}
		case "UPDATE_FIELD": {
			const from = state.fields[action.index]?.k;
			let next = v1(state, action);
			if (from && from !== action.field.k) next = renameKey(next, from, action.field.k);
			return withVersion(next);
		}
		case "REORDER_FIELDS": {
			const order = assignment(state);
			const [moved] = order.splice(action.oldIndex, 1);
			order.splice(action.newIndex, 0, moved ?? 0);
			// The moved field joins the section of the field now above it.
			const at = action.newIndex;
			order[at] = at > 0 ? (order[at - 1] ?? 0) : (order[1] ?? 0);
			return withVersion(withAssignment(v1(state, action), order));
		}
		case "START_SECTION": {
			if (sections.length === 0) {
				return withVersion({
					...state,
					v: 2,
					sections: [
						{ id: newSectionId(state), title: "Section 1", fields: state.fields.map((f) => f.k) },
					],
				} as SchemaDslV2);
			}
			const key = state.fields[action.index]?.k;
			const owner = sections.find((s) => s.fields.includes(key ?? ""));
			if (!key || !owner || owner.fields[0] === key) return state;
			const at = owner.fields.indexOf(key);
			const split: SchemaSection = {
				id: newSectionId(state),
				title: `Section ${sections.length + 1}`,
				fields: owner.fields.slice(at),
			};
			return withVersion({
				...state,
				sections: sections.flatMap((s) =>
					s === owner ? [{ ...s, fields: s.fields.slice(0, at) }, split] : [s],
				),
			} as SchemaDslV2);
		}
		case "UPDATE_SECTION": {
			return withVersion({
				...state,
				sections: sections.map((s) => {
					if (s.id !== action.id) return s;
					const next = { ...s, ...action.patch };
					for (const key of ["desc", "when"] as const) {
						if (next[key] === undefined) delete next[key];
					}
					return next;
				}),
			} as SchemaDslV2);
		}
		case "REMOVE_SECTION": {
			const at = sections.findIndex((s) => s.id === action.id);
			if (at < 0) return state;
			if (sections.length === 1) return withVersion({ ...state, sections: [] } as SchemaDslV2);
			const target = at > 0 ? at - 1 : 1;
			const merged = sections.map((s, i) => {
				if (i !== target) return s;
				const fields =
					at > 0
						? [...s.fields, ...(sections[at]?.fields ?? [])]
						: [...(sections[at]?.fields ?? []), ...s.fields];
				return { ...s, fields };
			});
			return withVersion({
				...state,
				sections: merged.filter((_, i) => i !== at),
			} as SchemaDslV2);
		}
		default:
			return withVersion(v1(state, action));
	}
}

/** The fields a condition on the field at `index` may name: those before it. */
export function fieldsBefore(schema: SchemaDsl, index: number): DslField[] {
	return (schema.fields as DslField[]).slice(0, index);
}
