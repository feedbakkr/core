import { z } from "zod";
import { compareIso, resolveDateBound } from "../schema/date-bounds.js";
import type { DslField, SchemaDslV1 } from "../schema/schema-dsl.js";
import { type SubmissionError, type SubmissionErrors, submissionError } from "./errors.js";
import { normalizeSubmission } from "./normalize.js";

// The same limits and patterns as generateZod, which the browser runs.
const DEFAULT_TEXT_MAX_LENGTH = 500;
const DEFAULT_MARKDOWN_MAX_LENGTH = 10_000;
const DEFAULT_STRING_MAX_LENGTH = 320;
const PHONE_REGEX = /^[+\d][\d\s\-().+]{2,}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// Zod's own email and URL checks, exactly as generateZod uses them.
const EMAIL = z.string().email();
const URL_CHECK = z.string().url();

export interface ValidateSubmissionOptions {
	/**
	 * Answers to keys the schema does not have are refused with
	 * `unknown_field` (the default), or dropped with "strip".
	 */
	unknownFields?: "reject" | "strip";
	/** The moment relative date bounds such as "today" are measured from. */
	now?: Date;
}

export type SubmissionResult =
	| { ok: true; values: Record<string, unknown> }
	| {
			ok: false;
			/** The answers that were given, normalised, so a form can show them again. */
			values: Record<string, unknown>;
			errors: SubmissionErrors;
	  };

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function checkLength(
	value: string,
	min: number | undefined,
	max: number,
	errors: SubmissionError[],
	path: (string | number)[],
) {
	if (min !== undefined && value.length < min) {
		errors.push(submissionError("too_short", `Must be at least ${plural(min, "character")}`, path));
	}
	if (value.length > max) {
		errors.push(submissionError("too_long", `Must be at most ${plural(max, "character")}`, path));
	}
}

function outsideBounds(
	value: string,
	min: string | undefined,
	max: string | undefined,
	context: "date" | "datetime" | "time",
	now: Date,
): boolean {
	if (min) {
		const r = resolveDateBound(min, context, now);
		if (r && compareIso(value, r.iso) < 0) return true;
	}
	if (max) {
		const r = resolveDateBound(max, context, now);
		if (r && compareIso(value, r.iso) > 0) return true;
	}
	return false;
}

/** The checks for one given answer. Absence is handled by the caller. */
function checkValue(
	field: DslField,
	value: unknown,
	now: Date,
	path: (string | number)[] = [],
): SubmissionError[] {
	const errors: SubmissionError[] = [];
	const wrongType = (expected: string) => [
		submissionError("invalid_type", `Expected ${expected}`, path),
	];

	switch (field.t) {
		case "text":
		case "textarea":
			if (typeof value !== "string") return wrongType("text");
			checkLength(value, field.min, field.max ?? DEFAULT_TEXT_MAX_LENGTH, errors, path);
			return errors;
		case "markdown":
			if (typeof value !== "string") return wrongType("text");
			checkLength(value, undefined, field.max ?? DEFAULT_MARKDOWN_MAX_LENGTH, errors, path);
			return errors;
		case "email":
		case "url":
		case "phone": {
			if (typeof value !== "string") return wrongType("text");
			const valid =
				field.t === "email"
					? EMAIL.safeParse(value).success
					: field.t === "url"
						? URL_CHECK.safeParse(value).success
						: PHONE_REGEX.test(value);
			if (!valid) {
				const [code, message] =
					field.t === "email"
						? (["invalid_email", "Invalid email address"] as const)
						: field.t === "url"
							? (["invalid_url", "Invalid URL"] as const)
							: (["invalid_phone", "Invalid phone number"] as const);
				errors.push(submissionError(code, message, path));
			}
			checkLength(value, undefined, field.max ?? DEFAULT_STRING_MAX_LENGTH, errors, path);
			return errors;
		}
		case "date":
		case "datetime":
		case "time": {
			if (typeof value !== "string") return wrongType("text");
			const [pattern, code, message] =
				field.t === "date"
					? ([DATE_REGEX, "invalid_date", "Expected a date (YYYY-MM-DD)"] as const)
					: field.t === "datetime"
						? ([
								DATETIME_REGEX,
								"invalid_datetime",
								"Expected a date and time (YYYY-MM-DDTHH:MM)",
							] as const)
						: ([TIME_REGEX, "invalid_time", "Expected a time (HH:MM, 24 hour)"] as const);
			if (!pattern.test(value)) return [submissionError(code, message, path)];
			if (outsideBounds(value, field.min, field.max, field.t, now)) {
				errors.push(submissionError("out_of_range", "Outside the allowed range", path));
			}
			return errors;
		}
		case "daterange": {
			if (!isPlainObject(value)) return wrongType("a date range");
			for (const end of ["from", "to"] as const) {
				const v = value[end];
				if (typeof v !== "string" || !DATE_REGEX.test(v)) {
					errors.push(
						submissionError("invalid_date", "Expected a date (YYYY-MM-DD)", [...path, end]),
					);
				}
			}
			if (errors.length > 0) return errors;
			const from = value.from as string;
			const to = value.to as string;
			if (compareIso(from, to) > 0) {
				errors.push(submissionError("invalid_range", "The start date is after the end date", path));
			}
			if (
				outsideBounds(from, field.min, field.max, "date", now) ||
				outsideBounds(to, field.min, field.max, "date", now)
			) {
				errors.push(submissionError("out_of_range", "Outside the allowed range", path));
			}
			if (field.minSpanDays !== undefined || field.maxSpanDays !== undefined) {
				const days = Math.round(
					(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
				);
				if (
					(field.minSpanDays !== undefined && days < field.minSpanDays) ||
					(field.maxSpanDays !== undefined && days > field.maxSpanDays)
				) {
					errors.push(
						submissionError("out_of_range", "The range is shorter or longer than allowed", path),
					);
				}
			}
			return errors;
		}
		case "bool":
			return typeof value === "boolean" ? errors : wrongType("yes or no");
		case "number":
		case "integer": {
			if (typeof value !== "number" || !Number.isFinite(value)) return wrongType("a number");
			if (field.t === "integer" && !Number.isInteger(value)) {
				errors.push(submissionError("not_integer", "Expected a whole number", path));
			}
			if (field.min !== undefined && value < field.min) {
				errors.push(submissionError("out_of_range", `Must be at least ${field.min}`, path));
			}
			if (field.max !== undefined && value > field.max) {
				errors.push(submissionError("out_of_range", `Must be at most ${field.max}`, path));
			}
			return errors;
		}
		case "fixed":
			if (typeof value !== "string" || !field.opts.some((o) => o.k === value)) {
				return [submissionError("invalid_option", "Not one of the options", path)];
			}
			return errors;
		case "dynlist": {
			if (!Array.isArray(value)) return wrongType("a list");
			if (field.maxItems !== undefined && value.length > field.maxItems) {
				errors.push(
					submissionError("too_many_items", `At most ${plural(field.maxItems, "item")}`, path),
				);
			}
			value.forEach((item, i) => {
				errors.push(...checkValue(field.item as DslField, item, now, [...path, i]));
			});
			return errors;
		}
	}
}

/** Errors for the given fields of already normalised values. */
function checkFields(
	fields: DslField[],
	values: Record<string, unknown>,
	now: Date,
): SubmissionErrors {
	const errors: SubmissionErrors = {};
	for (const field of fields) {
		const value = values[field.k];
		const fieldErrors =
			value === undefined
				? field.req && !field.hidden
					? [submissionError("required", "Required")]
					: []
				: checkValue(field, value, now);
		if (fieldErrors.length > 0) errors[field.k] = fieldErrors;
	}
	return errors;
}

/**
 * Checks answers to a form on the server. It normalises them first (see
 * `normalizeSubmission`), then applies the rules the browser applies, and
 * refuses answers to keys the schema does not have unless told to drop them.
 *
 * `values` holds the normalised answers to the schema's fields: what to store
 * when `ok` is true.
 */
export function validateSubmission(
	schema: SchemaDslV1,
	raw: unknown,
	options: ValidateSubmissionOptions = {},
): SubmissionResult {
	const now = options.now ?? new Date();
	const values = normalizeSubmission(schema, raw);
	const errors = checkFields(schema.fields, values, now);
	if (options.unknownFields !== "strip" && isPlainObject(raw)) {
		const known = new Set(schema.fields.map((f) => f.k));
		for (const key of Object.keys(raw)) {
			if (!known.has(key)) {
				errors[key] = [submissionError("unknown_field", "Not a field of this form")];
			}
		}
	}
	if (!isPlainObject(raw)) {
		errors[""] = [submissionError("invalid_type", "Expected an object of answers")];
	}
	return Object.keys(errors).length === 0 ? { ok: true, values } : { ok: false, values, errors };
}

/**
 * Checks only some fields, for a step of a multi-step form or a field the
 * person has just left. The values are normalised as a whole first.
 */
export function validateFields(
	schema: SchemaDslV1,
	raw: unknown,
	keys: readonly string[],
	options: Pick<ValidateSubmissionOptions, "now"> = {},
): { ok: boolean; errors: SubmissionErrors } {
	const wanted = new Set(keys);
	const values = normalizeSubmission(schema, raw);
	const errors = checkFields(
		schema.fields.filter((f) => wanted.has(f.k)),
		values,
		options.now ?? new Date(),
	);
	return { ok: Object.keys(errors).length === 0, errors };
}
