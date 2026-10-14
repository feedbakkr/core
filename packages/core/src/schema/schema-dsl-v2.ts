// Schema format v2: v1 plus conditions (`when`), sections, help and
// placeholder text, and the reply address (`replyTo`). Nothing else changes, and a schema that uses none of them
// stays v1. A v2 schema says `v: 2`, so FeedBakkr's v1 parser rejects it
// rather than silently dropping its conditions.
import { z } from "zod";
import {
	type DslField,
	FIELD_KEY_REGEX,
	type PreviewConfig,
	previewConfigSchema,
	type SchemaDslV1,
	V1_FIELD_SCHEMAS,
} from "./schema-dsl.js";

/** A value a condition compares an answer with. */
export type ConditionValue = string | number | boolean;

/**
 * When a field or section applies. `k` names an earlier field; its answer is
 * compared after normalising (trimmed text, numbers and yes or no read).
 *
 * - `eq` / `neq`: the answer is (or is not) this value. For a list, it
 *   contains (or does not contain) it. No answer is never equal.
 * - `in`: the answer is one of these values. For a list, it contains one.
 * - `filled` / `empty`: an answer was (or was not) given.
 * - `all` / `any`: every one, or at least one, of two or more conditions
 *   holds. (One condition is written on its own.)
 */
export type Condition =
	| { k: string; eq: ConditionValue }
	| { k: string; neq: ConditionValue }
	| { k: string; in: ConditionValue[] }
	| { k: string; filled: true }
	| { k: string; empty: true }
	| { all: Condition[] }
	| { any: Condition[] };

const fieldKey = z.string().regex(FIELD_KEY_REGEX, "Invalid field key");
const conditionValue = z.union([z.string(), z.number(), z.boolean()]);

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
	z.union([
		z.strictObject({ k: fieldKey, eq: conditionValue }),
		z.strictObject({ k: fieldKey, neq: conditionValue }),
		z.strictObject({ k: fieldKey, in: z.array(conditionValue).min(1).max(50) }),
		z.strictObject({ k: fieldKey, filled: z.literal(true) }),
		z.strictObject({ k: fieldKey, empty: z.literal(true) }),
		z.strictObject({ all: z.array(conditionSchema).min(2).max(20) }),
		z.strictObject({ any: z.array(conditionSchema).min(2).max(20) }),
	]),
);

const v2Extras = {
	/** Show and check this field only when the condition holds. */
	when: conditionSchema.optional(),
	/** Guidance shown with the field. */
	help: z.string().max(500).optional(),
	/** Example text shown inside an empty input. */
	placeholder: z.string().max(200).optional(),
	/**
	 * This email field is where a reply to the message goes. At most one
	 * field, and only an email field. Who sent the message is the host's
	 * business (its signed-in user), never read from the answers.
	 */
	replyTo: z.literal(true).optional(),
};

const [first, ...rest] = V1_FIELD_SCHEMAS.map((field) => field.extend(v2Extras));
const dslFieldV2Schema = z.discriminatedUnion("t", [
	first as (typeof V1_FIELD_SCHEMAS)[0],
	...(rest as unknown as (typeof V1_FIELD_SCHEMAS)[number][]),
]);

/** A group of fields: shown together, as a page, a step or a slide, as the host chooses. */
export interface SchemaSection {
	id: string;
	title: string;
	desc?: string;
	/** The keys of the fields in this section, in the schema's order. */
	fields: string[];
	/** Show the section only when the condition holds. */
	when?: Condition;
}

const sectionSchema = z.object({
	id: fieldKey,
	title: z.string().min(1).max(200),
	desc: z.string().max(2000).optional(),
	fields: z.array(fieldKey).min(1),
	when: conditionSchema.optional(),
});

export type DslFieldV2 = DslField & {
	when?: Condition;
	help?: string;
	placeholder?: string;
	replyTo?: true;
};

export interface SchemaDslV2 {
	v: 2;
	title?: string;
	desc?: string;
	meta?: string;
	fields: DslFieldV2[];
	sections?: SchemaSection[];
	preview?: PreviewConfig;
}

/** Every key a condition names. */
export function conditionKeys(condition: Condition): string[] {
	if ("all" in condition) return condition.all.flatMap(conditionKeys);
	if ("any" in condition) return condition.any.flatMap(conditionKeys);
	return [condition.k];
}

/** The leaf conditions, with their paths inside the condition. */
function leaves(
	condition: Condition,
	path: (string | number)[] = [],
): { condition: Condition & { k: string }; path: (string | number)[] }[] {
	if ("all" in condition) return condition.all.flatMap((c, i) => leaves(c, [...path, "all", i]));
	if ("any" in condition) return condition.any.flatMap((c, i) => leaves(c, [...path, "any", i]));
	return [{ condition, path }];
}

/** Why a compared value cannot be an answer to this field, or null if it can. */
function valueProblem(field: DslField, value: ConditionValue): string | null {
	const target = field.t === "dynlist" ? (field.item as DslField) : field;
	switch (target.t) {
		case "fixed":
			return typeof value === "string" && target.opts.some((o) => o.k === value)
				? null
				: `"${String(value)}" is not an option of "${field.k}"`;
		case "bool":
			return typeof value === "boolean" ? null : `"${field.k}" is answered yes or no`;
		case "number":
		case "integer":
			return typeof value === "number" ? null : `"${field.k}" is answered with a number`;
		default:
			return typeof value === "string" ? null : `"${field.k}" is answered with text`;
	}
}

/**
 * The rules a v2 schema follows beyond its shape:
 * - a condition names only fields that come before it;
 * - a compared value suits the field it is compared with;
 * - with sections, every field is in exactly one section, in the fields'
 *   order, and a section's condition names only fields of earlier sections;
 * - `replyTo` marks at most one field, and only an email field.
 *
 * Naming only earlier fields means conditions can never form a cycle, and
 * every form is evaluated in one pass, top to bottom.
 */
function checkReferences(schema: SchemaDslV2, ctx: z.RefinementCtx) {
	const index = new Map<string, number>();
	schema.fields.forEach((f, i) => {
		if (!index.has(f.k)) index.set(f.k, i);
	});

	const checkCondition = (
		condition: Condition,
		before: number,
		where: (string | number)[],
		what: string,
	) => {
		for (const leaf of leaves(condition, [...where, "when"])) {
			const at = index.get(leaf.condition.k);
			if (at === undefined || at >= before) {
				ctx.addIssue({
					code: "custom",
					path: [...leaf.path, "k"],
					message:
						at === undefined
							? `${what} refers to "${leaf.condition.k}", which is not a field`
							: `${what} refers to "${leaf.condition.k}", which does not come before it`,
				});
				continue;
			}
			const field = schema.fields[at] as DslField;
			const values =
				"eq" in leaf.condition
					? [leaf.condition.eq]
					: "neq" in leaf.condition
						? [leaf.condition.neq]
						: "in" in leaf.condition
							? leaf.condition.in
							: [];
			for (const value of values) {
				const problem = valueProblem(field, value);
				if (problem) ctx.addIssue({ code: "custom", path: leaf.path, message: problem });
			}
		}
	};

	schema.fields.forEach((field, i) => {
		if (field.when) checkCondition(field.when, i, ["fields", i], `Field "${field.k}"`);
	});

	const replyFields = schema.fields.flatMap((f, i) => (f.replyTo ? [i] : []));
	for (const i of replyFields) {
		const field = schema.fields[i] as DslFieldV2;
		if (field.t !== "email") {
			ctx.addIssue({
				code: "custom",
				path: ["fields", i, "replyTo"],
				message: `Field "${field.k}" is not an email field, so it cannot be the reply address`,
			});
		}
	}
	if (replyFields.length > 1) {
		ctx.addIssue({
			code: "custom",
			path: ["fields", replyFields[1] as number, "replyTo"],
			message: "Only one field can be the reply address",
		});
	}

	if (!schema.sections) return;
	const ids = new Set<string>();
	const order: string[] = [];
	schema.sections.forEach((section, i) => {
		if (ids.has(section.id)) {
			ctx.addIssue({
				code: "custom",
				path: ["sections", i, "id"],
				message: `Duplicate section id "${section.id}"`,
			});
		}
		ids.add(section.id);
		if (section.when) {
			// Only fields of earlier sections: the first field of this section.
			const firstKey = section.fields[0];
			const before = firstKey === undefined ? 0 : (index.get(firstKey) ?? 0);
			checkCondition(section.when, before, ["sections", i], `Section "${section.id}"`);
		}
		order.push(...section.fields);
	});
	const keys = schema.fields.map((f) => f.k);
	if (order.join("\n") !== keys.join("\n")) {
		ctx.addIssue({
			code: "custom",
			path: ["sections"],
			message:
				"Sections must list every field exactly once, in the same order as fields: " +
				`expected ${keys.join(", ")}`,
		});
	}
}

export const schemaDslV2Schema: z.ZodType<SchemaDslV2> = z
	.object({
		v: z.literal(2),
		title: z.string().min(1).max(200).optional(),
		desc: z.string().max(2000).optional(),
		meta: z.string().max(4000).optional(),
		fields: z.array(dslFieldV2Schema),
		sections: z.array(sectionSchema).optional(),
		preview: previewConfigSchema.optional(),
	})
	.superRefine((schema, ctx) =>
		checkReferences(schema as SchemaDslV2, ctx),
	) as z.ZodType<SchemaDslV2>;

/** A schema of either version. */
export type SchemaDsl = SchemaDslV1 | SchemaDslV2;
