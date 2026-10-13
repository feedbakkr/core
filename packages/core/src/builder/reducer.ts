// The builder's state: FeedBakkr's schema reducer and its helpers, moved from
// the form-builder route (apps/app/.../configure.form-builder.tsx at 8ae744e)
// unchanged apart from the imports and exports.
import { arrayMove } from "@dnd-kit/sortable";
import type { DslField, FieldType, PreviewConfig, SchemaDslV1 } from "../schema/schema-dsl.js";

export type SchemaAction =
	| { type: "ADD_FIELD"; field: DslField }
	| { type: "REMOVE_FIELD"; index: number }
	| { type: "UPDATE_FIELD"; index: number; field: DslField }
	| { type: "REORDER_FIELDS"; oldIndex: number; newIndex: number }
	| { type: "SET_PREVIEW"; preview: PreviewConfig | undefined }
	| { type: "SET_META"; meta: string | undefined }
	| { type: "LOAD_SCHEMA"; schema: SchemaDslV1 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function toCamelCase(str: string): string {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+(.)/g, (_, c) => c.toUpperCase())
		.replace(/^\d+/, "");
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
	text: "Text",
	textarea: "Textarea",
	markdown: "Markdown",
	email: "Email",
	url: "URL",
	phone: "Phone",
	date: "Date",
	datetime: "Date & Time",
	time: "Time",
	daterange: "Date Range",
	bool: "Boolean",
	number: "Number",
	integer: "Integer",
	fixed: "Fixed Options",
	dynlist: "Dynamic List",
};

export function migratePreviewConfig(preview: unknown): PreviewConfig | undefined {
	if (!preview || typeof preview !== "object") return undefined;
	if ("mode" in preview) return preview as PreviewConfig;
	const old = preview as { enabled?: boolean; fieldKeys?: string[] };
	if (old.enabled === false) return { mode: "none" };
	if (old.fieldKeys && old.fieldKeys.length > 0) {
		return { mode: "custom", fields: old.fieldKeys, separator: " · " };
	}
	return { mode: "auto" };
}

export function cleanPreviewFieldKeys(
	preview: PreviewConfig | undefined,
	removedKey: string,
): PreviewConfig | undefined {
	if (!preview || preview.mode !== "custom") return preview;
	const fields = preview.fields.filter((k) => k !== removedKey);
	const fallbackFields = preview.fallbackFields?.filter((k) => k !== removedKey);
	if (fields.length === 0) return { mode: "auto" };
	return {
		...preview,
		fields,
		fallbackFields: fallbackFields?.length ? fallbackFields : undefined,
	};
}

export function createDefaultField(type: FieldType, key: string, label: string): DslField {
	const base = { k: key, label };
	switch (type) {
		case "text":
			return { ...base, t: "text" };
		case "textarea":
			return { ...base, t: "textarea" };
		case "markdown":
			return { ...base, t: "markdown" };
		case "email":
			return { ...base, t: "email" };
		case "url":
			return { ...base, t: "url" };
		case "phone":
			return { ...base, t: "phone" };
		case "date":
			return { ...base, t: "date" };
		case "datetime":
			return { ...base, t: "datetime" };
		case "time":
			return { ...base, t: "time" };
		case "daterange":
			return { ...base, t: "daterange" };
		case "bool":
			return { ...base, t: "bool" };
		case "number":
			return { ...base, t: "number" };
		case "integer":
			return { ...base, t: "integer" };
		case "fixed":
			return { ...base, t: "fixed", opts: [{ k: "option_1", label: "Option 1" }] };
		case "dynlist":
			return { ...base, t: "dynlist", item: { k: "item", label: "Item", t: "text" } };
	}
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function schemaReducer(state: SchemaDslV1, action: SchemaAction): SchemaDslV1 {
	switch (action.type) {
		case "ADD_FIELD":
			return { ...state, fields: [...state.fields, action.field] };
		case "UPDATE_FIELD":
			return {
				...state,
				fields: state.fields.map((f, i) => (i === action.index ? action.field : f)),
			};
		case "REMOVE_FIELD": {
			const newFields = state.fields.filter((_, i) => i !== action.index);
			const removedKey = state.fields[action.index]?.k;
			const preview = removedKey ? cleanPreviewFieldKeys(state.preview, removedKey) : state.preview;
			return { ...state, fields: newFields, preview };
		}
		case "REORDER_FIELDS":
			return { ...state, fields: arrayMove(state.fields, action.oldIndex, action.newIndex) };
		case "SET_PREVIEW":
			return { ...state, preview: action.preview };
		case "SET_META":
			return { ...state, meta: action.meta };
		case "LOAD_SCHEMA":
			return action.schema;
		default:
			return state;
	}
}
