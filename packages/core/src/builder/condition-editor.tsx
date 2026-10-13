// "Show this field when [field] [is] [value]": a condition (schema v2) as a
// few selects. It edits one comparison; a combined condition (all or any),
// written in the text format, is shown as text and can be replaced.
import type { DslField } from "../schema/schema-dsl.js";
import type { Condition, ConditionValue } from "../schema/schema-dsl-v2.js";
import { conditionToText } from "../text/condition-text.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import { Select } from "./ui/select.js";

type Operator = "eq" | "neq" | "in" | "filled" | "empty";

const OPERATOR_LABELS: Record<Operator, string> = {
	eq: "is",
	neq: "is not",
	in: "is one of",
	filled: "has an answer",
	empty: "has no answer",
};

/** The field a comparison is about: a list's item for lists. */
function target(field: DslField): DslField {
	return field.t === "dynlist" ? (field.item as DslField) : field;
}

function defaultValue(field: DslField): ConditionValue {
	const t = target(field);
	if (t.t === "fixed") return t.opts[0]?.k ?? "";
	if (t.t === "bool") return true;
	if (t.t === "number" || t.t === "integer") return 0;
	return "";
}

function operatorOf(c: Condition): Operator | null {
	if ("all" in c || "any" in c) return null;
	if ("eq" in c) return "eq";
	if ("neq" in c) return "neq";
	if ("in" in c) return "in";
	if ("filled" in c) return "filled";
	return "empty";
}

function build(k: string, op: Operator, values: ConditionValue[]): Condition {
	const first = values[0] ?? "";
	switch (op) {
		case "eq":
			return { k, eq: first };
		case "neq":
			return { k, neq: first };
		case "in":
			return { k, in: values.length > 0 ? values : [first] };
		case "filled":
			return { k, filled: true };
		case "empty":
			return { k, empty: true };
	}
}

function valuesOf(c: Condition): ConditionValue[] {
	if ("eq" in c) return [c.eq];
	if ("neq" in c) return [c.neq];
	if ("in" in c) return c.in;
	return [];
}

export function ConditionEditor({
	value,
	onChange,
	fields,
	subject,
}: {
	value: Condition | undefined;
	onChange: (value: Condition | undefined) => void;
	/** The fields it may name: those before the field or section. */
	fields: DslField[];
	/** "this field" or "this section". */
	subject: string;
}) {
	const candidates = fields.filter((f) => !f.hidden || f.default !== undefined);

	if (candidates.length === 0) {
		return (
			<p className="text-[10px] text-muted-foreground">
				Conditions can depend only on fields above {subject}.
			</p>
		);
	}

	const op = value ? operatorOf(value) : null;
	if (value && op === null) {
		return (
			<div className="space-y-1">
				<Label className="text-xs">Show {subject} when</Label>
				<p className="rounded-md border bg-muted/30 px-2 py-1 font-mono text-xs">
					{conditionToText(value)}
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="text-xs"
					onClick={() => {
						const first = candidates[0] as DslField;
						onChange(build(first.k, "filled", []));
					}}
				>
					Replace with a simple condition
				</Button>
			</div>
		);
	}

	const leaf = value as (Condition & { k: string }) | undefined;
	const field = candidates.find((f) => f.k === leaf?.k) ?? (candidates[0] as DslField);
	const t = target(field);
	const current = leaf ? valuesOf(leaf) : [];
	const setOperator = (next: Operator) =>
		onChange(build(field.k, next, current.length > 0 ? current : [defaultValue(field)]));

	return (
		<div className="space-y-2">
			<div className="space-y-1">
				<Label className="text-xs" htmlFor="fbk-condition-mode">
					Show {subject}
				</Label>
				<Select
					id="fbk-condition-mode"
					value={value ? "when" : "always"}
					onChange={(e) =>
						onChange(
							e.target.value === "when" ? build(field.k, "eq", [defaultValue(field)]) : undefined,
						)
					}
				>
					<option value="always">Always</option>
					<option value="when">Only when…</option>
				</Select>
			</div>
			{leaf && op && (
				<div className="grid grid-cols-3 gap-2">
					<Select
						aria-label="Field"
						value={field.k}
						onChange={(e) => {
							const next = candidates.find((f) => f.k === e.target.value) as DslField;
							onChange(build(next.k, op, [defaultValue(next)]));
						}}
					>
						{candidates.map((f) => (
							<option key={f.k} value={f.k}>
								{f.label}
							</option>
						))}
					</Select>
					<Select
						aria-label="Comparison"
						value={op}
						onChange={(e) => setOperator(e.target.value as Operator)}
					>
						{(Object.keys(OPERATOR_LABELS) as Operator[]).map((o) => (
							<option key={o} value={o}>
								{OPERATOR_LABELS[o]}
							</option>
						))}
					</Select>
					{op === "filled" || op === "empty" ? (
						<span />
					) : t.t === "fixed" && op === "in" ? (
						<fieldset className="col-span-3 flex flex-wrap gap-3">
							<legend className="sr-only">Values</legend>
							{t.opts.map((o) => (
								<label key={o.k} className="flex items-center gap-1 text-xs">
									<input
										type="checkbox"
										checked={current.includes(o.k)}
										onChange={(e) => {
											const next = e.target.checked
												? [...current, o.k]
												: current.filter((v) => v !== o.k);
											if (next.length > 0) onChange(build(field.k, "in", next));
										}}
									/>
									{o.label ?? o.k}
								</label>
							))}
						</fieldset>
					) : t.t === "fixed" ? (
						<Select
							aria-label="Value"
							value={String(current[0] ?? "")}
							onChange={(e) => onChange(build(field.k, op, [e.target.value]))}
						>
							{t.opts.map((o) => (
								<option key={o.k} value={o.k}>
									{o.label ?? o.k}
								</option>
							))}
						</Select>
					) : t.t === "bool" ? (
						<Select
							aria-label="Value"
							value={String(current[0] ?? true)}
							onChange={(e) => onChange(build(field.k, op, [e.target.value === "true"]))}
						>
							<option value="true">Yes</option>
							<option value="false">No</option>
						</Select>
					) : (
						<Input
							aria-label="Value"
							type={t.t === "number" || t.t === "integer" ? "number" : "text"}
							value={op === "in" ? current.join(", ") : String(current[0] ?? "")}
							placeholder={op === "in" ? "a, b, c" : undefined}
							onChange={(e) => {
								const numeric = t.t === "number" || t.t === "integer";
								const parse = (s: string): ConditionValue => (numeric ? Number(s) : s);
								const raw = e.target.value;
								const next =
									op === "in"
										? raw
												.split(",")
												.map((s) => s.trim())
												.filter(Boolean)
												.map(parse)
										: [parse(raw)];
								onChange(build(field.k, op, next));
							}}
						/>
					)}
				</div>
			)}
		</div>
	);
}
