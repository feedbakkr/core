import { z } from "zod";
import { previewConfigSchema, schemaDslV1Schema } from "../schema/schema-dsl.js";
import { type SchemaDsl, schemaDslV2Schema } from "../schema/schema-dsl-v2.js";

export const schemaTemplateSchema = z.object({
	format_version: z.literal("1.0"),
	template_id: z.string().min(1).max(200),
	template_key: z
		.string()
		.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
		.optional(),
	title: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	// Changed from FeedBakkr: a template may hold a v2 schema too.
	schema: z.union([schemaDslV1Schema, schemaDslV2Schema]),
	preview_config: previewConfigSchema.optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SchemaTemplate = z.infer<typeof schemaTemplateSchema>;

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/[\s-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function randomSuffix(length: number): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function generateTemplateKey(title: string): string {
	const slug = slugify(title);
	return slug || "template";
}

export function generateTemplateId(title: string): string {
	const key = generateTemplateKey(title);
	return `${key}-${randomSuffix(6)}`;
}

export function buildExportTemplate(
	schema: SchemaDsl,
	channelTitle: string,
	channelDescription?: string | null,
): SchemaTemplate {
	const templateKey = generateTemplateKey(channelTitle);
	return {
		format_version: "1.0",
		template_id: generateTemplateId(channelTitle),
		template_key: templateKey,
		title: channelTitle,
		description: channelDescription ?? undefined,
		schema,
		preview_config: schema.preview,
	};
}

export function extractSchemaFromTemplate(template: SchemaTemplate): SchemaDsl {
	const schema = { ...template.schema };
	if (!schema.preview && template.preview_config) {
		schema.preview = template.preview_config;
	}
	return schema;
}

export function isTemplateWrapper(json: unknown): json is SchemaTemplate {
	return typeof json === "object" && json !== null && "format_version" in json && "schema" in json;
}
