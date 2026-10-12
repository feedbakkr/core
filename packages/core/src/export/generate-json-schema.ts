import type { DslField, SchemaDslV1 } from "../schema/schema-dsl.js";

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

export function generateJsonSchema(dsl: SchemaDslV1): Record<string, unknown> {
	const properties: Record<string, JsonSchemaProperty> = {};
	const required: string[] = [];

	for (const field of dsl.fields) {
		properties[field.k] = fieldToJsonSchema(field);
		if (field.req) {
			required.push(field.k);
		}
	}

	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		type: "object",
		title: dsl.title ?? "Form",
		description: dsl.desc,
		properties,
		required: required.length > 0 ? required : undefined,
		additionalProperties: false,
	};
}
