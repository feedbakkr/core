import type { DslField } from "../schema/schema-dsl.js";
import type { DslFieldV2, SchemaDsl, SchemaSection } from "../schema/schema-dsl-v2.js";
import { isPlainObject, normalizeValue } from "../submissions/normalize-value.js";
import { evaluateCondition } from "./evaluate.js";

export interface ResolvedForm {
	/** The normalised answers to the fields that apply. */
	values: Record<string, unknown>;
	/** The fields that apply, in order: their own and their section's conditions hold. */
	fields: DslFieldV2[];
	/** Each section, and whether it applies. Empty for a schema without sections. */
	sections: { section: SchemaSection; applies: boolean }[];
}

/**
 * Works out which fields apply to these answers, top to bottom. A field
 * applies when its section's condition and its own hold, judged on the
 * normalised answers to the fields above it. A field that does not apply is
 * treated as unanswered: its answer is dropped, and conditions below it see it
 * as empty. In schema v1 every field applies.
 *
 * A hidden field that applies and was not answered takes its default.
 */
export function resolveForm(schema: SchemaDsl, raw: unknown): ResolvedForm {
	const input = isPlainObject(raw) ? raw : {};
	const sections = schema.v === 2 ? (schema.sections ?? []) : [];
	const sectionOf = new Map<string, SchemaSection>();
	for (const section of sections) for (const key of section.fields) sectionOf.set(key, section);

	const values: Record<string, unknown> = {};
	const fields: DslFieldV2[] = [];
	const applies = new Map<string, boolean>();
	for (const field of schema.fields as DslFieldV2[]) {
		const section = sectionOf.get(field.k);
		if (section && !applies.has(section.id)) {
			// Judged when its first field is reached: it names only earlier fields.
			applies.set(section.id, !section.when || evaluateCondition(section.when, values));
		}
		if (section && !applies.get(section.id)) continue;
		if (field.when && !evaluateCondition(field.when, values)) continue;

		fields.push(field);
		let value = normalizeValue(field as DslField, input[field.k]);
		if (
			value === undefined &&
			field.hidden &&
			field.default !== undefined &&
			field.default !== null
		) {
			value = normalizeValue(field as DslField, field.default);
		}
		if (value !== undefined) values[field.k] = value;
	}
	return {
		values,
		fields,
		sections: sections.map((section) => ({ section, applies: applies.get(section.id) ?? false })),
	};
}

/** The fields that apply to these answers (see `resolveForm`), hidden ones included. */
export function visibleFields(schema: SchemaDsl, values: unknown): DslFieldV2[] {
	return resolveForm(schema, values).fields;
}

/** The sections that apply to these answers. */
export function visibleSections(schema: SchemaDsl, values: unknown): SchemaSection[] {
	return resolveForm(schema, values)
		.sections.filter((s) => s.applies)
		.map((s) => s.section);
}
