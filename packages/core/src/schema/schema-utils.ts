import type { DslField, PreviewConfig, SchemaDslV1 } from "./schema-dsl.js";
import { PREVIEWABLE_TYPES } from "./schema-dsl.js";

export function canonicalizeDsl(dsl: SchemaDslV1): string {
	return JSON.stringify(dsl);
}

/**
 * Build a map of fixed-field option keys to their human-readable labels.
 * Used at submission time so the message body can render labels in inboxes
 * without re-resolving the schema. Shape:
 *
 *   { [fieldKey]: { [optionKey]: optionLabel } }
 *
 * Fields that are not `fixed`, or have no labels on their options, are
 * omitted to keep the persisted body small.
 */
export function buildFieldOptionsMap(dsl: SchemaDslV1): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	for (const field of dsl.fields) {
		if (field.t !== "fixed") continue;
		const optsMap: Record<string, string> = {};
		for (const opt of field.opts) {
			if (opt.label) optsMap[opt.k] = opt.label;
		}
		if (Object.keys(optsMap).length > 0) {
			out[field.k] = optsMap;
		}
	}
	return out;
}

export async function hashDsl(canonicalJson: string): Promise<string> {
	const encoded = new TextEncoder().encode(canonicalJson);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function validatePublishable(dsl: SchemaDslV1): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (dsl.fields.length === 0) {
		errors.push("Schema must have at least one field");
	}

	const keys = new Set<string>();
	for (const field of dsl.fields) {
		if (keys.has(field.k)) {
			errors.push(`Duplicate field key: "${field.k}"`);
		}
		keys.add(field.k);
	}

	// Validate preview config if present
	if (dsl.preview) {
		const previewResult = validatePreviewConfig(dsl, dsl.preview);
		errors.push(...previewResult.errors);
	}

	return { valid: errors.length === 0, errors };
}

export interface PreviewValidationResult {
	valid: boolean;
	errors: string[];
}

export function isPreviewableType(t: string): boolean {
	return (PREVIEWABLE_TYPES as readonly string[]).includes(t);
}

export function validatePreviewConfig(
	dsl: SchemaDslV1,
	config: PreviewConfig,
): PreviewValidationResult {
	const errors: string[] = [];

	if (config.mode === "none" || config.mode === "auto") {
		return { valid: true, errors: [] };
	}

	// mode === "custom"
	const fieldMap = new Map(dsl.fields.map((f) => [f.k, f]));

	const seenFields = new Set<string>();
	for (const key of config.fields) {
		if (seenFields.has(key)) {
			errors.push(`Duplicate preview field: "${key}"`);
			continue;
		}
		seenFields.add(key);

		const field = fieldMap.get(key);
		if (!field) {
			errors.push(`Preview field "${key}" does not exist in schema`);
		} else if (!isPreviewableType(field.t)) {
			errors.push(`Field "${key}" has type "${field.t}" which is not previewable`);
		}
	}

	if (config.fallbackFields) {
		const seenFallback = new Set<string>();
		for (const key of config.fallbackFields) {
			if (seenFallback.has(key)) {
				errors.push(`Duplicate fallback field: "${key}"`);
				continue;
			}
			seenFallback.add(key);

			const field = fieldMap.get(key);
			if (!field) {
				errors.push(`Fallback field "${key}" does not exist in schema`);
			} else if (!isPreviewableType(field.t)) {
				errors.push(`Fallback field "${key}" has type "${field.t}" which is not previewable`);
			}
		}
	}

	return { valid: errors.length === 0, errors };
}

export function generateAutoPreviewConfig(dsl: SchemaDslV1): PreviewConfig {
	const previewableFields = dsl.fields.filter((f) => isPreviewableType(f.t));

	if (previewableFields.length === 0) {
		return { mode: "auto" };
	}

	const selected = previewableFields.slice(0, 3).map((f) => f.k);
	return {
		mode: "custom",
		fields: selected,
		separator: " · ",
		maxLength: 100,
	};
}

function sampleValueForField(field: DslField): unknown {
	switch (field.t) {
		case "text":
			return `Example ${field.label}`;
		case "textarea":
			return `Example ${field.label} content`;
		case "markdown":
			return `**Example** ${field.label} content`;
		case "email":
			return "name@example.com";
		case "url":
			return "https://example.com";
		case "phone":
			return "+1 555 123 4567";
		case "date":
			return new Date().toISOString().split("T")[0];
		case "datetime": {
			const d = new Date();
			return `${d.toISOString().split("T")[0]}T09:00`;
		}
		case "time":
			return "09:00";
		case "daterange": {
			const today = new Date().toISOString().split("T")[0] as string;
			return { from: today, to: today };
		}
		case "bool":
			return true;
		case "number":
		case "integer":
			return field.min ?? 0;
		case "fixed":
			return field.opts[0]?.k ?? "";
		case "dynlist":
			return [sampleValueForField(field.item as DslField)];
		default:
			return "";
	}
}

export function generateSamplePayload(dsl: SchemaDslV1): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	for (const field of dsl.fields) {
		fields[field.k] = sampleValueForField(field);
	}
	return fields;
}
