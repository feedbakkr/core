// The one-line inbox summary of a submission. Moved from FeedBakkr's
// generatePreviewText (apps/api/.../preview-generation.service.ts at 8ae744e)
// with two changes, both tested in test/messages.test.ts:
//
// - email, url and phone answers are used. FeedBakkr allowed them in a
//   preview but produced nothing for them.
// - sensitive fields are skipped here. FeedBakkr removed them before calling
//   generatePreviewText, so the summary is the same.
import type { DslField, SchemaDslV1 } from "../schema/schema-dsl.js";
import { isPreviewableType } from "../schema/schema-utils.js";

const DEFAULT_MAX_LENGTH = 100;
const DEFAULT_SEPARATOR = " · ";

function oneLine(value: string): string {
	return value
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractFieldValue(field: DslField, value: unknown): string {
	if (value == null || field.sensitive === true) return "";

	switch (field.t) {
		case "text":
		case "textarea":
		case "email":
		case "url":
		case "phone": {
			if (typeof value !== "string") return "";
			return oneLine(value);
		}
		case "markdown": {
			if (typeof value !== "string") return "";
			// Strip markdown syntax for plain text preview
			return value
				.replace(/^#{1,6}\s+/gm, "") // headings
				.replace(/\*\*(.+?)\*\*/g, "$1") // bold
				.replace(/\*(.+?)\*/g, "$1") // italic
				.replace(/~~(.+?)~~/g, "$1") // strikethrough
				.replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, "")) // code
				.replace(/^\s*[-*+]\s+/gm, "") // list markers
				.replace(/^\s*\d+\.\s+/gm, "") // ordered list markers
				.replace(/^\s*>\s?/gm, "") // blockquotes
				.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
				.replace(/[\r\n]+/g, " ")
				.replace(/\s+/g, " ")
				.trim();
		}
		case "fixed": {
			const strVal = String(value).trim();
			if (!strVal) return "";
			const opt = field.opts.find((o) => o.k === strVal);
			return opt?.label ?? strVal;
		}
		case "dynlist": {
			if (!Array.isArray(value)) return "";
			return value
				.map((v) => String(v).trim())
				.filter(Boolean)
				.join(", ");
		}
		default:
			return "";
	}
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}

function collectFieldValues(
	schema: SchemaDslV1,
	fieldKeys: string[],
	fields: Record<string, unknown>,
	separator: string,
): string {
	const fieldMap = new Map(schema.fields.map((f) => [f.k, f]));
	const parts: string[] = [];

	for (const key of fieldKeys) {
		const fieldDef = fieldMap.get(key);
		if (!fieldDef) continue;
		const val = extractFieldValue(fieldDef, fields[key]);
		if (val) parts.push(val);
	}

	return parts.join(separator);
}

function autoDetect(
	schema: SchemaDslV1,
	fields: Record<string, unknown>,
	maxLength: number,
): string {
	for (const field of schema.fields) {
		if (!isPreviewableType(field.t)) continue;
		const val = extractFieldValue(field, fields[field.k]);
		if (val) return truncate(val, maxLength);
	}
	return "";
}

/**
 * The one-line summary of a submission for an inbox list, following the
 * schema's `preview` setting. Empty when there is nothing to show.
 */
export function summarizeSubmission(schema: SchemaDslV1, values: Record<string, unknown>): string {
	const config = schema.preview;
	const maxLength =
		(config && "maxLength" in config ? config.maxLength : undefined) ?? DEFAULT_MAX_LENGTH;

	// No config = auto-detect (backwards compatible)
	if (!config) {
		return autoDetect(schema, values, maxLength);
	}

	switch (config.mode) {
		case "none":
			return "";

		case "auto":
			return autoDetect(schema, values, maxLength);

		case "custom": {
			const separator = config.separator ?? DEFAULT_SEPARATOR;
			let result = collectFieldValues(schema, config.fields, values, separator);

			// Try fallback if primary produces nothing
			if (!result && config.fallbackFields && config.fallbackFields.length > 0) {
				result = collectFieldValues(schema, config.fallbackFields, values, separator);
			}

			const truncated = truncate(result, maxLength);
			// Only prepend the prefix when there's content — a bare prefix in the
			// inbox is noise. The prefix is considered decorative, so it is not
			// counted toward maxLength.
			return truncated && config.prefix ? `${config.prefix}${truncated}` : truncated;
		}
	}
}
