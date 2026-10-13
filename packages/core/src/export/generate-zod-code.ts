import type { DslField } from "../schema/schema-dsl.js";
import type { Condition, SchemaDsl } from "../schema/schema-dsl-v2.js";
import { conditionalFields, isList } from "./conditions.js";

/**
 * Emit Zod code that a developer can paste into their own app. This is a
 * shape-only schema — relative date/time bounds and cross-field constraints
 * are enforced by the Feedbakkr API at submit time, not re-derived here. If a
 * relative bound is set on a date field the emitted code covers only the
 * format; the server remains authoritative for the range check.
 */
function fieldToCode(field: DslField, indent: string, conditional = false): string {
	let code: string;

	switch (field.t) {
		case "text": {
			code = "z.string()";
			if (field.min !== undefined) code += `.min(${field.min})`;
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "textarea": {
			code = "z.string()";
			if (field.min !== undefined) code += `.min(${field.min})`;
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "markdown": {
			code = "z.string()";
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "email": {
			code = "z.string().email()";
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "url": {
			code = "z.string().url()";
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "phone": {
			code = "z.string().regex(/^[+\\d][\\d\\s\\-().+]{2,}$/)";
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "date": {
			code = "z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)";
			break;
		}
		case "datetime": {
			code = "z.string().regex(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/)";
			break;
		}
		case "time": {
			code = "z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/)";
			break;
		}
		case "daterange": {
			code =
				"z.object({ from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/), to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/) })";
			break;
		}
		case "bool": {
			code = "z.boolean()";
			break;
		}
		case "number": {
			code = "z.number()";
			if (field.min !== undefined) code += `.min(${field.min})`;
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "integer": {
			code = "z.number().int()";
			if (field.min !== undefined) code += `.min(${field.min})`;
			if (field.max !== undefined) code += `.max(${field.max})`;
			break;
		}
		case "fixed": {
			const keys = field.opts.map((o) => JSON.stringify(o.k)).join(", ");
			code = `z.enum([${keys}])`;
			break;
		}
		case "dynlist": {
			const itemCode = fieldToCode(field.item as DslField, indent);
			code = `z.array(${itemCode})`;
			if (field.maxItems !== undefined) code += `.max(${field.maxItems})`;
			break;
		}
	}

	if (!field.req || conditional) {
		code += ".optional()";
	}

	return code;
}

/** A condition (schema v2) as a JavaScript expression over `data`. */
function conditionToCode(dsl: SchemaDsl, c: Condition): string {
	if ("all" in c) return `(${c.all.map((x) => conditionToCode(dsl, x)).join(" && ")})`;
	if ("any" in c) return `(${c.any.map((x) => conditionToCode(dsl, x)).join(" || ")})`;
	const ref = `data.${c.k}`;
	const is = (value: unknown) =>
		isList(dsl, c.k)
			? `(${ref} ?? []).includes(${JSON.stringify(value)})`
			: `${ref} === ${JSON.stringify(value)}`;
	if ("eq" in c) return is(c.eq);
	if ("neq" in c) return `!(${is(c.neq)})`;
	if ("in" in c) return `(${c.in.map(is).join(" || ")})`;
	if ("filled" in c) return `${ref} !== undefined`;
	return `${ref} === undefined`;
}

export function generateZodCode(dsl: SchemaDsl): string {
	const conditional = conditionalFields(dsl);
	const keys = new Set(conditional.map((c) => c.field.k));
	const lines: string[] = ['import { z } from "zod";', "", "export const schema = z.object({"];

	for (const field of dsl.fields) {
		const code = fieldToCode(field, "  ", keys.has(field.k));
		lines.push(`  ${field.k}: ${code},`);
	}

	if (conditional.length === 0) {
		lines.push("});");
	} else {
		// A field with a condition is required (if `req`) when it holds, and
		// absent when it does not, as in stored answers.
		lines.push("}).superRefine((data, ctx) => {");
		for (const { field, when } of conditional) {
			const path = JSON.stringify([field.k]);
			const value = `data.${field.k}`;
			lines.push(`  if (${conditionToCode(dsl, when)}) {`);
			if (field.req) {
				lines.push(
					`    if (${value} === undefined) ctx.addIssue({ code: "custom", path: ${path}, message: "Required" });`,
				);
			}
			lines.push(
				`  } else if (${value} !== undefined) {`,
				`    ctx.addIssue({ code: "custom", path: ${path}, message: "Does not apply" });`,
				"  }",
			);
		}
		lines.push("});");
	}
	lines.push("", "export type FormData = z.infer<typeof schema>;");

	return lines.join("\n");
}
