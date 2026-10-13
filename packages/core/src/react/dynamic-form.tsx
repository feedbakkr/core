// Moved from FeedBakkr (packages/ui/src/dynamic-form.tsx at 8ae744e). The
// imports changed (`ReactNode` is imported rather than read from the global
// `React`), a `style` prop was added, and empty list entries are dropped on
// submit (see `withoutEmptyListItems`). Otherwise its output must keep matching
// the reference copy: see test/react.test.tsx.
import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useState } from "react";
import type { ZodError } from "zod";
import { resolveDateBound } from "../schema/date-bounds.js";
import { generateZod } from "../schema/generate-zod.js";
import type { DslField, SchemaDslV1 } from "../schema/schema-dsl.js";

function resolveBoundAttr(
	bound: string | undefined,
	context: "date" | "datetime" | "time",
): string | undefined {
	if (!bound) return undefined;
	const r = resolveDateBound(bound, context, new Date());
	return r ? r.iso : undefined;
}

/**
 * Removes the entries of list fields that were added but left empty, and a
 * list left with no entries. The answer check accepts an `undefined` entry,
 * but sent as JSON it becomes `null`, which the same check on the server
 * refuses. Dropping them makes what the form accepts what the server accepts.
 */
function withoutEmptyListItems(
	schema: SchemaDslV1,
	values: Record<string, unknown>,
): Record<string, unknown> {
	const next = { ...values };
	for (const field of schema.fields) {
		const value = next[field.k];
		if (field.t !== "dynlist" || !Array.isArray(value)) continue;
		const items = value.filter((item) => item !== undefined && item !== null);
		if (items.length > 0) next[field.k] = items;
		else delete next[field.k];
	}
	return next;
}

export interface DynamicFormProps {
	schema: SchemaDslV1;
	onSubmit: (data: Record<string, unknown>) => void | Promise<void>;
	initialValues?: Record<string, unknown>;
	submitting?: boolean;
	/** Passed to the `<form>` element. */
	className?: string;
	/** Passed to the `<form>` element. */
	style?: CSSProperties;
	renderFooter?: (props: { submitting: boolean }) => ReactNode;
}

type FieldErrors = Record<string, string>;

export function DynamicForm({
	schema,
	onSubmit,
	initialValues,
	submitting,
	className,
	style,
	renderFooter,
}: DynamicFormProps) {
	// Build initial values from schema defaults + explicit initialValues
	const [values, setValues] = useState<Record<string, unknown>>(() => {
		const defaults: Record<string, unknown> = {};
		for (const f of schema.fields) {
			if (f.default !== undefined && f.default !== null) defaults[f.k] = f.default;
		}
		return { ...defaults, ...(initialValues ?? {}) };
	});
	const [errors, setErrors] = useState<FieldErrors>({});

	const setValue = useCallback((key: string, value: unknown) => {
		setValues((prev) => ({ ...prev, [key]: value }));
		setErrors((prev) => {
			const next = { ...prev };
			delete next[key];
			return next;
		});
	}, []);

	const handleSubmit = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			const zodSchema = generateZod(schema);
			const result = zodSchema.safeParse(withoutEmptyListItems(schema, values));
			if (!result.success) {
				const fieldErrors: FieldErrors = {};
				for (const issue of (result.error as ZodError).issues) {
					const key = issue.path[0]?.toString();
					if (key && !fieldErrors[key]) {
						fieldErrors[key] = issue.message;
					}
				}
				setErrors(fieldErrors);
				return;
			}
			setErrors({});
			onSubmit(result.data as Record<string, unknown>);
		},
		[schema, values, onSubmit],
	);

	return (
		<form onSubmit={handleSubmit} className={className} style={style}>
			{schema.title && (
				<h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
					{schema.title}
				</h2>
			)}
			{schema.desc && <p style={{ color: "#666", marginBottom: "1rem" }}>{schema.desc}</p>}

			{schema.fields
				.filter((f) => !f.hidden)
				.map((field) => (
					<div key={field.k} style={{ marginBottom: "1rem" }}>
						<FieldRenderer
							field={field}
							value={values[field.k]}
							onChange={(v) => setValue(field.k, v)}
							error={errors[field.k]}
						/>
					</div>
				))}

			{renderFooter ? (
				renderFooter({ submitting: !!submitting })
			) : (
				<button
					type="submit"
					disabled={submitting}
					style={{
						padding: "0.5rem 1.5rem",
						backgroundColor: submitting ? "#666" : "#000",
						color: "#fff",
						border: "none",
						borderRadius: "0.375rem",
						cursor: submitting ? "not-allowed" : "pointer",
						fontSize: "0.875rem",
					}}
				>
					{submitting ? "Submitting..." : "Submit"}
				</button>
			)}
		</form>
	);
}

interface FieldRendererProps {
	field: DslField;
	value: unknown;
	onChange: (value: unknown) => void;
	error?: string;
}

function FieldRenderer({ field, value, onChange, error }: FieldRendererProps) {
	const labelStyle = {
		display: "block",
		fontWeight: 500 as const,
		marginBottom: "0.25rem",
		fontSize: "0.875rem",
	};
	const inputStyle = {
		width: "100%",
		padding: "0.5rem",
		border: "1px solid #d1d5db",
		borderRadius: "0.375rem",
		fontSize: "0.875rem",
	};
	const errorStyle = { color: "#dc2626", fontSize: "0.75rem", marginTop: "0.25rem" };

	switch (field.t) {
		case "text":
			return (
				<div>
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
						<input
							type="text"
							value={(value as string) ?? ""}
							onChange={(e) => onChange(e.target.value || undefined)}
							minLength={field.min}
							maxLength={field.max}
							style={inputStyle}
						/>
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);

		case "textarea":
			return (
				<div>
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
						<textarea
							value={(value as string) ?? ""}
							onChange={(e) => onChange(e.target.value || undefined)}
							minLength={field.min}
							maxLength={field.max}
							rows={4}
							style={inputStyle}
						/>
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);

		case "markdown":
			return (
				<div>
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
						<textarea
							value={(value as string) ?? ""}
							onChange={(e) => onChange(e.target.value || undefined)}
							maxLength={field.max}
							rows={6}
							style={{ ...inputStyle, fontFamily: "monospace" }}
							placeholder="Supports Markdown formatting"
						/>
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);

		case "email":
		case "url":
		case "phone": {
			const htmlType = field.t === "phone" ? "tel" : field.t;
			return (
				<div>
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
						<input
							type={htmlType}
							value={(value as string) ?? ""}
							onChange={(e) => onChange(e.target.value || undefined)}
							maxLength={field.max}
							style={inputStyle}
						/>
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);
		}

		case "date":
		case "datetime":
		case "time": {
			const htmlType = field.t === "datetime" ? "datetime-local" : field.t;
			const minIso = resolveBoundAttr(field.min, field.t);
			const maxIso = resolveBoundAttr(field.max, field.t);
			return (
				<div>
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
						<input
							type={htmlType}
							value={(value as string) ?? ""}
							onChange={(e) => onChange(e.target.value || undefined)}
							min={minIso}
							max={maxIso}
							style={inputStyle}
						/>
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);
		}

		case "daterange": {
			const minIso = resolveBoundAttr(field.min, "date");
			const maxIso = resolveBoundAttr(field.max, "date");
			const v = (value as { from?: string; to?: string } | undefined) ?? {};
			const update = (patch: { from?: string; to?: string }) => {
				const next = { from: patch.from ?? v.from ?? "", to: patch.to ?? v.to ?? "" };
				if (!next.from && !next.to) {
					onChange(undefined);
				} else {
					onChange(next);
				}
			};
			return (
				<div>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: label describes the paired from/to inputs */}
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
					</label>
					<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
						<input
							type="date"
							aria-label="From"
							value={v.from ?? ""}
							onChange={(e) => update({ from: e.target.value })}
							min={minIso}
							max={maxIso}
							style={inputStyle}
						/>
						<span style={{ color: "#9ca3af" }}>–</span>
						<input
							type="date"
							aria-label="To"
							value={v.to ?? ""}
							onChange={(e) => update({ to: e.target.value })}
							min={minIso}
							max={maxIso}
							style={inputStyle}
						/>
					</div>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);
		}

		case "bool":
			return (
				<div>
					<label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<input
							type="checkbox"
							checked={(value as boolean) ?? false}
							onChange={(e) => onChange(e.target.checked)}
						/>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);

		case "number":
		case "integer":
			return (
				<div>
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
						<input
							type="number"
							step={field.t === "integer" ? 1 : undefined}
							value={value !== undefined && value !== null ? String(value) : ""}
							onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
							min={field.min}
							max={field.max}
							style={inputStyle}
						/>
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);

		case "fixed":
			return (
				<div>
					<label style={labelStyle}>
						{field.label}
						{field.req && <span style={{ color: "#dc2626" }}> *</span>}
						<select
							value={(value as string) ?? ""}
							onChange={(e) => onChange(e.target.value || undefined)}
							style={inputStyle}
						>
							<option value="">Select...</option>
							{field.opts.map((opt) => (
								<option key={opt.k} value={opt.k}>
									{opt.label ?? opt.k}
								</option>
							))}
						</select>
					</label>
					{error && <p style={errorStyle}>{error}</p>}
				</div>
			);

		case "dynlist":
			return (
				<DynlistField
					field={field}
					value={value as unknown[] | undefined}
					onChange={onChange}
					error={error}
				/>
			);
	}
}

interface DynlistFieldProps {
	field: Extract<DslField, { t: "dynlist" }>;
	value: unknown[] | undefined;
	onChange: (value: unknown) => void;
	error?: string;
}

function DynlistField({ field, value, onChange, error }: DynlistFieldProps) {
	const items = value ?? [];
	const labelStyle = {
		display: "block",
		fontWeight: 500 as const,
		marginBottom: "0.25rem",
		fontSize: "0.875rem",
	};
	const errorStyle = { color: "#dc2626", fontSize: "0.75rem", marginTop: "0.25rem" };

	const addItem = () => {
		if (field.maxItems && items.length >= field.maxItems) return;
		onChange([...items, undefined]);
	};

	const removeItem = (index: number) => {
		const next = items.filter((_, i) => i !== index);
		onChange(next.length > 0 ? next : undefined);
	};

	const updateItem = (index: number, val: unknown) => {
		const next = [...items];
		next[index] = val;
		onChange(next);
	};

	return (
		<div>
			{/* biome-ignore lint/a11y/noLabelWithoutControl: label describes dynamic list, controls rendered per-item */}
			<label style={labelStyle}>
				{field.label}
				{field.req && <span style={{ color: "#dc2626" }}> *</span>}
			</label>
			{items.map((item, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: static list
					key={i}
					style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "start" }}
				>
					<div style={{ flex: 1 }}>
						<FieldRenderer
							field={{ ...field.item, k: `${field.k}_${i}`, label: `Item ${i + 1}` } as DslField}
							value={item}
							onChange={(v) => updateItem(i, v)}
						/>
					</div>
					<button
						type="button"
						onClick={() => removeItem(i)}
						style={{
							padding: "0.5rem",
							border: "1px solid #d1d5db",
							borderRadius: "0.375rem",
							cursor: "pointer",
							background: "none",
							marginTop: "1.25rem",
						}}
					>
						Remove
					</button>
				</div>
			))}
			<button
				type="button"
				onClick={addItem}
				disabled={!!field.maxItems && items.length >= field.maxItems}
				style={{
					padding: "0.25rem 0.75rem",
					border: "1px solid #d1d5db",
					borderRadius: "0.375rem",
					cursor: "pointer",
					background: "none",
					fontSize: "0.875rem",
				}}
			>
				+ Add Item
			</button>
			{error && <p style={errorStyle}>{error}</p>}
		</div>
	);
}
