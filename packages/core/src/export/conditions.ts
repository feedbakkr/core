// Conditions (schema v2) for the exports. Both exports describe stored
// answers, which validateSubmission has normalised: an answer to a field that
// does not apply is absent, so conditions can be judged on the answers as
// they are.
import type { DslField } from "../schema/schema-dsl.js";
import type { Condition, DslFieldV2, SchemaDsl } from "../schema/schema-dsl-v2.js";

/** Each field with a condition, and that condition joined with its section's. */
export function conditionalFields(schema: SchemaDsl): { field: DslFieldV2; when: Condition }[] {
	if (schema.v !== 2) return [];
	const sectionWhen = new Map<string, Condition>();
	for (const section of schema.sections ?? []) {
		if (section.when) for (const key of section.fields) sectionWhen.set(key, section.when);
	}
	return schema.fields.flatMap((field) => {
		const parts = [sectionWhen.get(field.k), field.when].filter(
			(c): c is Condition => c !== undefined,
		);
		if (parts.length === 0) return [];
		const when: Condition = parts.length === 1 ? (parts[0] as Condition) : { all: parts };
		return [{ field, when }];
	});
}

/** Whether the answer to this key is a list, so `eq` means "contains". */
export function isList(schema: SchemaDsl, key: string): boolean {
	return (schema.fields as DslField[]).find((f) => f.k === key)?.t === "dynlist";
}
