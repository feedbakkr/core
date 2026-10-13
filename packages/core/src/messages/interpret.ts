import { resolveForm } from "../conditions/resolve.js";
import type { DslField, FieldType } from "../schema/schema-dsl.js";
import type { SchemaDsl } from "../schema/schema-dsl-v2.js";

/** One answer, ready to show: what an inbox or an email lists for a field. */
export interface SubmissionRow {
	key: string;
	label: string;
	type: FieldType;
	/** The stored answer, or `null` when none was given. */
	value: unknown;
	/** The answer as plain text: option labels, Yes or No, formatted dates. */
	display: string;
	/** For lists: each entry as plain text. */
	items?: string[];
	/** The answer is Markdown; render it safely, or show `display` as text. */
	markdown?: true;
	/** The id of the field's section, in a schema v2 with sections. */
	section?: string;
	/** A hidden field, filled in by the page rather than the person. */
	hidden?: true;
	/** The field is marked sensitive; the host decides who may see it. */
	sensitive?: true;
}

export interface InterpretOptions {
	/** The locale dates are written in. Defaults to "en-GB" (15 June 2026). */
	locale?: string;
	/** The text for a field with no answer. Defaults to "Not provided". */
	notProvided?: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Stored dates have no time zone, so they are read and written in UTC: the
 * calendar date and clock time stay exactly as the person entered them.
 */
function formatDate(value: string, locale: string): string {
	const m = DATE.exec(value);
	if (!m) return value;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	if (Number.isNaN(d.getTime())) return value;
	return new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(d);
}

function formatDatetime(value: string, locale: string): string {
	const m = DATETIME.exec(value);
	if (!m) return value;
	const date = formatDate(`${m[1]}-${m[2]}-${m[3]}`, locale);
	return `${date}, ${m[4]}:${m[5]}`;
}

/** One answer of a known field as plain text. */
function displayValue(field: DslField, value: unknown, locale: string): string {
	switch (field.t) {
		case "bool":
			return value === true ? "Yes" : value === false ? "No" : String(value);
		case "fixed": {
			const option = field.opts.find((o) => o.k === value);
			return option?.label ?? String(value);
		}
		case "date":
			return typeof value === "string" ? formatDate(value, locale) : String(value);
		case "datetime":
			return typeof value === "string" ? formatDatetime(value, locale) : String(value);
		case "daterange": {
			if (typeof value !== "object" || value === null) return String(value);
			const { from, to } = value as { from?: unknown; to?: unknown };
			const f = typeof from === "string" ? formatDate(from, locale) : "";
			const t = typeof to === "string" ? formatDate(to, locale) : "";
			return f && t ? `${f} to ${t}` : f || t;
		}
		case "dynlist":
			return Array.isArray(value)
				? value.map((item) => displayValue(field.item as DslField, item, locale)).join(", ")
				: String(value);
		default:
			return typeof value === "string" ? value : String(value);
	}
}

/**
 * The answers to a form as rows to display, in the schema's order, one per
 * field: the label, the stored value and that value as plain text. Fields
 * with no answer are included, shown as "Not provided". In schema v2, fields
 * whose conditions do not hold are left out, and each row names its section.
 * Formatting is plain text; HTML and email layout belong to the host.
 *
 * Use the schema the answers were checked against, so renamed labels and
 * removed options still read as they were submitted.
 */
export function interpretSubmission(
	schema: SchemaDsl,
	values: Record<string, unknown>,
	options: InterpretOptions = {},
): SubmissionRow[] {
	const locale = options.locale ?? "en-GB";
	const notProvided = options.notProvided ?? "Not provided";
	const sectionOf = new Map<string, string>();
	if (schema.v === 2) {
		for (const s of schema.sections ?? []) for (const k of s.fields) sectionOf.set(k, s.id);
	}
	return resolveForm(schema, values).fields.map((field) => {
		const value = values[field.k];
		const given = value !== undefined && value !== null;
		const row: SubmissionRow = {
			key: field.k,
			label: field.label,
			type: field.t,
			value: given ? value : null,
			display: given ? displayValue(field, value, locale) : notProvided,
		};
		if (given && field.t === "dynlist" && Array.isArray(value)) {
			row.items = value.map((item) => displayValue(field.item as DslField, item, locale));
		}
		const section = sectionOf.get(field.k);
		if (section) row.section = section;
		if (field.t === "markdown") row.markdown = true;
		if (field.hidden) row.hidden = true;
		if (field.sensitive === true) row.sensitive = true;
		return row;
	});
}
