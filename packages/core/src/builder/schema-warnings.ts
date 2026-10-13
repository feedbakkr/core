import type { DslField, SchemaDslV1 } from "../schema/schema-dsl.js";

export interface SchemaWarning {
	fieldKey: string | null;
	fieldLabel: string | null;
	message: string;
}

/** Default max length applied internally when a text/textarea field has no max set. */
export const DEFAULT_TEXT_MAX_LENGTH = 500;

export function getSchemaWarnings(schema: SchemaDslV1): SchemaWarning[] {
	const warnings: SchemaWarning[] = [];

	if (schema.fields.length === 0) return warnings;

	// Check if any field is required
	const hasRequired = schema.fields.some((f) => f.req);
	if (!hasRequired) {
		warnings.push({
			fieldKey: null,
			fieldLabel: null,
			message:
				"No fields are marked as required. This means completely empty submissions will be accepted.",
		});
	}

	// Per-field checks
	for (const field of schema.fields) {
		checkField(field, warnings);
	}

	return warnings;
}

function checkField(field: DslField, warnings: SchemaWarning[]) {
	if (field.t === "text" || field.t === "textarea") {
		if (field.max === undefined) {
			warnings.push({
				fieldKey: field.k,
				fieldLabel: field.label,
				message: `No maximum length set. An internal default of ${DEFAULT_TEXT_MAX_LENGTH} characters will be applied.`,
			});
		}
	}

	if (field.t === "email" || field.t === "url" || field.t === "phone") {
		if (field.max === undefined) {
			warnings.push({
				fieldKey: field.k,
				fieldLabel: field.label,
				message: "No maximum length set. An internal default of 320 characters will be applied.",
			});
		}
	}

	if (field.t === "dynlist") {
		if (field.maxItems === undefined) {
			warnings.push({
				fieldKey: field.k,
				fieldLabel: field.label,
				message:
					"No maximum items limit set. Consider adding one to prevent oversized submissions.",
			});
		}
		// Check the nested item type
		checkField({ ...field.item, k: field.k, label: field.label } as DslField, warnings);
	}
}
