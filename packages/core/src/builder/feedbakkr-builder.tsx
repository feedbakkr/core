// FeedbakkrBuilder: FeedBakkr's form builder without its app. The parts are
// moved from the form-builder route (apps/app/.../configure.form-builder.tsx
// at 8ae744e): everything from EmptySchemaState down is unchanged, except that
// a toast goes through `onNotify`. The top component is new. Where the route
// loaded and saved a channel through FeedBakkr's API, checked permissions and
// blocked navigation, it now takes the schema and callbacks as props, and it
// shows a preview of the form beside the field list.
import type { DragEndEvent } from "@dnd-kit/core";
import {
	closestCenter,
	DndContext,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ArrowLeft,
	Asterisk,
	Braces,
	Check,
	ChevronDown,
	Circle,
	Code2,
	Copy,
	Download,
	EyeOff,
	FileText,
	FileUp,
	GripVertical,
	Info,
	LayoutList,
	Pencil,
	Plus,
	Shield,
	Sparkles,
	Trash2,
} from "lucide-react";
import type { Dispatch } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { generateJsonSchema, generateZodCode } from "../export/index.js";
import type { DslField, FieldType, PreviewConfig, SchemaDslV1 } from "../schema/schema-dsl.js";
import { ALLOWED_SEPARATORS, FIELD_TYPES } from "../schema/schema-dsl.js";
import { isPreviewableType } from "../schema/schema-utils.js";
import { validateSchema } from "../schema/validate-schema.js";
import { schemaToTextDsl } from "../text/index.js";
import { CodePreview } from "./code-preview.js";
import { FieldTypeConfig } from "./field-type-config.js";
import {
	createDefaultField,
	FIELD_TYPE_LABELS,
	migratePreviewConfig,
	type SchemaAction,
	schemaReducer,
	toCamelCase,
} from "./reducer.js";
import {
	buildExportTemplate,
	extractSchemaFromTemplate,
	generateTemplateKey,
	schemaTemplateSchema,
} from "./schema-template.js";
import { SchemaWarningsButton } from "./schema-warnings-button.js";
import { TestFormPanel } from "./test-form-panel.js";
import { Alert, AlertDescription } from "./ui/alert.js";
import { Button } from "./ui/button.js";
import { Checkbox } from "./ui/checkbox.js";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import { Select } from "./ui/select.js";
import { Switch } from "./ui/switch.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.js";
import { Textarea } from "./ui/textarea.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.js";

/** A message for the person using the builder, shown however the host shows them. */
export interface BuilderNotice {
	type: "success" | "info" | "error";
	message: string;
}

export interface FeedbakkrBuilderProps {
	/** The schema being edited. A new value replaces the builder's state. */
	value: SchemaDslV1;
	/** Called with the schema after every edit. */
	onChange?: (schema: SchemaDslV1) => void;
	/**
	 * Saves the schema. The builder checks it with `validateSchema` first, and
	 * shows a Save button only when this is given. A thrown error is shown.
	 */
	onSave?: (schema: SchemaDslV1) => void | Promise<void>;
	/** Shows the fields without editing them. */
	readOnly?: boolean;
	/** Called when the schema starts or stops differing from the last save. */
	onDirtyChange?: (dirty: boolean) => void;
	/** Messages such as "Draft saved.", for the host's toasts. */
	onNotify?: (notice: BuilderNotice) => void;
	/** Names the exported template and its file. Defaults to the schema's title. */
	title?: string;
	/** Goes into the exported template. Defaults to the schema's description. */
	description?: string;
	/** Added to the builder's root element. */
	className?: string;
}

// ─── Preview Settings ────────────────────────────────────────────────────────

const SEPARATOR_LABELS: Record<string, string> = {
	" ": "Space",
	" · ": "Dot ( · )",
	" - ": "Dash ( - )",
	", ": "Comma ( , )",
};

const MODE_LABELS: Record<string, string> = {
	none: "No Preview",
	auto: "Auto-detect",
	custom: "Custom",
};

/** Loads a schema the way the route did: an old preview config is upgraded. */
function loadSchema(schema: SchemaDslV1): SchemaDslV1 {
	return schema.preview ? { ...schema, preview: migratePreviewConfig(schema.preview) } : schema;
}

export function FeedbakkrBuilder({
	value,
	onChange,
	onSave,
	readOnly = false,
	onDirtyChange,
	onNotify,
	title,
	description,
	className,
}: FeedbakkrBuilderProps) {
	const [schema, dispatch] = useReducer(schemaReducer, value, loadSchema);
	const isLocked = readOnly;
	const [previewModalOpen, setPreviewModalOpen] = useState(false);
	const [editFieldIndex, setEditFieldIndex] = useState<number | null>(null);
	const [formMetaOpen, setFormMetaOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	// A new value from the host replaces the state; the host echoing back what
	// onChange gave it does not.
	const schemaJson = JSON.stringify(schema);
	const lastValueJson = useRef(JSON.stringify(value));
	useEffect(() => {
		const json = JSON.stringify(value);
		if (json === lastValueJson.current) return;
		lastValueJson.current = json;
		if (json !== schemaJson) dispatch({ type: "LOAD_SCHEMA", schema: loadSchema(value) });
	}, [value, schemaJson]);

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	useEffect(() => {
		if (schemaJson === lastValueJson.current) return;
		lastValueJson.current = schemaJson;
		onChangeRef.current?.(JSON.parse(schemaJson) as SchemaDslV1);
	}, [schemaJson]);

	// Dirty means different from the last save, or from the first value.
	const [savedJson, setSavedJson] = useState(schemaJson);
	const isDirty = schemaJson !== savedJson;
	const onDirtyChangeRef = useRef(onDirtyChange);
	onDirtyChangeRef.current = onDirtyChange;
	const reportedDirty = useRef(false);
	useEffect(() => {
		if (reportedDirty.current === isDirty) return;
		reportedDirty.current = isDirty;
		onDirtyChangeRef.current?.(isDirty);
	}, [isDirty]);

	const handleSave = useCallback(async () => {
		if (!onSave) return;
		const checked = validateSchema(schema);
		if (!checked.ok) {
			setSaveError(checked.issues.map((i) => i.message).join("; "));
			return;
		}
		setSaving(true);
		setSaveError(null);
		try {
			await onSave(checked.schema);
			setSavedJson(JSON.stringify(schema));
			onNotify?.({ type: "success", message: "Draft saved." });
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Failed to save schema");
		} finally {
			setSaving(false);
		}
	}, [onSave, onNotify, schema]);

	let zodCode = "";
	let jsonSchemaStr = "";
	try {
		zodCode = generateZodCode(schema);
		jsonSchemaStr = JSON.stringify(generateJsonSchema(schema), null, 2);
	} catch {
		// ignore generator errors while editing
	}

	const previewMode = schema.preview?.mode ?? "auto";

	const [exportOpen, setExportOpen] = useState(false);
	const [exportFormat, setExportFormat] = useState<"choose" | "json" | "text">("choose");
	const [exportCopied, setExportCopied] = useState(false);
	const exportTitle = title ?? schema.title ?? "Form";
	const exportDescription = description ?? schema.desc;

	const exportContent = useMemo(() => {
		if (exportFormat === "json") {
			const template = buildExportTemplate(schema, exportTitle, exportDescription);
			return JSON.stringify(template, null, 2);
		}
		if (exportFormat === "text") {
			return schemaToTextDsl(schema);
		}
		return "";
	}, [exportFormat, schema, exportTitle, exportDescription]);

	function handleExportCopy() {
		navigator.clipboard.writeText(exportContent);
		setExportCopied(true);
		setTimeout(() => setExportCopied(false), 2000);
	}

	function handleExportDownload() {
		const isJson = exportFormat === "json";
		const ext = isJson ? "json" : "txt";
		const mime = isJson ? "application/json" : "text/plain";
		const blob = new Blob([exportContent], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${generateTemplateKey(exportTitle)}.${ext}`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function openExportDialog() {
		setExportFormat("choose");
		setExportCopied(false);
		setExportOpen(true);
	}

	const hasFields = schema.fields.length > 0;
	const rootClass = ["fbk-builder", className].filter(Boolean).join(" ");

	if (!hasFields) {
		return (
			<div className={rootClass}>
				{saveError && (
					<Alert variant="destructive" className="mb-4">
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				{isLocked ? (
					<p className="py-8 text-center text-sm text-muted-foreground">No fields yet.</p>
				) : (
					<EmptySchemaState dispatch={dispatch} />
				)}

				{/* Modals still needed even in empty state */}
				<PreviewSettingsModal
					open={previewModalOpen}
					onOpenChange={setPreviewModalOpen}
					schema={schema}
					onSave={(preview) => dispatch({ type: "SET_PREVIEW", preview })}
				/>
			</div>
		);
	}

	return (
		<div className={rootClass}>
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
				<div className="min-w-0">
					{/* Toolbar: save + actions */}
					<div className="mb-4 flex items-center gap-3">
						<div className="flex items-center gap-2 flex-1 min-w-0">
							<span className="text-xs text-muted-foreground">
								{schema.fields.length} {schema.fields.length === 1 ? "field" : "fields"}
							</span>
							{onSave && isDirty && (
								<span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
									<Circle className="h-2 w-2 fill-current" />
									Unsaved changes
								</span>
							)}
							<SchemaWarningsButton schema={schema} />
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 cursor-pointer text-xs"
								onClick={openExportDialog}
							>
								<Download className="h-3 w-3" />
								Export
							</Button>
							{onSave && !isLocked && (
								<Button
									type="button"
									disabled={saving || !isDirty}
									size="sm"
									className="h-7 cursor-pointer disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
									onClick={handleSave}
								>
									{saving ? "Saving..." : "Save Changes"}
								</Button>
							)}
						</div>
					</div>

					{saveError && (
						<Alert variant="destructive" className="mb-4">
							<AlertDescription>{saveError}</AlertDescription>
						</Alert>
					)}

					{/* Field list */}
					<SchemaFieldList
						schema={schema}
						dispatch={dispatch}
						onEditField={isLocked ? undefined : setEditFieldIndex}
						isLocked={isLocked}
						onNotify={onNotify}
					/>

					{/* Advanced — inbox preview, form meta, validation schemas */}
					<AdvancedSection>
						{!isLocked && (
							<InboxPreviewSection
								schema={schema}
								previewMode={previewMode}
								onConfigure={() => setPreviewModalOpen(true)}
								onEnableAuto={() => dispatch({ type: "SET_PREVIEW", preview: { mode: "auto" } })}
							/>
						)}

						{!isLocked && (
							<div className="flex items-center gap-2 rounded-lg border px-3 py-2">
								<Braces className="h-3.5 w-3.5 text-muted-foreground" />
								{schema.meta ? (
									<span className="flex items-center gap-1 text-xs text-muted-foreground">
										Form meta configured
										<Check className="h-3.5 w-3.5 text-green-600" />
									</span>
								) : (
									<span className="text-xs text-muted-foreground">No form meta</span>
								)}
								<button
									type="button"
									className="ml-auto cursor-pointer text-xs text-primary hover:underline"
									onClick={() => setFormMetaOpen(true)}
								>
									{schema.meta ? "Edit meta" : "Add meta"}
								</button>
							</div>
						)}

						<ValidationPanel schema={schema} zodCode={zodCode} jsonSchemaStr={jsonSchemaStr} />
					</AdvancedSection>
				</div>

				{/* Preview: the form as people will see it, checked locally */}
				<section aria-label="Preview" className="min-w-0 rounded-lg border p-4">
					<h3 className="mb-3 text-sm font-semibold">Preview</h3>
					<TestFormPanel schema={schema} />
				</section>
			</div>

			{/* Edit Field Modal */}
			<EditFieldModal
				open={editFieldIndex !== null}
				onOpenChange={(open) => {
					if (!open) setEditFieldIndex(null);
				}}
				field={editFieldIndex !== null ? (schema.fields[editFieldIndex] ?? null) : null}
				onSave={(field) => {
					if (editFieldIndex !== null) {
						dispatch({ type: "UPDATE_FIELD", index: editFieldIndex, field });
						setEditFieldIndex(null);
					}
				}}
			/>

			{/* Preview Settings Modal */}
			<PreviewSettingsModal
				open={previewModalOpen}
				onOpenChange={setPreviewModalOpen}
				schema={schema}
				onSave={(preview) => dispatch({ type: "SET_PREVIEW", preview })}
			/>

			{/* Form Meta dialog */}
			<MetaEditorDialog
				open={formMetaOpen}
				onOpenChange={setFormMetaOpen}
				value={schema.meta ?? ""}
				onSave={(value) => {
					dispatch({ type: "SET_META", meta: value || undefined });
					setFormMetaOpen(false);
				}}
			/>

			{/* Export dialog */}
			<Dialog open={exportOpen} onOpenChange={setExportOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Export Schema</DialogTitle>
					</DialogHeader>

					{exportFormat === "choose" ? (
						<div className="grid gap-3 py-2">
							<button
								type="button"
								className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
								onClick={() => setExportFormat("json")}
							>
								<Braces className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
								<div>
									<p className="text-sm font-medium">JSON Schema</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										Full schema as a JSON template file. Use for importing into other channels or
										sharing with developers.
									</p>
								</div>
							</button>
							<button
								type="button"
								className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
								onClick={() => setExportFormat("text")}
							>
								<FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
								<div>
									<p className="text-sm font-medium">Text DSL</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										Human-readable text format. Easy to read, edit, and use with AI tools to
										generate or modify forms.
									</p>
								</div>
							</button>
						</div>
					) : (
						<>
							<div className="pt-2">
								<pre className="rounded-md border bg-muted/30 p-3 text-xs font-mono max-h-80 overflow-auto whitespace-pre-wrap break-words">
									{exportContent}
								</pre>
							</div>
							<DialogFooter className="flex-row justify-between sm:justify-between">
								<Button
									size="sm"
									variant="ghost"
									className="text-xs"
									onClick={() => setExportFormat("choose")}
								>
									<ArrowLeft className="h-3 w-3" />
									Back
								</Button>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="outline"
										className="text-xs"
										onClick={handleExportCopy}
									>
										{exportCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
										{exportCopied ? "Copied" : "Copy"}
									</Button>
									<Button
										size="sm"
										className="text-xs"
										onClick={() => {
											handleExportDownload();
											setExportOpen(false);
										}}
									>
										<Download className="h-3 w-3" />
										Save as file
									</Button>
								</div>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

// ─── Empty Schema State ──────────────────────────────────────────────────────

function EmptySchemaState({ dispatch }: { dispatch: Dispatch<SchemaAction> }) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [templateError, setTemplateError] = useState<string | null>(null);

	function handleTemplateFile(file: File) {
		setTemplateError(null);
		if (!file.name.endsWith(".json")) {
			setTemplateError("File must be a .json file");
			return;
		}
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				setTemplateError("File is not valid JSON");
				return;
			}
			const result = schemaTemplateSchema.safeParse(parsed);
			if (!result.success) {
				const issues = result.error.issues.slice(0, 3);
				const messages = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
				setTemplateError(`Invalid template: ${messages.join("; ")}`);
				return;
			}
			const schema = extractSchemaFromTemplate(result.data);
			dispatch({ type: "LOAD_SCHEMA", schema });
		};
		reader.readAsText(file);
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		const file = e.dataTransfer.files[0];
		if (file) handleTemplateFile(file);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col items-center px-6 py-8 text-center">
				<div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
					<LayoutList className="h-5 w-5 text-muted-foreground" />
				</div>
				<h3 className="text-base font-semibold">No fields yet</h3>
				<p className="mt-1 max-w-xs text-sm text-muted-foreground">
					Add your first field below, or load one from a template.
				</p>
			</div>
			<AddFieldRow
				existingKeys={[]}
				onAdd={(field) => dispatch({ type: "ADD_FIELD", field })}
				fieldCount={0}
			/>

			<div className="relative flex items-center gap-3">
				<div className="flex-1 border-t" />
				<span className="text-xs text-muted-foreground">or</span>
				<div className="flex-1 border-t" />
			</div>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target */}
			<div
				className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50"
				onDrop={handleDrop}
				onDragOver={(e) => e.preventDefault()}
			>
				<FileUp className="mb-2 h-6 w-6 text-muted-foreground" />
				<p className="text-sm font-medium">Load from Template</p>
				<p className="mt-1 text-xs text-muted-foreground">
					Drop a .template.json file here, or{" "}
					<button
						type="button"
						className="text-primary underline hover:no-underline"
						onClick={() => fileInputRef.current?.click()}
					>
						browse
					</button>
				</p>
				<input
					ref={fileInputRef}
					type="file"
					accept=".json"
					className="hidden"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) handleTemplateFile(file);
					}}
				/>
			</div>

			{templateError && (
				<Alert variant="destructive">
					<AlertDescription>{templateError}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

// ─── Schema Field List ───────────────────────────────────────────────────────

function SchemaFieldList({
	schema,
	dispatch,
	onEditField,
	isLocked,
	onNotify,
}: {
	schema: SchemaDslV1;
	dispatch: Dispatch<SchemaAction>;
	onEditField?: ((index: number) => void) | undefined;
	isLocked?: boolean;
	onNotify?: ((notice: BuilderNotice) => void) | undefined;
}) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
	);

	const fieldIds = useMemo(() => schema.fields.map((f, i) => `${f.k}-${i}`), [schema.fields]);

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = fieldIds.indexOf(active.id as string);
		const newIndex = fieldIds.indexOf(over.id as string);
		if (oldIndex !== -1 && newIndex !== -1) {
			dispatch({ type: "REORDER_FIELDS", oldIndex, newIndex });
		}
	}

	return (
		<div>
			{schema.fields.length > 0 && (
				<div className="rounded-lg border divide-y mb-3">
					{isLocked ? (
						schema.fields.map((field) => (
							<div
								key={field.k}
								className={`flex items-center gap-3 px-4 py-2 ${field.hidden ? "opacity-50" : ""}`}
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-medium text-sm">{field.label}</span>
										{field.req && <Asterisk className="h-3.5 w-3.5 text-destructive shrink-0" />}
										{field.hidden && (
											<EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
										)}
										{field.sensitive === true && (
											<span title="Encrypted at rest">
												<Shield className="h-3.5 w-3.5 text-amber-600 shrink-0" />
											</span>
										)}
									</div>
									<span className="mt-0.5 font-mono text-xs text-muted-foreground">{field.k}</span>
								</div>
								<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
									{FIELD_TYPE_LABELS[field.t] ?? field.t}
								</span>
							</div>
						))
					) : (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}
						>
							<SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
								{schema.fields.map((field, i) => (
									<SortableFieldRow
										key={fieldIds[i]!}
										id={fieldIds[i]!}
										field={field}
										onEdit={() => onEditField?.(i)}
										onDelete={() => {
											const removedKey = schema.fields[i]?.k;
											if (
												removedKey &&
												schema.preview?.mode === "custom" &&
												(schema.preview.fields.includes(removedKey) ||
													schema.preview.fallbackFields?.includes(removedKey))
											) {
												onNotify?.({
													type: "info",
													message:
														"Preview configuration has been updated because a referenced field was removed.",
												});
											}
											dispatch({ type: "REMOVE_FIELD", index: i });
										}}
									/>
								))}
							</SortableContext>
						</DndContext>
					)}
				</div>
			)}

			{!isLocked && (
				<AddFieldRow
					existingKeys={schema.fields.map((f) => f.k)}
					onAdd={(field) => dispatch({ type: "ADD_FIELD", field })}
					fieldCount={schema.fields.length}
				/>
			)}
		</div>
	);
}

// ─── Field Row (card-style, sortable) ────────────────────────────────────────

function SortableFieldRow({
	id,
	field,
	onEdit,
	onDelete,
}: {
	id: string;
	field: DslField;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		zIndex: isDragging ? 10 : undefined,
		position: isDragging ? ("relative" as const) : undefined,
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: container has nested interactive elements, cannot be a button
		<div
			ref={setNodeRef}
			style={style}
			className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${isDragging ? "bg-muted shadow-md" : ""}`}
			onClick={onEdit}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onEdit();
			}}
			role="button"
			tabIndex={0}
		>
			<button
				type="button"
				className="flex shrink-0 items-center justify-center cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
				onClick={(e) => e.stopPropagation()}
				{...attributes}
				{...listeners}
				aria-label={`Reorder ${field.label}`}
			>
				<GripVertical className="h-4 w-4" />
			</button>
			<div className={`min-w-0 flex-1 ${field.hidden ? "opacity-50" : ""}`}>
				<div className="flex items-center gap-2">
					<span className="font-medium text-sm">{field.label}</span>
					{field.req && <Asterisk className="h-3.5 w-3.5 text-destructive shrink-0" />}
					{field.hidden && <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
					{field.sensitive === true && (
						<span title="Encrypted at rest">
							<Shield className="h-3.5 w-3.5 text-amber-600 shrink-0" />
						</span>
					)}
					{field.meta && (
						<span title="Has meta">
							<Braces className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
						</span>
					)}
				</div>
				<span className="mt-0.5 font-mono text-xs text-muted-foreground">{field.k}</span>
			</div>
			<div className="flex items-center gap-1.5 shrink-0">
				<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
					{FIELD_TYPE_LABELS[field.t] ?? field.t}
				</span>
				<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
					aria-label={`Delete ${field.label}`}
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

// ─── Add Field Row ───────────────────────────────────────────────────────────

/** Small "i" icon with a hover/focus tooltip explaining a field, sat next to a label. */
function InfoTooltip({ text }: { text: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label="More information"
					className="text-muted-foreground/60 transition-colors hover:text-foreground"
				>
					<Info className="h-3.5 w-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-xs text-xs font-normal leading-relaxed">
				{text}
			</TooltipContent>
		</Tooltip>
	);
}

function AddFieldRow({
	existingKeys,
	onAdd,
	fieldCount,
}: {
	existingKeys: string[];
	onAdd: (field: DslField) => void;
	fieldCount: number;
}) {
	const [label, setLabel] = useState("");
	const [key, setKey] = useState("");
	const [fieldType, setFieldType] = useState<FieldType>("text");
	const [required, setRequired] = useState(false);
	const keyTouched = useRef(false);

	function handleLabelChange(value: string) {
		setLabel(value);
		if (!keyTouched.current) {
			setKey(toCamelCase(value));
		}
	}

	function handleKeyChange(value: string) {
		const sanitized = value.replace(/[^a-zA-Z0-9_]/g, "");
		setKey(sanitized);
		if (sanitized === "") {
			keyTouched.current = false;
		} else {
			keyTouched.current = true;
		}
	}

	function handleAdd() {
		const trimmedLabel = label.trim();
		const trimmedKey = key.trim();
		if (!trimmedLabel || !trimmedKey) return;
		if (existingKeys.includes(trimmedKey)) return;

		const field = createDefaultField(fieldType, trimmedKey, trimmedLabel);
		if (required) {
			(field as DslField & { req?: boolean }).req = true;
		}
		onAdd(field);

		// Reset
		setLabel("");
		setKey("");
		setFieldType("text");
		setRequired(false);
		keyTouched.current = false;
	}

	const isKeyDuplicate = key.trim() !== "" && existingKeys.includes(key.trim());
	const canAdd = label.trim() !== "" && key.trim() !== "" && !isKeyDuplicate && fieldCount < 25;

	if (fieldCount >= 25) {
		return (
			<p className="text-xs text-muted-foreground text-center py-2">
				Maximum of 25 fields reached.
			</p>
		);
	}

	return (
		<div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
			<div className="mb-2 flex items-center gap-1.5">
				<Sparkles className="h-3.5 w-3.5 text-primary" />
				<h3 className="text-sm font-semibold text-foreground">Add a field</h3>
				<span className="text-xs text-muted-foreground">— give it a label, then click Add</span>
			</div>
			<div className="flex flex-wrap items-end gap-2">
				<div className="min-w-[140px] flex-1 space-y-1">
					<div className="flex items-center gap-1">
						<Label className="text-xs">Label</Label>
						<InfoTooltip text="The human-readable title shown to people filling out the form and in your message inbox — e.g. “Full Name”." />
					</div>
					<Input
						value={label}
						onChange={(e) => handleLabelChange(e.target.value)}
						placeholder="e.g. Full Name"
						className="h-8 text-sm bg-background"
						maxLength={200}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleAdd();
							}
						}}
					/>
				</div>
				<div className="min-w-[120px] flex-1 space-y-1">
					<div className="flex items-center gap-1">
						<Label className="text-xs">Key</Label>
						<InfoTooltip text="A unique identifier for this field, used in the stored data, API, and SDK — e.g. “fullName”. Letters and numbers only, no spaces." />
					</div>
					<Input
						value={key}
						onChange={(e) => handleKeyChange(e.target.value)}
						placeholder="e.g. fullName"
						className={`h-8 text-sm font-mono bg-background ${isKeyDuplicate ? "border-destructive" : ""}`}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleAdd();
							}
						}}
					/>
				</div>
				<div className="min-w-[100px] space-y-1">
					<div className="flex items-center gap-1">
						<Label className="text-xs">Type</Label>
						<InfoTooltip text="The kind of data this field stores (text, number, date, choices, etc.) — it sets the input shown and how the value is validated." />
					</div>
					<Select
						value={fieldType}
						onChange={(e) => setFieldType(e.target.value as FieldType)}
						className="h-8 text-sm bg-background"
					>
						{FIELD_TYPES.map((ft) => (
							<option key={ft} value={ft}>
								{FIELD_TYPE_LABELS[ft]}
							</option>
						))}
					</Select>
				</div>
				<div className="flex items-center gap-1.5 h-8">
					<Checkbox checked={required} onChange={(e) => setRequired(e.target.checked)} />
					<Label className="text-xs">Req</Label>
				</div>
				<Button
					type="button"
					size="sm"
					className="h-8 cursor-pointer disabled:cursor-default"
					onClick={handleAdd}
					disabled={!canAdd}
				>
					<Plus className="h-3 w-3" />
					Add
				</Button>
			</div>
			{isKeyDuplicate && (
				<p className="mt-1 text-xs text-destructive">A field with this key already exists.</p>
			)}
		</div>
	);
}

// ─── Advanced Section ───────────────────────────────────────────────────────

/**
 * Collapsible "Advanced" wrapper that hides the inbox-preview, form-meta and
 * validation-schema panels by default. Most channels are configured purely
 * through the field list, so keeping these out of the way until needed
 * declutters the page.
 */
function AdvancedSection({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="mt-6 rounded-lg border">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<span className="font-medium">Advanced</span>
				<span className="text-xs text-muted-foreground/70">
					Inbox preview · Meta · Validation schemas
				</span>
				<ChevronDown
					className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && <div className="space-y-3 border-t p-3">{children}</div>}
		</div>
	);
}

// ─── Inbox Preview Section ──────────────────────────────────────────────────

function getPreviewSummary(schema: SchemaDslV1): string {
	const mode = schema.preview?.mode;
	if (!mode || mode === "auto") return "Uses the first text field automatically";
	if (mode === "none") return "No preview text will be generated for inbox messages";
	if (mode === "custom" && schema.preview?.mode === "custom") {
		const fieldLabels = schema.preview.fields
			.map((key) => schema.fields.find((f) => f.k === key)?.label ?? key)
			.filter(Boolean);
		if (fieldLabels.length > 0) {
			const sep = schema.preview.separator ?? " · ";
			return fieldLabels.map((l) => `{${l}}`).join(sep.trim() === "" ? " " : sep);
		}
		return "No fields selected";
	}
	return "Auto-detect";
}

function InboxPreviewSection({
	schema,
	previewMode,
	onConfigure,
	onEnableAuto,
}: {
	schema: SchemaDslV1;
	previewMode: string;
	onConfigure: () => void;
	onEnableAuto: () => void;
}) {
	const hasPreview = !!schema.preview;

	if (!hasPreview) {
		return (
			<div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-sm font-medium text-amber-900 dark:text-amber-200">
							Inbox preview not configured
						</p>
						<p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
							Without a preview, messages in the inbox will show "No preview available". Configure a
							preview to show a summary of each submission.
						</p>
					</div>
					<Button
						size="sm"
						variant="outline"
						className="shrink-0 cursor-pointer"
						onClick={onEnableAuto}
					>
						Enable Auto Preview
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-lg border px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-medium">Inbox Preview</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						<span className="font-medium">{MODE_LABELS[previewMode] ?? previewMode}</span>
						{" — "}
						{getPreviewSummary(schema)}
					</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					className="shrink-0 cursor-pointer"
					onClick={onConfigure}
				>
					<Pencil className="h-3 w-3" />
					Configure
				</Button>
			</div>
		</div>
	);
}

// ─── Validation Panel (collapsible) ─────────────────────────────────────────

function ValidationPanel({
	schema,
	zodCode,
	jsonSchemaStr,
}: {
	schema: SchemaDslV1;
	zodCode: string;
	jsonSchemaStr: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded-lg border">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<Code2 className="h-4 w-4 shrink-0" />
				<span className="font-medium">Validation Schemas</span>
				<ChevronDown
					className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<div className="border-t">
					<Tabs defaultValue="json">
						<TabsList className="mx-4 mt-3">
							<TabsTrigger value="json">JSON</TabsTrigger>
							<TabsTrigger value="zod">Zod</TabsTrigger>
							<TabsTrigger value="jsonschema">JSON Schema</TabsTrigger>
						</TabsList>
						<TabsContent value="json" className="px-4 pb-4">
							<CodePreview code={JSON.stringify(schema, null, 2)} />
						</TabsContent>
						<TabsContent value="zod" className="px-4 pb-4">
							<CodePreview code={zodCode} />
						</TabsContent>
						<TabsContent value="jsonschema" className="px-4 pb-4">
							<CodePreview code={jsonSchemaStr} />
						</TabsContent>
					</Tabs>
				</div>
			)}
		</div>
	);
}

// ─── Edit Field Modal ────────────────────────────────────────────────────────

function EditFieldModal({
	open,
	onOpenChange,
	field,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	field: DslField | null;
	onSave: (field: DslField) => void;
}) {
	const [draft, setDraft] = useState<DslField | null>(null);
	const [metaOpen, setMetaOpen] = useState(false);

	// Reset draft when modal opens with a new field
	useEffect(() => {
		if (open && field) {
			setDraft(structuredClone(field));
		}
	}, [open, field]);

	if (!draft) return null;

	const handleTypeChange = (newType: FieldType) => {
		if (newType === draft.t) return;
		setDraft(createDefaultField(newType, draft.k, draft.label));
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit Field</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1">
							<Label className="text-xs">Label</Label>
							<Input
								value={draft.label}
								onChange={(e) => setDraft({ ...draft, label: e.target.value } as DslField)}
								maxLength={200}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs">Key</Label>
							<Input
								value={draft.k}
								onChange={(e) =>
									setDraft({
										...draft,
										k: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
									} as DslField)
								}
								className="font-mono"
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3 items-end">
						<div className="space-y-1">
							<Label className="text-xs">Type</Label>
							<Select
								value={draft.t}
								onChange={(e) => handleTypeChange(e.target.value as FieldType)}
							>
								{FIELD_TYPES.map((ft) => (
									<option key={ft} value={ft}>
										{FIELD_TYPE_LABELS[ft]}
									</option>
								))}
							</Select>
						</div>
						<div className="flex items-center gap-2 pb-1">
							<Switch
								checked={draft.req ?? false}
								disabled={draft.hidden === true}
								onCheckedChange={(checked) =>
									setDraft({ ...draft, req: checked || undefined } as DslField)
								}
							/>
							<Label className="text-xs">Required</Label>
						</div>
					</div>

					{/* Hidden toggle */}
					<div className="flex items-center gap-2">
						<Switch
							checked={draft.hidden ?? false}
							onCheckedChange={(checked) =>
								setDraft({
									...draft,
									hidden: checked || undefined,
									req: checked ? undefined : draft.req,
								} as DslField)
							}
						/>
						<div>
							<Label className="text-xs">Hidden field</Label>
							<p className="text-[10px] text-muted-foreground">
								Not shown in forms. Set by SDK or URL params.
							</p>
						</div>
					</div>

					{/* Sensitive toggle */}
					<div className="flex items-center gap-2">
						<Switch
							checked={draft.sensitive === true}
							onCheckedChange={(checked) =>
								setDraft({ ...draft, sensitive: checked ? true : undefined } as DslField)
							}
						/>
						<div className="flex-1">
							<Label className="text-xs">Sensitive (encrypted)</Label>
							<p className="text-[10px] text-muted-foreground">
								When on, this field's value is encrypted at rest and excluded from the inbox
								preview, exports, and unfiltered insights queries. Off by default.
							</p>
						</div>
					</div>

					<FieldTypeConfig field={draft} onChange={(f) => setDraft(f)} />

					{/* Default value */}
					<DefaultValueInput field={draft} onChange={(f) => setDraft(f)} />

					{/* Meta */}
					<div className="flex items-center justify-between border-t pt-3">
						<div className="flex items-center gap-2">
							<Braces className="h-3.5 w-3.5 text-muted-foreground" />
							{draft.meta ? (
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									Meta configured
									<Check className="h-3.5 w-3.5 text-green-600" />
								</span>
							) : (
								<span className="text-xs text-muted-foreground">No meta</span>
							)}
						</div>
						<button
							type="button"
							className="text-xs text-primary hover:underline"
							onClick={() => setMetaOpen(true)}
						>
							{draft.meta ? "Edit meta" : "Add meta"}
						</button>
					</div>

					<MetaEditorDialog
						open={metaOpen}
						onOpenChange={setMetaOpen}
						value={draft.meta ?? ""}
						onSave={(value) => {
							setDraft({ ...draft, meta: value || undefined } as DslField);
							setMetaOpen(false);
						}}
					/>
				</div>

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button
						onClick={() => {
							onSave(draft);
							onOpenChange(false);
						}}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Meta Editor Dialog ─────────────────────────────────────────────────────

const META_MAX_LENGTH = 4000;

function MetaEditorDialog({
	open,
	onOpenChange,
	value,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	value: string;
	onSave: (value: string) => void;
}) {
	const [draft, setDraft] = useState(value);

	useEffect(() => {
		if (open) setDraft(value);
	}, [open, value]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Field Meta</DialogTitle>
				</DialogHeader>
				<p className="text-xs text-muted-foreground">
					Free-form metadata passed through to consumers via the SDK and API. Not used by the form
					renderer.
				</p>
				<div className="space-y-1 pt-1">
					<Textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value.slice(0, META_MAX_LENGTH))}
						rows={10}
						className="font-mono text-xs"
						placeholder={'e.g. {"helpText": "Enter your full name", "section": "contact"}'}
					/>
					<p className="text-[11px] text-muted-foreground text-right">
						{draft.length} / {META_MAX_LENGTH}
					</p>
				</div>
				<DialogFooter>
					{draft && (
						<Button
							variant="ghost"
							size="sm"
							className="mr-auto text-xs text-destructive hover:text-destructive"
							onClick={() => onSave("")}
						>
							Remove meta
						</Button>
					)}
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button onClick={() => onSave(draft)}>Save</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Preview Settings Modal ──────────────────────────────────────────────────

function PreviewSettingsModal({
	open,
	onOpenChange,
	schema,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	schema: SchemaDslV1;
	onSave: (preview: PreviewConfig | undefined) => void;
}) {
	const previewableFields = schema.fields.filter((f) => isPreviewableType(f.t));
	const initial = schema.preview ?? { mode: "auto" as const };

	const [mode, setMode] = useState<PreviewConfig["mode"]>(initial.mode);
	const [fields, setFields] = useState<string[]>(initial.mode === "custom" ? initial.fields : []);
	const [separator, setSeparator] = useState<string>(
		initial.mode === "custom" ? (initial.separator ?? " · ") : " · ",
	);
	const [prefix, setPrefix] = useState<string>(
		initial.mode === "custom" ? (initial.prefix ?? "") : "",
	);
	const [fallbackFields, setFallbackFields] = useState<string[]>(
		initial.mode === "custom" ? (initial.fallbackFields ?? []) : [],
	);

	function handleOpenChange(next: boolean) {
		if (next) {
			const current = schema.preview ?? { mode: "auto" as const };
			setMode(current.mode);
			setFields(current.mode === "custom" ? current.fields : []);
			setSeparator(current.mode === "custom" ? (current.separator ?? " · ") : " · ");
			setPrefix(current.mode === "custom" ? (current.prefix ?? "") : "");
			setFallbackFields(current.mode === "custom" ? (current.fallbackFields ?? []) : []);
		}
		onOpenChange(next);
	}

	function handleSave() {
		let preview: PreviewConfig | undefined;
		if (mode === "none") preview = { mode: "none" };
		else if (mode === "auto") preview = { mode: "auto" };
		else {
			const trimmedPrefix = prefix.trim();
			preview = {
				mode: "custom",
				fields,
				separator: separator as (typeof ALLOWED_SEPARATORS)[number],
				fallbackFields: fallbackFields.length > 0 ? fallbackFields : undefined,
				...(trimmedPrefix ? { prefix: prefix } : {}),
			};
		}
		onSave(preview);
		onOpenChange(false);
	}

	function toggleField(key: string) {
		setFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
		setFallbackFields((prev) => prev.filter((k) => k !== key));
	}

	function toggleFallback(key: string) {
		setFallbackFields((prev) =>
			prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
		);
	}

	const availableFallback = previewableFields.filter((f) => !fields.includes(f.k));

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Preview Settings</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<Label htmlFor="preview-mode">Mode</Label>
						<Select
							id="preview-mode"
							value={mode}
							onChange={(e) => setMode(e.target.value as PreviewConfig["mode"])}
						>
							<option value="none">No Preview</option>
							<option value="auto">Auto-detect</option>
							<option value="custom">Custom</option>
						</Select>
						<p className="text-xs text-muted-foreground">
							{mode === "none" && "No preview text will be generated for new messages."}
							{mode === "auto" && "Automatically uses the first previewable field value."}
							{mode === "custom" && "Choose which fields to include in the preview."}
						</p>
					</div>

					{mode === "custom" &&
						(previewableFields.length === 0 ? (
							<p className="text-xs text-muted-foreground italic">
								No previewable fields available. Add text, textarea, fixed, or dynlist fields first.
							</p>
						) : (
							<>
								<div className="space-y-2">
									<Label>Preview Fields</Label>
									{previewableFields.map((field) => (
										<label key={field.k} className="flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												checked={fields.includes(field.k)}
												onChange={() => toggleField(field.k)}
												className="rounded border-input"
											/>
											{field.label} <span className="text-muted-foreground">({field.k})</span>
										</label>
									))}
								</div>

								<div className="space-y-2">
									<Label htmlFor="preview-separator">Separator</Label>
									<Select
										id="preview-separator"
										value={separator}
										onChange={(e) => setSeparator(e.target.value)}
									>
										{ALLOWED_SEPARATORS.map((sep) => (
											<option key={sep} value={sep}>
												{SEPARATOR_LABELS[sep] ?? sep}
											</option>
										))}
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="preview-prefix">Prefix</Label>
									<Input
										id="preview-prefix"
										value={prefix}
										onChange={(e) => setPrefix(e.target.value)}
										maxLength={30}
										placeholder={'e.g. "Helpful: "'}
									/>
									<p className="text-xs text-muted-foreground">
										Prepended to the preview text. Only shown when the preview has content, so a
										bare label never appears on its own. Max 30 characters.
									</p>
								</div>

								<div className="space-y-2">
									<Label>Fallback Fields</Label>
									<p className="text-xs text-muted-foreground">
										Used when primary fields produce no content.
									</p>
									{availableFallback.length === 0 ? (
										<p className="text-xs text-muted-foreground italic">
											All previewable fields are already used as preview fields.
										</p>
									) : (
										availableFallback.map((field) => (
											<label key={field.k} className="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													checked={fallbackFields.includes(field.k)}
													onChange={() => toggleFallback(field.k)}
													className="rounded border-input"
												/>
												{field.label} <span className="text-muted-foreground">({field.k})</span>
											</label>
										))
									)}
								</div>
							</>
						))}
				</div>

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button onClick={handleSave}>Save</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Type-appropriate default value editor for a field. */
function DefaultValueInput({
	field,
	onChange,
}: {
	field: DslField;
	onChange: (field: DslField) => void;
}) {
	const dv = field.default;

	function setDefault(val: unknown) {
		onChange({ ...field, default: val === "" || val === undefined ? undefined : val } as DslField);
	}

	return (
		<div className="space-y-1">
			<Label className="text-xs">Default value</Label>
			{field.t === "bool" ? (
				<div className="flex items-center gap-2">
					<Switch checked={dv === true} onCheckedChange={(v) => setDefault(v || undefined)} />
					<span className="text-xs text-muted-foreground">{dv === true ? "true" : "not set"}</span>
				</div>
			) : field.t === "fixed" && "opts" in field ? (
				<Select
					value={typeof dv === "string" ? dv : ""}
					onChange={(e) => setDefault(e.target.value || undefined)}
				>
					<option value="">No default</option>
					{field.opts.map((o) => (
						<option key={o.k} value={o.k}>
							{o.label ?? o.k}
						</option>
					))}
				</Select>
			) : field.t === "number" ? (
				<Input
					type="number"
					value={typeof dv === "number" ? dv : ""}
					onChange={(e) => setDefault(e.target.value === "" ? undefined : Number(e.target.value))}
					placeholder="No default"
					className="h-8 text-sm"
				/>
			) : field.t === "date" ? (
				<Input
					type="date"
					value={typeof dv === "string" ? dv : ""}
					onChange={(e) => setDefault(e.target.value || undefined)}
					className="h-8 text-sm"
				/>
			) : field.t === "dynlist" ? (
				<p className="text-[10px] text-muted-foreground">
					Dynamic list defaults are set via the SDK.
				</p>
			) : (
				<Input
					type="text"
					value={typeof dv === "string" ? dv : ""}
					onChange={(e) => setDefault(e.target.value || undefined)}
					placeholder="No default"
					className="h-8 text-sm"
				/>
			)}
			<p className="text-[10px] text-muted-foreground">
				{field.hidden
					? "Included in submissions unless overridden by SDK."
					: "Pre-fills the form. Users can change it."}
			</p>
		</div>
	);
}
