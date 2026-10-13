import { useCallback, useMemo, useRef, useState } from "react";
import {
	applicableFields,
	checkFields,
	createFormState,
	type FormState,
	type SectionStatus,
	sectionStatus,
	setValue as setFormValue,
	touch,
} from "../form/state.js";
import type { DslFieldV2, SchemaDsl } from "../schema/schema-dsl-v2.js";
import type { SubmissionErrors } from "../submissions/errors.js";
import { validateSubmission } from "../submissions/validate.js";

export interface UseFeedbakkrFormOptions {
	/** Starting answers, on top of the schema's defaults. */
	initialValues?: Record<string, unknown>;
	/**
	 * Called with the checked, normalised answers when the form is submitted
	 * and every field passes. A thrown error is left to the caller; use
	 * `setErrors` to show errors the server returned.
	 */
	onSubmit?: (values: Record<string, unknown>) => void | Promise<void>;
	/** Check a field when the person leaves it (default true). */
	validateOnBlur?: boolean;
	/**
	 * Controlled mode: the answers come from here, and every change goes to
	 * `onValuesChange` instead of the hook's own state.
	 */
	values?: Record<string, unknown>;
	onValuesChange?: (values: Record<string, unknown>) => void;
}

export interface FeedbakkrFormApi {
	/**
	 * The fields to show now, in order: in schema v2 only those whose
	 * conditions hold for the current answers. Hidden fields are filled
	 * through values.
	 */
	fields: DslFieldV2[];
	/** Each section's fields and status (schema v2), for steps or pages. */
	sections: SectionStatus[];
	/** Checks one section's fields and shows their errors. True when they pass. */
	validateSection: (id: string) => boolean;
	/** The answers as entered. */
	values: Record<string, unknown>;
	errors: SubmissionErrors;
	touched: Record<string, true>;
	/** The first error message for a field, if any. */
	errorFor: (key: string) => string | undefined;
	setValue: (key: string, value: unknown) => void;
	/** Marks a field as left, and checks it if `validateOnBlur` is on. */
	blur: (key: string) => void;
	/** Checks some fields (or all) and shows their errors. True when they pass. */
	validate: (keys?: readonly string[]) => boolean;
	/** Checks everything, then calls `onSubmit`. Use as a form's onSubmit. */
	handleSubmit: (event?: { preventDefault?: () => void }) => Promise<boolean>;
	/** Replaces the errors, for example with errors the server returned. */
	setErrors: (errors: SubmissionErrors) => void;
	/** Starts again, from the defaults and these values (or the initial ones). */
	reset: (values?: Record<string, unknown>) => void;
	submitting: boolean;
	submitCount: number;
}

/**
 * Form state and checks for a form built from your own components: the same
 * rules `validateSubmission` applies on the server, checked as the person
 * fills the form in. It renders nothing.
 */
export function useFeedbakkrForm(
	schema: SchemaDsl,
	options: UseFeedbakkrFormOptions = {},
): FeedbakkrFormApi {
	const { initialValues, onSubmit, validateOnBlur = true } = options;
	const [ownState, setState] = useState<FormState>(() =>
		createFormState(schema, options.values ?? initialValues),
	);
	const [submitting, setSubmitting] = useState(false);
	const [submitCount, setSubmitCount] = useState(0);
	const controlled = options.values !== undefined;
	const state: FormState = controlled
		? { ...ownState, values: options.values as Record<string, unknown> }
		: ownState;
	// The latest state, for handlers called before a re-render.
	const stateRef = useRef(state);
	stateRef.current = state;
	const onValuesChangeRef = useRef(options.onValuesChange);
	onValuesChangeRef.current = options.onValuesChange;
	const controlledRef = useRef(controlled);
	controlledRef.current = controlled;

	const update = useCallback((next: (s: FormState) => FormState) => {
		const before = stateRef.current;
		stateRef.current = next(before);
		if (controlledRef.current && stateRef.current.values !== before.values) {
			onValuesChangeRef.current?.(stateRef.current.values);
		}
		setState(stateRef.current);
	}, []);

	const setValue = useCallback(
		(key: string, value: unknown) => update((s) => setFormValue(s, key, value)),
		[update],
	);

	const blur = useCallback(
		(key: string) =>
			update((s) => {
				const touched = touch(s, key);
				return validateOnBlur ? checkFields(schema, touched, [key]) : touched;
			}),
		[schema, update, validateOnBlur],
	);

	const validate = useCallback(
		(keys?: readonly string[]) => {
			update((s) => checkFields(schema, s, keys));
			const wanted = keys ?? schema.fields.map((f) => f.k);
			return wanted.every((k) => !stateRef.current.errors[k]);
		},
		[schema, update],
	);

	const handleSubmit = useCallback(
		async (event?: { preventDefault?: () => void }) => {
			event?.preventDefault?.();
			setSubmitCount((n) => n + 1);
			const result = validateSubmission(schema, stateRef.current.values, {
				unknownFields: "strip",
			});
			if (!result.ok) {
				update((s) => ({ ...s, errors: result.errors }));
				return false;
			}
			update((s) => ({ ...s, errors: {} }));
			if (!onSubmit) return true;
			setSubmitting(true);
			try {
				await onSubmit(result.values);
			} finally {
				setSubmitting(false);
			}
			return true;
		},
		[schema, onSubmit, update],
	);

	const setErrors = useCallback(
		(errors: SubmissionErrors) => update((s) => ({ ...s, errors })),
		[update],
	);

	const reset = useCallback(
		(values?: Record<string, unknown>) =>
			update(() => createFormState(schema, values ?? initialValues)),
		[schema, initialValues, update],
	);

	const fields = useMemo(() => applicableFields(schema, state.values), [schema, state.values]);
	const sections = useMemo(() => sectionStatus(schema, state), [schema, state]);

	const validateSection = useCallback(
		(id: string) => {
			const section = schema.v === 2 ? schema.sections?.find((s) => s.id === id) : undefined;
			return validate(section?.fields ?? []);
		},
		[schema, validate],
	);

	return {
		fields,
		sections,
		validateSection,
		values: state.values,
		errors: state.errors,
		touched: state.touched,
		errorFor: (key) => state.errors[key]?.[0]?.message,
		setValue,
		blur,
		validate,
		handleSubmit,
		setErrors,
		reset,
		submitting,
		submitCount,
	};
}
