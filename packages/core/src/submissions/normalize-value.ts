import type { DslField } from "../schema/schema-dsl.js";

/** An answer that counts as not given. */
const ABSENT = undefined;

const TRUE_WORDS = new Set(["true", "on", "yes", "1"]);
const FALSE_WORDS = new Set(["false", "off", "no", "0"]);
const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trims a string; an empty result is no answer. Anything else is left for the checks. */
function trimmed(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const t = value.trim();
	return t === "" ? ABSENT : t;
}

/**
 * One answer, made consistent: strings trimmed, empty answers removed,
 * numbers and booleans read from form text. Values of the wrong shape are
 * left as they are, so the checks can report them.
 */
export function normalizeValue(field: DslField, value: unknown): unknown {
	if (value === null || value === undefined) return ABSENT;
	switch (field.t) {
		case "text":
		case "textarea":
		case "email":
		case "url":
		case "phone":
		case "date":
		case "datetime":
		case "time":
		case "fixed":
			return trimmed(value);
		case "markdown":
			// Leading and trailing spaces can be part of Markdown, so only a
			// blank answer is removed.
			return typeof value === "string" && value.trim() === "" ? ABSENT : value;
		case "number":
		case "integer": {
			if (typeof value !== "string") return value;
			const t = value.trim();
			if (t === "") return ABSENT;
			return NUMBER_TEXT.test(t) ? Number(t) : value;
		}
		case "bool": {
			if (typeof value !== "string") return value;
			const t = value.trim().toLowerCase();
			if (t === "") return ABSENT;
			if (TRUE_WORDS.has(t)) return true;
			if (FALSE_WORDS.has(t)) return false;
			return value;
		}
		case "daterange": {
			if (!isPlainObject(value)) return value;
			const from = trimmed(value.from);
			const to = trimmed(value.to);
			if (from === ABSENT && to === ABSENT) return ABSENT;
			return { from, to };
		}
		case "dynlist": {
			// A single value from a form post is a list of one.
			const items = Array.isArray(value) ? value : [value];
			const kept = items
				.map((item) => normalizeValue(field.item as DslField, item))
				.filter((item) => item !== ABSENT);
			return kept.length > 0 ? kept : ABSENT;
		}
	}
}
