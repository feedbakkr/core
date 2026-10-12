import { z } from "zod";
import { compareIso, resolveDateBound } from "./date-bounds.js";
import type { DslField, SchemaDslV1 } from "./schema-dsl.js";

/** Default max length applied to text/textarea fields when no max is configured. */
const DEFAULT_TEXT_MAX_LENGTH = 500;

/** Default max length for markdown fields when no max is configured. */
const DEFAULT_MARKDOWN_MAX_LENGTH = 10_000;

/** Default max length for email / url / phone when no explicit max is set. */
const DEFAULT_STRING_MAX_LENGTH = 320;

/** Permissive phone regex: digits, spaces, dashes, parens, plus; 3+ chars. */
const PHONE_REGEX = /^[+\d][\d\s\-().+]{2,}$/;

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Resolve bounds lazily at validation time (not at schema generation) so that
 * relative expressions like "today" / "now" always use the current moment —
 * otherwise a cached Zod validator would drift with real-time.
 */
function dateBoundRefinement(
	min: string | undefined,
	max: string | undefined,
	context: "date" | "datetime" | "time",
): (val: string) => boolean {
	return (val: string) => {
		const now = new Date();
		if (min) {
			const r = resolveDateBound(min, context, now);
			if (r && compareIso(val, r.iso) < 0) return false;
		}
		if (max) {
			const r = resolveDateBound(max, context, now);
			if (r && compareIso(val, r.iso) > 0) return false;
		}
		return true;
	};
}

function fieldToZod(field: DslField): z.ZodTypeAny {
	let schema: z.ZodTypeAny;

	switch (field.t) {
		case "text": {
			let s = z.string();
			if (field.min !== undefined) s = s.min(field.min);
			s = s.max(field.max ?? DEFAULT_TEXT_MAX_LENGTH);
			schema = s;
			break;
		}
		case "textarea": {
			let s = z.string();
			if (field.min !== undefined) s = s.min(field.min);
			s = s.max(field.max ?? DEFAULT_TEXT_MAX_LENGTH);
			schema = s;
			break;
		}
		case "markdown": {
			schema = z.string().max(field.max ?? DEFAULT_MARKDOWN_MAX_LENGTH);
			break;
		}
		case "email": {
			schema = z
				.string()
				.email("Invalid email address")
				.max(field.max ?? DEFAULT_STRING_MAX_LENGTH);
			break;
		}
		case "url": {
			schema = z
				.string()
				.url("Invalid URL")
				.max(field.max ?? DEFAULT_STRING_MAX_LENGTH);
			break;
		}
		case "phone": {
			schema = z
				.string()
				.regex(PHONE_REGEX, "Invalid phone number")
				.max(field.max ?? DEFAULT_STRING_MAX_LENGTH);
			break;
		}
		case "date": {
			const check = dateBoundRefinement(field.min, field.max, "date");
			schema = z
				.string()
				.regex(DATE_REGEX, "Invalid date format")
				.refine(check, "Date is outside the allowed range");
			break;
		}
		case "datetime": {
			const check = dateBoundRefinement(field.min, field.max, "datetime");
			schema = z
				.string()
				.regex(DATETIME_REGEX, "Invalid datetime format")
				.refine(check, "Datetime is outside the allowed range");
			break;
		}
		case "time": {
			const check = dateBoundRefinement(field.min, field.max, "time");
			schema = z
				.string()
				.regex(TIME_REGEX, "Invalid time format (expected HH:MM, 24h)")
				.refine(check, "Time is outside the allowed range");
			break;
		}
		case "daterange": {
			const boundCheck = dateBoundRefinement(field.min, field.max, "date");
			const minSpan = field.minSpanDays;
			const maxSpan = field.maxSpanDays;
			schema = z
				.object({
					from: z.string().regex(DATE_REGEX, "Invalid 'from' date"),
					to: z.string().regex(DATE_REGEX, "Invalid 'to' date"),
				})
				.refine((v) => compareIso(v.from, v.to) <= 0, {
					message: "'from' date must not be after 'to' date",
				})
				.refine((v) => boundCheck(v.from) && boundCheck(v.to), {
					message: "Date is outside the allowed range",
				})
				.refine(
					(v) => {
						if (minSpan === undefined && maxSpan === undefined) return true;
						const a = Date.parse(`${v.from}T00:00:00Z`);
						const b = Date.parse(`${v.to}T00:00:00Z`);
						const days = Math.round((b - a) / 86_400_000);
						if (minSpan !== undefined && days < minSpan) return false;
						if (maxSpan !== undefined && days > maxSpan) return false;
						return true;
					},
					{ message: "Date range span is outside the allowed limits" },
				);
			break;
		}
		case "bool": {
			schema = z.boolean();
			break;
		}
		case "number": {
			let s = z.number();
			if (field.min !== undefined) s = s.min(field.min);
			if (field.max !== undefined) s = s.max(field.max);
			schema = s;
			break;
		}
		case "integer": {
			let s = z.number().int();
			if (field.min !== undefined) s = s.min(field.min);
			if (field.max !== undefined) s = s.max(field.max);
			schema = s;
			break;
		}
		case "fixed": {
			const keys = field.opts.map((o) => o.k) as [string, ...string[]];
			schema = z.enum(keys);
			break;
		}
		case "dynlist": {
			const itemSchema = fieldToZod(field.item as DslField);
			let s = z.array(itemSchema);
			if (field.maxItems !== undefined) s = s.max(field.maxItems);
			schema = s;
			break;
		}
	}

	if (!field.req || field.hidden) {
		schema = schema.optional();
	}

	return schema;
}

export function generateZod(dsl: SchemaDslV1): z.ZodObject<Record<string, z.ZodTypeAny>> {
	const shape: Record<string, z.ZodTypeAny> = {};
	for (const field of dsl.fields) {
		shape[field.k] = fieldToZod(field);
	}
	return z.object(shape);
}
