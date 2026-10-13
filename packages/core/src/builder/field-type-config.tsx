import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DslField, FixedOption } from "../schema/schema-dsl.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";

interface FieldTypeConfigProps {
	field: DslField;
	onChange: (field: DslField) => void;
}

export function FieldTypeConfig({ field, onChange }: FieldTypeConfigProps) {
	switch (field.t) {
		case "text":
		case "textarea":
			return (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<Label className="text-xs">Min Length</Label>
						<Input
							type="number"
							min={0}
							value={field.min ?? ""}
							onChange={(e) =>
								onChange({
									...field,
									min: e.target.value ? Number(e.target.value) : undefined,
								} as DslField)
							}
							className="h-9"
						/>
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Max Length</Label>
						<Input
							type="number"
							min={1}
							value={field.max ?? ""}
							onChange={(e) =>
								onChange({
									...field,
									max: e.target.value ? Number(e.target.value) : undefined,
								} as DslField)
							}
							className="h-9"
						/>
					</div>
				</div>
			);

		case "number":
		case "integer":
			return (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<Label className="text-xs">Min Value</Label>
						<Input
							type="number"
							step={field.t === "integer" ? 1 : undefined}
							value={field.min ?? ""}
							onChange={(e) =>
								onChange({
									...field,
									min: e.target.value ? Number(e.target.value) : undefined,
								})
							}
							className="h-9"
						/>
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Max Value</Label>
						<Input
							type="number"
							step={field.t === "integer" ? 1 : undefined}
							value={field.max ?? ""}
							onChange={(e) =>
								onChange({
									...field,
									max: e.target.value ? Number(e.target.value) : undefined,
								})
							}
							className="h-9"
						/>
					</div>
				</div>
			);

		case "email":
		case "url":
		case "phone":
			return (
				<div className="space-y-1">
					<Label className="text-xs">Max Length</Label>
					<Input
						type="number"
						min={1}
						value={field.max ?? ""}
						onChange={(e) =>
							onChange({
								...field,
								max: e.target.value ? Number(e.target.value) : undefined,
							} as DslField)
						}
						className="h-9"
						placeholder="Default: 320"
					/>
				</div>
			);

		case "date":
		case "datetime":
		case "time":
			return (
				<div className="space-y-2">
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1">
							<Label className="text-xs">Min</Label>
							<Input
								value={field.min ?? ""}
								onChange={(e) =>
									onChange({
										...field,
										min: e.target.value || undefined,
									} as DslField)
								}
								className="h-9 font-mono text-xs"
								placeholder={field.t === "time" ? "HH:MM" : "e.g. today"}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Max</Label>
							<Input
								value={field.max ?? ""}
								onChange={(e) =>
									onChange({
										...field,
										max: e.target.value || undefined,
									} as DslField)
								}
								className="h-9 font-mono text-xs"
								placeholder={field.t === "time" ? "HH:MM" : "e.g. -18y"}
							/>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						{field.t === "time"
							? "Absolute 24-hour time, HH:MM."
							: "Absolute (YYYY-MM-DD) or relative to today: today, +5d, -18y, today+90d."}
					</p>
				</div>
			);

		case "daterange":
			return (
				<div className="space-y-2">
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1">
							<Label className="text-xs">Min</Label>
							<Input
								value={field.min ?? ""}
								onChange={(e) =>
									onChange({ ...field, min: e.target.value || undefined } as DslField)
								}
								className="h-9 font-mono text-xs"
								placeholder="e.g. today"
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Max</Label>
							<Input
								value={field.max ?? ""}
								onChange={(e) =>
									onChange({ ...field, max: e.target.value || undefined } as DslField)
								}
								className="h-9 font-mono text-xs"
								placeholder="e.g. +1y"
							/>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1">
							<Label className="text-xs">Min Span (days)</Label>
							<Input
								type="number"
								min={0}
								value={field.minSpanDays ?? ""}
								onChange={(e) =>
									onChange({
										...field,
										minSpanDays: e.target.value ? Number(e.target.value) : undefined,
									} as DslField)
								}
								className="h-9"
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Max Span (days)</Label>
							<Input
								type="number"
								min={1}
								value={field.maxSpanDays ?? ""}
								onChange={(e) =>
									onChange({
										...field,
										maxSpanDays: e.target.value ? Number(e.target.value) : undefined,
									} as DslField)
								}
								className="h-9"
							/>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						Bounds use the same syntax as date fields. Span rules constrain the number of days
						between the two dates.
					</p>
				</div>
			);

		case "fixed":
			return (
				<FixedOptionsEditor opts={field.opts} onChange={(opts) => onChange({ ...field, opts })} />
			);

		case "dynlist":
			return (
				<div className="space-y-1">
					<Label className="text-xs">Max Items</Label>
					<Input
						type="number"
						min={1}
						max={100}
						value={field.maxItems ?? ""}
						onChange={(e) =>
							onChange({
								...field,
								maxItems: e.target.value ? Number(e.target.value) : undefined,
							})
						}
						className="h-9"
					/>
				</div>
			);

		case "markdown":
			return (
				<div className="space-y-2">
					<div className="space-y-1">
						<Label className="text-xs">Max Length</Label>
						<Input
							type="number"
							min={1}
							value={field.max ?? ""}
							onChange={(e) =>
								onChange({
									...field,
									max: e.target.value ? Number(e.target.value) : undefined,
								} as DslField)
							}
							className="h-9"
							placeholder="Default: 10000"
						/>
					</div>
					<p className="text-xs text-muted-foreground">
						Accepts Markdown text. Supports headings, lists, links, code blocks, tables,
						strikethrough, and task lists. HTML and embedded content are not supported.
					</p>
				</div>
			);

		case "bool":
			return null;
	}
}

function FixedOptionsEditor({
	opts,
	onChange,
}: {
	opts: FixedOption[];
	onChange: (opts: FixedOption[]) => void;
}) {
	const hasExistingOptions = opts.length > 0 && opts.some((o) => o.k.trim().length > 0);
	const [expanded, setExpanded] = useState(!hasExistingOptions);

	const duplicateKeys = new Set<string>();
	const seen = new Set<string>();
	for (const opt of opts) {
		if (opt.k && seen.has(opt.k)) duplicateKeys.add(opt.k);
		if (opt.k) seen.add(opt.k);
	}

	const canAdd = opts.length < 50 && opts.every((o) => o.k.trim().length > 0);

	const updateOpt = (index: number, patch: Partial<FixedOption>) => {
		const next = opts.map((o, i) => (i === index ? { ...o, ...patch } : o));
		onChange(next);
	};

	const removeOpt = (index: number) => {
		const next = opts.filter((_, i) => i !== index);
		onChange(next.length > 0 ? next : [{ k: "" }]);
	};

	const addOpt = () => {
		setExpanded(true);
		onChange([...opts, { k: "" }]);
	};

	const moveOpt = (from: number, to: number) => {
		if (to < 0 || to >= opts.length) return;
		const next = [...opts];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved!);
		onChange(next);
	};

	const filledCount = opts.filter((o) => o.k.trim().length > 0).length;

	return (
		<div className="space-y-2">
			<button
				type="button"
				className="flex items-center gap-1 text-xs font-medium"
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? (
					<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
				) : (
					<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
				)}
				Options
				{filledCount > 0 && (
					<span className="text-muted-foreground font-normal">({filledCount})</span>
				)}
			</button>
			{expanded && (
				<>
					<div className="space-y-1.5">
						{opts.map((opt, i) => {
							const isDuplicate = opt.k && duplicateKeys.has(opt.k);
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: static list
								<div key={i} className="flex items-center gap-1.5">
									<div className="flex flex-col gap-0">
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[10px] leading-none"
											onClick={() => moveOpt(i, i - 1)}
											disabled={i === 0}
										>
											▲
										</button>
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[10px] leading-none"
											onClick={() => moveOpt(i, i + 1)}
											disabled={i === opts.length - 1}
										>
											▼
										</button>
									</div>
									<Input
										value={opt.k}
										onChange={(e) => updateOpt(i, { k: e.target.value })}
										placeholder="Key (required)"
										className={`h-9 font-mono flex-1 ${isDuplicate ? "border-destructive" : ""}`}
									/>
									<Input
										value={opt.label ?? ""}
										onChange={(e) => updateOpt(i, { label: e.target.value || undefined })}
										placeholder="Label (optional)"
										className="h-9 flex-1"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										onClick={() => removeOpt(i)}
										disabled={opts.length <= 1}
									>
										<Trash2 className="h-3 w-3 text-destructive" />
									</Button>
								</div>
							);
						})}
					</div>
					{duplicateKeys.size > 0 && (
						<p className="text-destructive text-xs">
							Duplicate keys: {[...duplicateKeys].join(", ")}
						</p>
					)}
					<Button type="button" variant="outline" size="xs" onClick={addOpt} disabled={!canAdd}>
						<Plus className="h-3 w-3" />
						Add Option
					</Button>
				</>
			)}
		</div>
	);
}
