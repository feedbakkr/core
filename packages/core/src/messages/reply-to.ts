import type { DslFieldV2, SchemaDsl } from "../schema/schema-dsl-v2.js";

/** The key of the field marked as the reply address (`replyTo`), or null. */
export function replyToField(schema: SchemaDsl): string | null {
	const field = (schema.fields as DslFieldV2[]).find((f) => f.replyTo === true);
	return field ? field.k : null;
}

/**
 * Where a reply to these answers goes: the answer to the field marked
 * `replyTo`, trimmed, or null when the schema marks none or it was left
 * empty. The answers are not searched for anything that looks like an
 * address: only the marked field counts.
 */
export function replyToOf(schema: SchemaDsl, values: Record<string, unknown>): string | null {
	const key = replyToField(schema);
	if (!key) return null;
	const value = values[key];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
