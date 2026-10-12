import { type SchemaDslV1, schemaDslV1Schema } from "./schema-dsl.js";
import { validatePublishable } from "./schema-utils.js";
import { validateDefaults } from "./validate-defaults.js";

/**
 * Which check rejected the schema:
 * - `invalid_structure`: not a valid Schema DSL v1 document (Zod parse).
 * - `invalid_default`: a field's `default` does not fit its type or limits.
 * - `not_publishable`: valid as a draft, but cannot be published (no fields,
 *   duplicate keys, a preview config that names missing fields).
 */
export type SchemaIssueCode = "invalid_structure" | "invalid_default" | "not_publishable";

export interface SchemaIssue {
	code: SchemaIssueCode;
	message: string;
	/** Location inside the schema, e.g. `["fields", 2, "max"]`. Empty when the check has none. */
	path: (string | number)[];
}

export interface ValidateSchemaOptions {
	/**
	 * Also run the publish checks. FeedBakkr runs structure and default checks
	 * when a draft is saved, and the publish checks only when it is published.
	 * Defaults to `false`, matching a draft save.
	 */
	publish?: boolean;
}

export type ValidateSchemaResult =
	| { ok: true; schema: SchemaDslV1; issues: [] }
	| { ok: false; issues: SchemaIssue[] };

/**
 * Validate an unknown value as a FeedBakkr schema, running the same checks
 * FeedBakkr runs, in the same order: structure, then defaults, then (with
 * `publish: true`) the publish checks. Structure errors stop the run, because
 * the later checks need a parsed schema.
 */
export function validateSchema(
	input: unknown,
	options: ValidateSchemaOptions = {},
): ValidateSchemaResult {
	const parsed = schemaDslV1Schema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			issues: parsed.error.issues.map((issue) => ({
				code: "invalid_structure",
				message: issue.message,
				path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
			})),
		};
	}

	const issues: SchemaIssue[] = validateDefaults(parsed.data).errors.map((message) => ({
		code: "invalid_default",
		message,
		path: [],
	}));
	if (options.publish) {
		for (const message of validatePublishable(parsed.data).errors) {
			issues.push({ code: "not_publishable", message, path: [] });
		}
	}

	if (issues.length > 0) return { ok: false, issues };
	return { ok: true, schema: parsed.data, issues: [] };
}
