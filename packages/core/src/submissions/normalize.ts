import { resolveForm } from "../conditions/resolve.js";
import type { SchemaDsl } from "../schema/schema-dsl-v2.js";

export { normalizeValue } from "./normalize-value.js";

/**
 * Makes raw answers consistent before they are checked:
 *
 * - strings are trimmed, and an empty or blank answer counts as not given;
 * - `null` counts as not given;
 * - numbers and booleans sent as text (as an HTML form posts them) are read;
 * - empty list entries are dropped, and a single value for a list becomes a
 *   list of one;
 * - a hidden field that was not given takes its default;
 * - in schema v2, answers to fields whose conditions do not hold are dropped.
 *
 * Only the schema's fields are returned. Answers to other keys are dropped
 * here; `validateSubmission` reports them.
 */
export function normalizeSubmission(schema: SchemaDsl, raw: unknown): Record<string, unknown> {
	return resolveForm(schema, raw).values;
}
