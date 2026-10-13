// FeedbakkrForm: renders any v1 or v2 schema on useFeedbakkrForm, so it
// applies the server's checks and conditions as the person fills it in.
//
// It takes DynamicForm's props, and adds the app's own components, per-type
// widgets, its own wording, controlled answers, server errors and a simple
// stepper for sections. With no components given it renders plain, unstyled
// elements marked with data-fbk attributes for styling.
import {
	type ButtonHTMLAttributes,
	type ComponentType,
	type CSSProperties,
	type InputHTMLAttributes,
	type LabelHTMLAttributes,
	type ReactNode,
	type SelectHTMLAttributes,
	type TextareaHTMLAttributes,
	useEffect,
	useId,
	useState,
} from "react";
import type { SectionStatus } from "../form/state.js";
import type { DslField, FieldType } from "../schema/schema-dsl.js";
import type { DslFieldV2, SchemaDsl } from "../schema/schema-dsl-v2.js";
import type {
	SubmissionError,
	SubmissionErrorCode,
	SubmissionErrors,
} from "../submissions/errors.js";
import { normalizeValue } from "../submissions/normalize-value.js";
import { type FeedbakkrFormApi, useFeedbakkrForm } from "./use-feedbakkr-form.js";

/** The building blocks FeedbakkrForm renders with. Pass any to use your own. */
export interface FormComponents {
	Input: ComponentType<InputHTMLAttributes<HTMLInputElement>>;
	Textarea: ComponentType<TextareaHTMLAttributes<HTMLTextAreaElement>>;
	Select: ComponentType<SelectHTMLAttributes<HTMLSelectElement>>;
	/** A checkbox input; `type="checkbox"` is passed. */
	Checkbox: ComponentType<InputHTMLAttributes<HTMLInputElement>>;
	Label: ComponentType<LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }>;
	/** Wraps one field: its label, control, help and error. */
	FieldWrapper: ComponentType<{ field: DslFieldV2; invalid: boolean; children: ReactNode }>;
	Help: ComponentType<{ id: string; children: ReactNode }>;
	Error: ComponentType<{ id: string; children: ReactNode }>;
	Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
	/** A section of a v2 schema, with its fields as children. */
	Section: ComponentType<{ section: SectionStatus; children: ReactNode }>;
}

/** Every piece of built-in text. */
export interface FormStrings {
	submit: string;
	submitting: string;
	selectPlaceholder: string;
	addItem: string;
	removeItem: string;
	/** The label of a list's entry; `{n}` is its number. */
	item: string;
	from: string;
	to: string;
	next: string;
	back: string;
	/** Your wording per error code, used instead of the English default. */
	errors: Partial<Record<SubmissionErrorCode, string>>;
}

export const DEFAULT_STRINGS: FormStrings = {
	submit: "Submit",
	submitting: "Submitting...",
	selectPlaceholder: "Select...",
	addItem: "Add item",
	removeItem: "Remove",
	item: "Item {n}",
	from: "From",
	to: "To",
	next: "Next",
	back: "Back",
	errors: {},
};

/** What a widget gets to render one field's control. */
export interface WidgetProps {
	field: DslFieldV2;
	/** The control's id; the label points at it. */
	id: string;
	value: unknown;
	onChange: (value: unknown) => void;
	onBlur: () => void;
	invalid: boolean;
	required: boolean;
	/** Ids of the help and error text, for aria-describedby. */
	describedBy?: string;
	/** For lists: the error message of each entry, by index. */
	itemErrors: Record<number, string>;
	components: FormComponents;
	strings: FormStrings;
}

export type Widget = ComponentType<WidgetProps>;

const DEFAULT_COMPONENTS: FormComponents = {
	Input: (props) => <input data-fbk="input" {...props} />,
	Textarea: (props) => <textarea data-fbk="textarea" {...props} />,
	Select: (props) => <select data-fbk="select" {...props} />,
	Checkbox: (props) => <input data-fbk="checkbox" {...props} />,
	Label: ({ required, children, ...props }) => (
		// biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is passed in props
		<label data-fbk="label" {...props}>
			{children}
			{required && (
				<span data-fbk="required" aria-hidden="true">
					{" *"}
				</span>
			)}
		</label>
	),
	FieldWrapper: ({ field, invalid, children }) => (
		<div data-fbk="field" data-fbk-type={field.t} data-fbk-invalid={invalid || undefined}>
			{children}
		</div>
	),
	Help: ({ id, children }) => (
		<p data-fbk="help" id={id}>
			{children}
		</p>
	),
	Error: ({ id, children }) => (
		<p data-fbk="error" id={id} role="alert">
			{children}
		</p>
	),
	Button: (props) => <button data-fbk="button" {...props} />,
	Section: ({ section, children }) => (
		<fieldset data-fbk="section">
			<legend data-fbk="section-title">{section.title}</legend>
			{section.desc && <p data-fbk="section-description">{section.desc}</p>}
			{children}
		</fieldset>
	),
};

function text(value: unknown): string {
	return value === undefined || value === null ? "" : String(value);
}

/** Empty input is no answer. */
function fromInput(value: string): string | undefined {
	return value === "" ? undefined : value;
}

const INPUT_TYPE: Partial<Record<FieldType, string>> = {
	text: "text",
	email: "email",
	url: "url",
	phone: "tel",
	number: "number",
	integer: "number",
	date: "date",
	datetime: "datetime-local",
	time: "time",
};

/** The built-in control for each field type. */
function BuiltInWidget(props: WidgetProps): ReactNode {
	const {
		field,
		id,
		value,
		onChange,
		onBlur,
		invalid,
		required,
		describedBy,
		components,
		strings,
	} = props;
	const { Input, Textarea, Select, Checkbox, Button } = components;
	const aria = {
		"aria-invalid": invalid || undefined,
		"aria-required": required || undefined,
		"aria-describedby": describedBy,
	};
	const placeholder = field.placeholder;
	switch (field.t) {
		case "textarea":
		case "markdown":
			return (
				<Textarea
					id={id}
					value={text(value)}
					onChange={(e) => onChange(fromInput(e.target.value))}
					onBlur={onBlur}
					rows={field.t === "markdown" ? 6 : 4}
					maxLength={field.max}
					placeholder={placeholder}
					{...aria}
				/>
			);
		case "bool":
			return (
				<Checkbox
					id={id}
					type="checkbox"
					checked={value === true}
					onChange={(e) => onChange(e.target.checked)}
					onBlur={onBlur}
					{...aria}
				/>
			);
		case "fixed":
			return (
				<Select
					id={id}
					value={text(value)}
					onChange={(e) => onChange(fromInput(e.target.value))}
					onBlur={onBlur}
					{...aria}
				>
					<option value="">{placeholder ?? strings.selectPlaceholder}</option>
					{field.opts.map((o) => (
						<option key={o.k} value={o.k}>
							{o.label ?? o.k}
						</option>
					))}
				</Select>
			);
		case "daterange": {
			const range = (value ?? {}) as { from?: string; to?: string };
			const set = (end: "from" | "to", v: string) => {
				const next = { ...range, [end]: fromInput(v) };
				onChange(next.from === undefined && next.to === undefined ? undefined : next);
			};
			return (
				<span data-fbk="daterange">
					<Input
						id={id}
						type="date"
						aria-label={strings.from}
						value={text(range.from)}
						onChange={(e) => set("from", e.target.value)}
						onBlur={onBlur}
						{...aria}
					/>
					<Input
						type="date"
						aria-label={strings.to}
						value={text(range.to)}
						onChange={(e) => set("to", e.target.value)}
						onBlur={onBlur}
						{...aria}
					/>
				</span>
			);
		}
		case "dynlist": {
			const items = Array.isArray(value) ? value : [];
			const item = field.item as DslField;
			const full = field.maxItems !== undefined && items.length >= field.maxItems;
			const set = (next: unknown[]) => onChange(next.length > 0 ? next : undefined);
			return (
				<div data-fbk="list">
					{items.map((entry, i) => {
						const itemId = `${id}-${i}`;
						const label = strings.item.replace("{n}", String(i + 1));
						const error = props.itemErrors[i];
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: entries have no identity of their own
							<div data-fbk="list-item" key={i}>
								<components.Label htmlFor={itemId}>{label}</components.Label>
								<BuiltInWidget
									{...props}
									field={{ ...item, k: `${field.k}_${i}`, label } as DslFieldV2}
									id={itemId}
									value={entry}
									onChange={(v) => set(items.map((x, j) => (j === i ? v : x)))}
									invalid={error !== undefined}
									required={false}
									describedBy={error ? `${itemId}-error` : undefined}
									itemErrors={{}}
								/>
								<Button
									type="button"
									aria-label={`${strings.removeItem}: ${label}`}
									onClick={() => set(items.filter((_, j) => j !== i))}
								>
									{strings.removeItem}
								</Button>
								{error && <components.Error id={`${itemId}-error`}>{error}</components.Error>}
							</div>
						);
					})}
					<Button type="button" disabled={full} onClick={() => onChange([...items, undefined])}>
						{strings.addItem}
					</Button>
				</div>
			);
		}
		default: {
			const isNumber = field.t === "number" || field.t === "integer";
			return (
				<Input
					id={id}
					type={INPUT_TYPE[field.t] ?? "text"}
					value={text(value)}
					onChange={(e) => onChange(fromInput(e.target.value))}
					onBlur={onBlur}
					placeholder={placeholder}
					maxLength={
						"max" in field && !isNumber && typeof field.max === "number" ? field.max : undefined
					}
					min={isNumber && "min" in field ? (field.min as number | undefined) : undefined}
					max={isNumber && "max" in field ? (field.max as number | undefined) : undefined}
					step={field.t === "integer" ? 1 : field.t === "number" ? "any" : undefined}
					{...aria}
				/>
			);
		}
	}
}

export interface FeedbakkrFormProps {
	schema: SchemaDsl;
	/** Called with the checked, normalised answers when every field passes. */
	onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
	/** Starting answers, on top of the schema's defaults. Hidden fields are filled here. */
	initialValues?: Record<string, unknown>;
	/** Shows the form as busy, for example while the host sends the answers. */
	submitting?: boolean;
	className?: string;
	style?: CSSProperties;
	/** Replaces the submit button. */
	renderFooter?: (props: { submitting: boolean }) => ReactNode;
	/** Your own building blocks; any left out use the plain defaults. */
	components?: Partial<FormComponents>;
	/** Your own control for a field type, such as a date picker. */
	widgets?: Partial<Record<FieldType, Widget>>;
	/** Your wording for the built-in text. */
	strings?: Partial<FormStrings>;
	/** Controlled answers. Changes go to `onChange`. */
	values?: Record<string, unknown>;
	onChange?: (values: Record<string, unknown>) => void;
	/** Errors to show, such as those the server returned for these answers. */
	errors?: SubmissionErrors;
	/** "stacked" (default) shows every section; "steps" shows one at a time. */
	layout?: "stacked" | "steps";
	/** Show the schema's title and description (default true). */
	showTitle?: boolean;
}

function message(error: SubmissionError | undefined, strings: FormStrings): string | undefined {
	if (!error) return undefined;
	return strings.errors[error.code] ?? error.message;
}

function FieldView({
	field,
	form,
	baseId,
	components,
	widgets,
	strings,
}: {
	field: DslFieldV2;
	form: FeedbakkrFormApi;
	baseId: string;
	components: FormComponents;
	widgets: Partial<Record<FieldType, Widget>>;
	strings: FormStrings;
}) {
	const id = `${baseId}-${field.k}`;
	const errors = form.errors[field.k] ?? [];
	const fieldError = message(
		errors.find((e) => typeof e.path?.[0] !== "number"),
		strings,
	);
	// An entry's error counts only the entries that were checked: empty ones
	// are dropped first. Map it back to the entry as shown.
	const raw = form.values[field.k];
	const shown =
		field.t === "dynlist" && Array.isArray(raw)
			? raw.flatMap((entry, i) =>
					normalizeValue(field.item as DslField, entry) === undefined ? [] : [i],
				)
			: [];
	const itemErrors: Record<number, string> = {};
	for (const e of errors) {
		const at = e.path?.[0];
		const index = typeof at === "number" ? shown[at] : undefined;
		if (index !== undefined && itemErrors[index] === undefined) {
			itemErrors[index] = message(e, strings) as string;
		}
	}
	const helpId = field.help ? `${id}-help` : undefined;
	const errorId = fieldError ? `${id}-error` : undefined;
	const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
	const required = field.req === true;
	const Control = widgets[field.t] ?? BuiltInWidget;
	const group = field.t === "dynlist" || field.t === "daterange";

	const control = (
		<Control
			field={field}
			id={id}
			value={form.values[field.k]}
			onChange={(v) => form.setValue(field.k, v)}
			onBlur={() => form.blur(field.k)}
			invalid={fieldError !== undefined || Object.keys(itemErrors).length > 0}
			required={required}
			describedBy={describedBy}
			itemErrors={itemErrors}
			components={components}
			strings={strings}
		/>
	);
	const extras = (
		<>
			{field.help && helpId && <components.Help id={helpId}>{field.help}</components.Help>}
			{fieldError && errorId && <components.Error id={errorId}>{fieldError}</components.Error>}
		</>
	);

	return (
		<components.FieldWrapper field={field} invalid={fieldError !== undefined}>
			{group ? (
				<fieldset data-fbk="group" aria-describedby={describedBy}>
					<legend data-fbk="legend">
						{field.label}
						{required && (
							<span data-fbk="required" aria-hidden="true">
								{" *"}
							</span>
						)}
					</legend>
					{control}
					{extras}
				</fieldset>
			) : field.t === "bool" ? (
				<>
					{control}
					<components.Label htmlFor={id} required={required}>
						{field.label}
					</components.Label>
					{extras}
				</>
			) : (
				<>
					<components.Label htmlFor={id} required={required}>
						{field.label}
					</components.Label>
					{control}
					{extras}
				</>
			)}
		</components.FieldWrapper>
	);
}

/**
 * Renders a form from a v1 or v2 schema. In v2, fields and sections appear
 * and disappear as their conditions change. Answers are checked with the
 * server's rules (`validateSubmission`) when a field is left and on submit,
 * and `onSubmit` receives the normalised answers.
 */
export function FeedbakkrForm({
	schema,
	onSubmit,
	initialValues,
	submitting: submittingProp,
	className,
	style,
	renderFooter,
	components: componentsProp,
	widgets = {},
	strings: stringsProp,
	values,
	onChange,
	errors,
	layout = "stacked",
	showTitle = true,
}: FeedbakkrFormProps) {
	const components = { ...DEFAULT_COMPONENTS, ...componentsProp };
	const strings = {
		...DEFAULT_STRINGS,
		...stringsProp,
		errors: { ...DEFAULT_STRINGS.errors, ...stringsProp?.errors },
	};
	const form = useFeedbakkrForm(schema, {
		initialValues,
		onSubmit,
		values,
		onValuesChange: onChange,
	});
	const baseId = useId();
	const [step, setStep] = useState(0);

	// Errors from the host (such as the server's) are shown until the field changes.
	const { setErrors } = form;
	useEffect(() => {
		if (errors) setErrors(errors);
	}, [errors, setErrors]);

	const submitting = submittingProp === true || form.submitting;
	const sections = form.sections.filter((s) => s.applies);
	const steps = layout === "steps" && sections.length > 0;
	const current = steps ? sections[Math.min(step, sections.length - 1)] : undefined;
	const lastStep = !steps || current === sections.at(-1);

	const fieldViews = (fields: DslFieldV2[]) =>
		fields.map((field) => (
			<FieldView
				key={field.k}
				field={field}
				form={form}
				baseId={baseId}
				components={components}
				widgets={widgets}
				strings={strings}
			/>
		));

	const body =
		sections.length === 0
			? fieldViews(form.fields)
			: (current ? [current] : sections).map((section) => (
					<components.Section key={section.id} section={section}>
						{fieldViews(section.fields)}
					</components.Section>
				));

	return (
		<form
			data-fbk="form"
			className={className}
			style={style}
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				if (current && !lastStep) {
					if (form.validateSection(current.id)) setStep(step + 1);
					return;
				}
				void form.handleSubmit();
			}}
		>
			{showTitle && schema.title && <h2 data-fbk="title">{schema.title}</h2>}
			{showTitle && schema.desc && <p data-fbk="description">{schema.desc}</p>}
			{body}
			{steps && step > 0 && (
				<components.Button type="button" onClick={() => setStep(step - 1)}>
					{strings.back}
				</components.Button>
			)}
			{!lastStep ? (
				<components.Button type="submit">{strings.next}</components.Button>
			) : renderFooter ? (
				renderFooter({ submitting })
			) : (
				<components.Button type="submit" disabled={submitting}>
					{submitting ? strings.submitting : strings.submit}
				</components.Button>
			)}
		</form>
	);
}
