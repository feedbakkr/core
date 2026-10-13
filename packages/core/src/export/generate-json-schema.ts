import type { DslField } from "../schema/schema-dsl.js";
import type { Condition, DslFieldV2, SchemaDsl } from "../schema/schema-dsl-v2.js";
import { conditionalFields, isList } from "./conditions.js";

interface JsonSchemaProperty {
	type?: string;
	format?: string;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	pattern?: string;
	enum?: string[];
	items?: JsonSchemaProperty;
	maxItems?: number;
	properties?: Record<string, JsonSchemaProperty>;
	required?: string[];
	additionalProperties?: boolean;
	description?: string;
}

function fieldToJsonSchema(field: DslField): JsonSchemaProperty {
	switch (field.t) {
		case "text":
		case "textarea": {
			const prop: JsonSchemaProperty = { type: "string" };
			if (field.min !== undefined) prop.minLength = field.min;
			if (field.max !== undefined) prop.maxLength = field.max;
			return prop;
		}
		case "markdown": {
			const prop: JsonSchemaProperty = { type: "string" };
			if (field.max !== undefined) prop.maxLength = field.max;
			return prop;
		}
		case "email": {
			const prop: JsonSchemaProperty = { type: "string", format: "email" };
			if (field.max !== undefined) prop.maxLength = field.max;
			return prop;
		}
		case "url": {
			const prop: JsonSchemaProperty = { type: "string", format: "uri" };
			if (field.max !== undefined) prop.maxLength = field.max;
			return prop;
		}
		case "phone": {
			const prop: JsonSchemaProperty = {
				type: "string",
				pattern: "^[+\\d][\\d\\s\\-().+]{2,}$",
			};
			if (field.max !== undefined) prop.maxLength = field.max;
			return prop;
		}
		case "date": {
			return { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
		}
		case "datetime": {
			return { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$" };
		}
		case "time": {
			return { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" };
		}
		case "daterange": {
			return {
				type: "object",
				properties: {
					from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
					to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
				},
				required: ["from", "to"],
				additionalProperties: false,
			};
		}
		case "bool": {
			return { type: "boolean" };
		}
		case "number": {
			const prop: JsonSchemaProperty = { type: "number" };
			if (field.min !== undefined) prop.minimum = field.min;
			if (field.max !== undefined) prop.maximum = field.max;
			return prop;
		}
		case "integer": {
			const prop: JsonSchemaProperty = { type: "integer" };
			if (field.min !== undefined) prop.minimum = field.min;
			if (field.max !== undefined) prop.maximum = field.max;
			return prop;
		}
		case "fixed": {
			return { type: "string", enum: field.opts.map((o) => o.k) };
		}
		case "dynlist": {
			const prop: JsonSchemaProperty = {
				type: "array",
				items: fieldToJsonSchema(field.item as DslField),
			};
			if (field.maxItems !== undefined) prop.maxItems = field.maxItems;
			return prop;
		}
	}
}

/** A condition (schema v2) as JSON Schema, judged on stored answers. */
function conditionToJsonSchema(dsl: SchemaDsl, c: Condition): Record<string, unknown> {
	if ("all" in c) return { allOf: c.all.map((x) => conditionToJsonSchema(dsl, x)) };
	if ("any" in c) return { anyOf: c.any.map((x) => conditionToJsonSchema(dsl, x)) };
	const has = { required: [c.k] };
	const value = (match: Record<string, unknown>) => ({
		...has,
		properties: { [c.k]: isList(dsl, c.k) ? { contains: match } : match },
	});
	if ("eq" in c) return value({ const: c.eq });
	if ("neq" in c) return { not: value({ const: c.neq }) };
	if ("in" in c) return value({ enum: c.in });
	if ("filled" in c) return has;
	return { not: has };
}

export function generateJsonSchema(dsl: SchemaDsl): Record<string, unknown> {
	const properties: Record<string, JsonSchemaProperty> = {};
	const required: string[] = [];
	const conditional = new Map(conditionalFields(dsl).map((c) => [c.field.k, c.when]));

	for (const field of dsl.fields as DslFieldV2[]) {
		properties[field.k] = fieldToJsonSchema(field);
		if (field.help) properties[field.k] = { ...properties[field.k], description: field.help };
		if (field.req && !conditional.has(field.k)) {
			required.push(field.k);
		}
	}

	// A field with a condition is required (if `req`) when the condition
	// holds, and absent when it does not.
	const rules = [...conditional].map(([key, when]) => {
		const field = dsl.fields.find((f) => f.k === key);
		const absent = { not: { required: [key] } };
		const holds = conditionToJsonSchema(dsl, when);
		return field?.req
			? // biome-ignore lint/suspicious/noThenProperty: JSON Schema's if/then/else keywords
				{ if: holds, then: { required: [key] }, else: absent }
			: // biome-ignore lint/suspicious/noThenProperty: JSON Schema's if/then keywords
				{ if: { not: holds }, then: absent };
	});

	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		type: "object",
		title: dsl.title ?? "Form",
		description: dsl.desc,
		properties,
		required: required.length > 0 ? required : undefined,
		...(rules.length > 0 ? { allOf: rules } : {}),
		additionalProperties: false,
	};
}
