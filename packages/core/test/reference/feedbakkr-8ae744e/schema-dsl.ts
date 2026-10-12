import { z } from "zod";
import { isValidDateBound } from "./date-bounds.js";

const fieldKeyRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const baseField = z.object({
	k: z.string().regex(fieldKeyRegex, "Invalid field key"),
	label: z.string().min(1).max(200),
	req: z.boolean().optional(),
	hidden: z.boolean().optional(),
	default: z.any().optional(),
	meta: z.string().max(4000).optional(),
	/**
	 * Marks the field's submitted value as sensitive. When `true`, the value is
	 * partitioned out of the plaintext bucket at submit time and stored as an
	 * encrypted envelope; non-sensitive fields stay plaintext for fast list
	 * rendering, exports, and insights queries.
	 *
	 * Defaults to undefined (treated as not sensitive). Encryption is purely
	 * opt-in — no auto-derivation by field type — so schemas stay plaintext
	 * unless an author explicitly marks specific fields.
	 */
	sensitive: z.boolean().optional(),
});

const textField = baseField.extend({
	t: z.literal("text"),
	min: z.number().int().min(0).optional(),
	max: z.number().int().min(1).optional(),
});

const textareaField = baseField.extend({
	t: z.literal("textarea"),
	min: z.number().int().min(0).optional(),
	max: z.number().int().min(1).optional(),
});

const markdownField = baseField.extend({
	t: z.literal("markdown"),
	max: z.number().int().min(1).optional(),
});

const dateBoundString = z.string().refine((s) => isValidDateBound(s, "date"), "Invalid date bound");

const datetimeBoundString = z
	.string()
	.refine((s) => isValidDateBound(s, "datetime"), "Invalid datetime bound");

const timeBoundString = z
	.string()
	.refine((s) => isValidDateBound(s, "time"), "Invalid time (expected HH:MM, 24h)");

const dateField = baseField.extend({
	t: z.literal("date"),
	min: dateBoundString.optional(),
	max: dateBoundString.optional(),
});

const datetimeField = baseField.extend({
	t: z.literal("datetime"),
	min: datetimeBoundString.optional(),
	max: datetimeBoundString.optional(),
});

const timeField = baseField.extend({
	t: z.literal("time"),
	min: timeBoundString.optional(),
	max: timeBoundString.optional(),
});

const daterangeField = baseField.extend({
	t: z.literal("daterange"),
	min: dateBoundString.optional(),
	max: dateBoundString.optional(),
	minSpanDays: z.number().int().min(0).optional(),
	maxSpanDays: z.number().int().min(1).optional(),
});

const boolField = baseField.extend({
	t: z.literal("bool"),
});

const numberField = baseField.extend({
	t: z.literal("number"),
	min: z.number().optional(),
	max: z.number().optional(),
});

const integerField = baseField.extend({
	t: z.literal("integer"),
	min: z.number().int().optional(),
	max: z.number().int().optional(),
});

const emailField = baseField.extend({
	t: z.literal("email"),
	max: z.number().int().min(1).optional(),
});

const urlField = baseField.extend({
	t: z.literal("url"),
	max: z.number().int().min(1).optional(),
});

const phoneField = baseField.extend({
	t: z.literal("phone"),
	max: z.number().int().min(1).optional(),
});

const fixedOptionSchema = z.object({
	k: z.string().min(1),
	label: z.string().min(1).optional(),
});

const fixedField = baseField.extend({
	t: z.literal("fixed"),
	opts: z.array(fixedOptionSchema).min(1).max(50),
});

const dynlistItemField = z.discriminatedUnion("t", [
	textField,
	textareaField,
	markdownField,
	dateField,
	datetimeField,
	timeField,
	boolField,
	numberField,
	integerField,
	emailField,
	urlField,
	phoneField,
	fixedField,
]);

const dynlistField = baseField.extend({
	t: z.literal("dynlist"),
	item: dynlistItemField,
	maxItems: z.number().int().min(1).max(100).optional(),
});

const dslFieldSchema = z.discriminatedUnion("t", [
	textField,
	textareaField,
	markdownField,
	dateField,
	datetimeField,
	timeField,
	daterangeField,
	boolField,
	numberField,
	integerField,
	emailField,
	urlField,
	phoneField,
	fixedField,
	dynlistField,
]);

export const PREVIEWABLE_TYPES = [
	"text",
	"textarea",
	"markdown",
	"email",
	"url",
	"phone",
	"fixed",
	"dynlist",
] as const;
export type PreviewableType = (typeof PREVIEWABLE_TYPES)[number];

export const ALLOWED_SEPARATORS = [" ", " · ", " - ", ", "] as const;
export type PreviewSeparator = (typeof ALLOWED_SEPARATORS)[number];

const previewNoneSchema = z.object({
	mode: z.literal("none"),
});

const previewAutoSchema = z.object({
	mode: z.literal("auto"),
	maxLength: z.number().int().min(1).max(100).optional(),
});

const previewCustomSchema = z.object({
	mode: z.literal("custom"),
	maxLength: z.number().int().min(1).max(100).optional(),
	fields: z.array(z.string()).min(1).max(5),
	separator: z.enum(ALLOWED_SEPARATORS).optional(),
	fallbackFields: z.array(z.string()).max(5).optional(),
	/**
	 * Text prepended to the generated preview, e.g. "Helpful: " produces
	 * "Helpful: yes · great docs". Only rendered when the preview itself is
	 * non-empty, so bare prefixes never appear in the inbox.
	 */
	prefix: z.string().max(30).optional(),
});

export const previewConfigSchema = z.discriminatedUnion("mode", [
	previewNoneSchema,
	previewAutoSchema,
	previewCustomSchema,
]);

export const schemaDslV1Schema = z.object({
	v: z.literal(1),
	title: z.string().min(1).max(200).optional(),
	desc: z.string().max(2000).optional(),
	meta: z.string().max(4000).optional(),
	fields: z.array(dslFieldSchema).min(0).max(25),
	preview: previewConfigSchema.optional(),
});

export type SchemaDslV1 = z.infer<typeof schemaDslV1Schema>;
export type DslField = z.infer<typeof dslFieldSchema>;
export type FieldType = DslField["t"];
export type FixedOption = z.infer<typeof fixedOptionSchema>;
export type PreviewConfig = z.infer<typeof previewConfigSchema>;

export const FIELD_TYPES = [
	"text",
	"textarea",
	"markdown",
	"email",
	"url",
	"phone",
	"date",
	"datetime",
	"time",
	"daterange",
	"bool",
	"number",
	"integer",
	"dynlist",
	"fixed",
] as const;

/**
 * Resolve whether a field is sensitive (its value will be encrypted at rest).
 *
 * Encryption is **opt-in per field**: a field is sensitive only when the
 * `sensitive` flag is explicitly set to `true`. Field type plays no role in
 * the default — a `text` field is not sensitive unless the schema author
 * marks it so. This keeps existing schemas (and bundled templates) fully
 * plaintext until someone deliberately turns encryption on.
 */
export function isFieldSensitive(field: DslField): boolean {
	return field.sensitive === true;
}
