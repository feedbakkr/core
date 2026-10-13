import type { DslField, SchemaDslV1 } from "../schema/schema-dsl.js";
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
	schema: SchemaDslV1,
	initialValues: Record<string, unknown> = {},
): FormState {
	const values: Record<string, unknown> = {};
	for (const field of schema.fields) {
		if (field.default !== undefined && field.default !== null) values[field.k] = field.default;
	}
	return { values: { ...values, ...initialValues }, errors: {}, touched: {} };
}

/** The fields to show. In schema v1 that is every field that is not hidden. */
export function applicableFields(schema: SchemaDslV1): DslField[] {
	return schema.fields.filter((f) => !f.hidden);
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
	schema: SchemaDslV1,
	state: FormState,
	keys: readonly string[] = schema.fields.map((f) => f.k),
	options: { now?: Date } = {},
): FormState {
	const result = validateFields(schema, state.values, keys, options);
	const errors = { ...state.errors };
	for (const key of keys) delete errors[key];
	return { ...state, errors: { ...errors, ...result.errors } };
}
