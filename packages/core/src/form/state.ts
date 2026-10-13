import { resolveForm } from "../conditions/resolve.js";
import type { DslFieldV2, SchemaDsl } from "../schema/schema-dsl-v2.js";
import type { SubmissionErrors } from "../submissions/errors.js";
import { validateFields } from "../submissions/validate.js";

/**
 * The state of a form being filled in, as plain data, so any framework (or
 * none) can hold it. Every function returns a new state.
 */
export interface FormState {
	/** The answers as entered, before normalising. */
	values: Record<string, unknown>;
	/** Errors by field key, from the last check of each field. */
	errors: SubmissionErrors;
	/** Fields the person has left at least once. */
	touched: Record<string, true>;
}

/** The starting state: each field's default, then `initialValues` on top. */
export function createFormState(
	schema: SchemaDsl,
	initialValues: Record<string, unknown> = {},
): FormState {
	const values: Record<string, unknown> = {};
	for (const field of schema.fields) {
		if (field.default !== undefined && field.default !== null) values[field.k] = field.default;
	}
	return { values: { ...values, ...initialValues }, errors: {}, touched: {} };
}

/**
 * The fields to show for these answers: those whose conditions hold (schema
 * v2), leaving out hidden fields, which the page fills in. In schema v1 that
 * is every field that is not hidden.
 */
export function applicableFields(
	schema: SchemaDsl,
	values: Record<string, unknown> = {},
): DslFieldV2[] {
	return resolveForm(schema, values).fields.filter((f) => !f.hidden);
}

/** Where a section of a multi-step form stands. */
export interface SectionStatus {
	id: string;
	title: string;
	desc?: string;
	/** The section's condition holds, so it is shown. */
	applies: boolean;
	/** Its fields to show, in order. */
	fields: DslFieldV2[];
	/** Its shown fields pass their checks (an empty section passes). */
	valid: boolean;
	/** How many of its shown fields have errors recorded in the state. */
	errorCount: number;
}

/**
 * Each section with its fields and whether they pass, for a stepper or a
 * progress list. Empty for a schema without sections.
 */
export function sectionStatus(
	schema: SchemaDsl,
	state: FormState,
	options: { now?: Date } = {},
): SectionStatus[] {
	const resolved = resolveForm(schema, state.values);
	const shown = new Set(resolved.fields.filter((f) => !f.hidden).map((f) => f.k));
	const checkable = new Set(resolved.fields.map((f) => f.k));
	return resolved.sections.map(({ section, applies }) => {
		const fields = resolved.fields.filter((f) => shown.has(f.k) && section.fields.includes(f.k));
		const keys = section.fields.filter((k) => checkable.has(k));
		return {
			id: section.id,
			title: section.title,
			...(section.desc ? { desc: section.desc } : {}),
			applies,
			fields,
			valid: validateFields(schema, state.values, keys, options).ok,
			errorCount: fields.filter((f) => state.errors[f.k]).length,
		};
	});
}

/** Sets one answer and clears that field's errors until it is checked again. */
export function setValue(state: FormState, key: string, value: unknown): FormState {
	const { [key]: _cleared, ...errors } = state.errors;
	return { ...state, values: { ...state.values, [key]: value }, errors };
}

/** Marks a field as left by the person. */
export function touch(state: FormState, key: string): FormState {
	return state.touched[key] ? state : { ...state, touched: { ...state.touched, [key]: true } };
}

/**
 * Checks some fields (all of them when `keys` is left out) and records their
 * errors, replacing earlier errors for those fields only.
 */
export function checkFields(
	schema: SchemaDsl,
	state: FormState,
	keys: readonly string[] = schema.fields.map((f) => f.k),
	options: { now?: Date } = {},
): FormState {
	const result = validateFields(schema, state.values, keys, options);
	const errors = { ...state.errors };
	for (const key of keys) delete errors[key];
	return { ...state, errors: { ...errors, ...result.errors } };
}
