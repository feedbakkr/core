/**
 * Validates default values in a schema DSL against each field's type and constraints.
 * Called at schema save time to prevent invalid defaults from being stored.
 */

import type { SchemaDslV1 } from "./schema-dsl.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateDefaults(schema: SchemaDslV1): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	for (const field of schema.fields) {
		if (field.default === undefined || field.default === null) continue;

		const val = field.default;
		const label = `Default value for field "${field.k}"`;

		switch (field.t) {
			case "text":
			case "textarea": {
				if (typeof val !== "string") {
					errors.push(`${label}: must be a string`);
					break;
				}
				if ("min" in field && field.min !== undefined && val.length < field.min) {
					errors.push(`${label}: must be at least ${field.min} characters`);
				}
				if ("max" in field && field.max !== undefined && val.length > field.max) {
					errors.push(`${label}: must be at most ${field.max} characters`);
				}
				break;
			}
			case "markdown": {
				if (typeof val !== "string") {
					errors.push(`${label}: must be a string`);
					break;
				}
				if ("max" in field && field.max !== undefined && val.length > field.max) {
					errors.push(`${label}: must be at most ${field.max} characters`);
				}
				break;
			}
			case "number": {
				if (typeof val !== "number") {
					errors.push(`${label}: must be a number`);
					break;
				}
				if ("min" in field && field.min !== undefined && val < field.min) {
					errors.push(`${label}: must be at least ${field.min}`);
				}
				if ("max" in field && field.max !== undefined && val > field.max) {
					errors.push(`${label}: must be at most ${field.max}`);
				}
				break;
			}
			case "bool": {
				if (typeof val !== "boolean") {
					errors.push(`${label}: must be true or false`);
				}
				break;
			}
			case "date": {
				if (typeof val !== "string" || !DATE_REGEX.test(val)) {
					errors.push(`${label}: must be a date in YYYY-MM-DD format`);
				}
				break;
			}
			case "fixed": {
				if (typeof val !== "string") {
					errors.push(`${label}: must be a string`);
					break;
				}
				const validKeys = field.opts.map((o) => o.k);
				if (!validKeys.includes(val)) {
					errors.push(`${label}: must be one of: ${validKeys.join(", ")}`);
				}
				break;
			}
			case "dynlist": {
				if (!Array.isArray(val)) {
					errors.push(`${label}: must be an array`);
					break;
				}
				if ("maxItems" in field && field.maxItems !== undefined && val.length > field.maxItems) {
					errors.push(`${label}: must have at most ${field.maxItems} items`);
				}
				break;
			}
		}
	}

	return { valid: errors.length === 0, errors };
}
