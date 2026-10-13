import type { z } from "zod";
import { type SchemaDslV1, schemaDslV1Schema } from "./schema-dsl.js";
import { type SchemaDsl, schemaDslV2Schema } from "./schema-dsl-v2.js";
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
	/**
	 * Accept schema v2 (conditions and sections) as well as v1. Off by
	 * default, so an app whose forms only render v1 cannot take in a v2
	 * schema by accident.
	 */
	allowV2?: boolean;
	/** Refuse schemas with more fields than this. v1 always allows at most 25. */
	maxFields?: number;
}

export type ValidateSchemaResult<S extends SchemaDsl = SchemaDslV1> =
	| { ok: true; schema: S; issues: [] }
	| { ok: false; issues: SchemaIssue[] };

function structureIssues(error: z.ZodError): SchemaIssue[] {
	return error.issues.map((issue) => ({
		code: "invalid_structure",
		message: issue.message,
		path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
	}));
}

/**
 * Validate an unknown value as a FeedBakkr schema, running the same checks
 * FeedBakkr runs, in the same order: structure, then defaults, then (with
 * `publish: true`) the publish checks. Structure errors stop the run, because
 * the later checks need a parsed schema. With `allowV2: true`, a v2 schema is
 * checked by the v2 rules (see schema-dsl-v2.ts) and then by the same checks.
 */
export function validateSchema(
	input: unknown,
	options?: ValidateSchemaOptions & { allowV2?: false },
): ValidateSchemaResult<SchemaDslV1>;
export function validateSchema(
	input: unknown,
	options: ValidateSchemaOptions & { allowV2: true },
): ValidateSchemaResult<SchemaDsl>;
export function validateSchema(
	input: unknown,
	options: ValidateSchemaOptions = {},
): ValidateSchemaResult<SchemaDsl> {
	const isV2 = typeof input === "object" && input !== null && (input as { v?: unknown }).v === 2;
	if (isV2 && !options.allowV2) {
		return {
			ok: false,
			issues: [
				{
					code: "invalid_structure",
					message: "This is a v2 schema, which is not accepted here (pass allowV2: true)",
					path: ["v"],
				},
			],
		};
	}
	const parsed = isV2 ? schemaDslV2Schema.safeParse(input) : schemaDslV1Schema.safeParse(input);
	if (!parsed.success) return { ok: false, issues: structureIssues(parsed.error) };
	const schema = parsed.data as SchemaDsl;

	const issues: SchemaIssue[] = [];
	if (options.maxFields !== undefined && schema.fields.length > options.maxFields) {
		issues.push({
			code: "invalid_structure",
			message: `At most ${options.maxFields} fields are allowed`,
			path: ["fields"],
		});
		return { ok: false, issues };
	}
	// The default and publish checks read fields and preview, which v2 shares.
	const asV1 = schema as unknown as SchemaDslV1;
	for (const message of validateDefaults(asV1).errors) {
		issues.push({ code: "invalid_default", message, path: [] });
	}
	if (options.publish) {
		for (const message of validatePublishable(asV1).errors) {
			issues.push({ code: "not_publishable", message, path: [] });
		}
	}

	if (issues.length > 0) return { ok: false, issues };
	return { ok: true, schema, issues: [] };
}
