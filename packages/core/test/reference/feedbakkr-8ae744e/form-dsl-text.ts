/**
 * Feedbakkr Text DSL — a human-readable, LLM-friendly format for defining
 * form schemas. Parses into the standard SchemaDslV1 JSON structure.
 *
 * Format:
 *
 *   @version 1
 *   @title Bug Report
 *   @description Help us fix issues.
 *   @preview auto
 *
 *   title: text "Bug title" required min=3 max=200
 *   severity: fixed "Severity" required default=medium
 *     - low "Low"
 *     - medium "Medium"
 *     - high "High"
 *     - critical "Critical"
 *   description: textarea "What happened?" required min=20 max=2000
 *   steps: dynlist "Steps to reproduce" maxItems=10
 *     item: text "Step" max=500
 *   page_url: text "Page URL" hidden
 *   environment: fixed "Environment" hidden default=production
 *     - production
 *     - staging
 *     - development
 *
 * Rules:
 *   - Lines starting with @ are metadata directives
 *   - Field lines: key: type "label" [flags...] [constraints...]
 *   - Indented lines starting with - are options for fixed fields
 *   - Indented lines starting with item: define dynlist item type
 *   - Flags: required, hidden, sensitive, not-sensitive
 *   - Constraints: min=N, max=N, maxItems=N, default=VALUE, meta="..."
 *   - Blank lines and # comments are ignored
 */

import type { DslField, FixedOption, PreviewConfig, SchemaDslV1 } from "./schema-dsl.js";

export interface TextDslParseResult {
	ok: true;
	schema: SchemaDslV1;
}

export interface TextDslParseError {
	ok: false;
	errors: { line: number; message: string }[];
}

export type TextDslResult = TextDslParseResult | TextDslParseError;

export function parseFormDslText(input: string): TextDslResult {
	const lines = input.split("\n");
	const errors: { line: number; message: string }[] = [];

	let title: string | undefined;
	let desc: string | undefined;
	let meta: string | undefined;
	let preview: PreviewConfig | undefined;
	const fields: DslField[] = [];

	let currentField: DslField | null = null;
	let _currentFieldLine = 0;

	function pushCurrentField() {
		if (currentField) {
			fields.push(currentField);
			currentField = null;
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1;
		const raw = lines[i] ?? "";
		const trimmed = raw.trim();

		// Skip blank lines and comments
		if (!trimmed || trimmed.startsWith("#")) continue;

		// Metadata directives
		if (trimmed.startsWith("@")) {
			pushCurrentField();
			const match = trimmed.match(/^@(\w+)\s*(.*)/);
			if (!match) {
				errors.push({ line: lineNum, message: `Invalid directive: ${trimmed}` });
				continue;
			}
			const directive = match[1] ?? "";
			const value = match[2] ?? "";
			switch (directive) {
				case "version":
					if (value.trim() !== "1") {
						errors.push({ line: lineNum, message: `Unsupported version: ${value.trim()}` });
					}
					break;
				case "title":
					title = value.trim();
					break;
				case "description":
				case "desc":
					desc = value.trim();
					break;
				case "meta":
					meta = value.trim();
					break;
				case "preview":
					preview = parsePreviewDirective(value.trim());
					break;
				default:
					errors.push({ line: lineNum, message: `Unknown directive: @${directive}` });
			}
			continue;
		}

		// Indented lines — options or dynlist item
		if (raw.match(/^\s+/) && currentField) {
			if (trimmed.startsWith("-")) {
				// Option for fixed field
				if (currentField.t !== "fixed") {
					errors.push({ line: lineNum, message: "Options (- ...) only valid for fixed fields" });
					continue;
				}
				const opt = parseOption(trimmed);
				if (opt) {
					(currentField as any).opts.push(opt);
				} else {
					errors.push({ line: lineNum, message: `Invalid option: ${trimmed}` });
				}
			} else if (trimmed.startsWith("item:")) {
				// Dynlist item definition
				if (currentField.t !== "dynlist") {
					errors.push({ line: lineNum, message: "item: only valid inside dynlist fields" });
					continue;
				}
				const itemDef = trimmed.slice(5).trim();
				const itemField = parseFieldLine("_item", itemDef);
				if (itemField) {
					(currentField as any).item = itemField;
				} else {
					errors.push({ line: lineNum, message: `Invalid item definition: ${trimmed}` });
				}
			}
			continue;
		}

		// Field line
		pushCurrentField();
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx < 1) {
			errors.push({
				line: lineNum,
				message: `Expected field definition (key: type "label" ...): ${trimmed}`,
			});
			continue;
		}

		const key = trimmed.slice(0, colonIdx).trim();
		const rest = trimmed.slice(colonIdx + 1).trim();

		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
			errors.push({ line: lineNum, message: `Invalid field key: ${key}` });
			continue;
		}

		const field = parseFieldLine(key, rest);
		if (field) {
			currentField = field;
			_currentFieldLine = lineNum;
		} else {
			errors.push({ line: lineNum, message: `Could not parse field: ${trimmed}` });
		}
	}

	pushCurrentField();

	// Validate fixed fields have at least one option
	for (const f of fields) {
		if (f.t === "fixed" && (!("opts" in f) || (f as any).opts.length === 0)) {
			errors.push({ line: 0, message: `Fixed field "${f.k}" has no options` });
		}
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	const schema: SchemaDslV1 = {
		v: 1,
		fields: fields as any,
	};
	if (title) schema.title = title;
	if (desc) schema.desc = desc;
	if (meta) schema.meta = meta;
	if (preview) schema.preview = preview;

	return { ok: true, schema };
}

// ─── Field line parser ─────────────────────────────────────────────────────

function parseFieldLine(key: string, rest: string): DslField | null {
	// Extract type (first word)
	const typeMatch = rest.match(/^(\w+)\s*/);
	if (!typeMatch?.[1]) return null;

	const fieldType: string = typeMatch[1];
	let remaining = rest.slice(typeMatch[0]?.length ?? 0);

	// Extract label (quoted string)
	let label = key; // fallback to key if no label
	const labelMatch = remaining.match(/^"([^"]*?)"\s*/);
	if (labelMatch?.[1] !== undefined) {
		label = labelMatch[1];
		remaining = remaining.slice(labelMatch[0]?.length ?? 0);
	}

	// Extract meta="..." (quoted value that may contain spaces) before tokenising
	let meta: string | undefined;
	const metaMatch = remaining.match(/meta="([^"]*)"/);
	if (metaMatch) {
		meta = metaMatch[1];
		remaining = remaining.replace(metaMatch[0], "").trim();
	}

	// Extract quoted bound expressions (min="today+5d", max="-18y"). Must run
	// before the token split because relative expressions contain no spaces but
	// the surrounding quotes make intent explicit.
	let quotedMin: string | undefined;
	let quotedMax: string | undefined;
	const quotedMinMatch = remaining.match(/min="([^"]*)"/);
	if (quotedMinMatch) {
		quotedMin = quotedMinMatch[1];
		remaining = remaining.replace(quotedMinMatch[0], "").trim();
	}
	const quotedMaxMatch = remaining.match(/max="([^"]*)"/);
	if (quotedMaxMatch) {
		quotedMax = quotedMaxMatch[1];
		remaining = remaining.replace(quotedMaxMatch[0], "").trim();
	}

	// Parse flags and constraints from remaining tokens
	const tokens = remaining.split(/\s+/).filter(Boolean);
	let req: boolean | undefined;
	let hidden: boolean | undefined;
	let sensitive: boolean | undefined;
	let defaultVal: unknown;
	let minNum: number | undefined;
	let maxNum: number | undefined;
	let minBound: string | undefined;
	let maxBound: string | undefined;
	let maxItems: number | undefined;
	let minSpanDays: number | undefined;
	let maxSpanDays: number | undefined;

	for (const token of tokens) {
		if (token === "required") {
			req = true;
		} else if (token === "hidden") {
			hidden = true;
		} else if (token === "sensitive") {
			sensitive = true;
		} else if (token === "not-sensitive") {
			sensitive = false;
		} else if (token.startsWith("default=")) {
			defaultVal = parseDefaultValue(token.slice(8), fieldType);
		} else if (token.startsWith("min=")) {
			const v = token.slice(4);
			const n = Number(v);
			if (!Number.isNaN(n)) minNum = n;
			else minBound = v;
		} else if (token.startsWith("max=")) {
			const v = token.slice(4);
			const n = Number(v);
			if (!Number.isNaN(n)) maxNum = n;
			else maxBound = v;
		} else if (token.startsWith("maxItems=")) {
			maxItems = Number(token.slice(9));
		} else if (token.startsWith("minSpan=")) {
			minSpanDays = parseDaysToken(token.slice(8));
		} else if (token.startsWith("maxSpan=")) {
			maxSpanDays = parseDaysToken(token.slice(8));
		}
	}

	// Quoted bounds override unquoted — they're the canonical form for strings.
	if (quotedMin !== undefined) minBound = quotedMin;
	if (quotedMax !== undefined) maxBound = quotedMax;

	const base: Record<string, unknown> = { k: key, label, t: fieldType };
	if (req) base.req = true;
	if (hidden) base.hidden = true;
	if (sensitive !== undefined) base.sensitive = sensitive;
	if (defaultVal !== undefined) base.default = defaultVal;
	if (meta) base.meta = meta;

	switch (fieldType) {
		case "text":
		case "textarea":
			if (minNum !== undefined) base.min = minNum;
			if (maxNum !== undefined) base.max = maxNum;
			return base as DslField;
		case "markdown":
		case "email":
		case "url":
		case "phone":
			if (maxNum !== undefined) base.max = maxNum;
			return base as DslField;
		case "number":
		case "integer":
			if (minNum !== undefined) base.min = minNum;
			if (maxNum !== undefined) base.max = maxNum;
			return base as DslField;
		case "bool":
			return base as DslField;
		case "date":
		case "datetime":
		case "time":
			if (minBound !== undefined) base.min = minBound;
			if (maxBound !== undefined) base.max = maxBound;
			return base as DslField;
		case "daterange":
			if (minBound !== undefined) base.min = minBound;
			if (maxBound !== undefined) base.max = maxBound;
			if (minSpanDays !== undefined) base.minSpanDays = minSpanDays;
			if (maxSpanDays !== undefined) base.maxSpanDays = maxSpanDays;
			return base as DslField;
		case "fixed":
			base.opts = [];
			return base as DslField;
		case "dynlist":
			base.item = { k: "item", label: "Item", t: "text" };
			if (maxItems !== undefined) base.maxItems = maxItems;
			return base as DslField;
		default:
			return null;
	}
}

/** Accept bare number `7` or `Nd` (days) — both mean "N days". */
function parseDaysToken(raw: string): number | undefined {
	const m = raw.match(/^(\d+)d?$/);
	if (!m) return undefined;
	return Number(m[1]);
}

function parseOption(line: string): FixedOption | null {
	// - key "Label"  OR  - key  OR  - "Label"
	const trimmed = line.replace(/^-\s*/, "");
	if (!trimmed) return null;

	const quotedMatch = trimmed.match(/^(\w+)\s+"([^"]*)"$/);
	if (quotedMatch?.[1]) {
		return { k: quotedMatch[1], label: quotedMatch[2] ?? quotedMatch[1] };
	}

	const keyOnlyMatch = trimmed.match(/^(\w+)$/);
	if (keyOnlyMatch?.[1]) {
		return { k: keyOnlyMatch[1] };
	}

	// Just a quoted label — use as both key and label
	const labelOnly = trimmed.match(/^"([^"]*)"$/);
	if (labelOnly?.[1]) {
		const k = labelOnly[1]
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_|_$/g, "");
		return { k, label: labelOnly[1] };
	}

	return null;
}

function parseDefaultValue(raw: string, fieldType: string): unknown {
	if (fieldType === "number") {
		const n = Number(raw);
		return Number.isNaN(n) ? raw : n;
	}
	if (fieldType === "bool") {
		return raw === "true";
	}
	// For text, fixed, date — return as string
	return raw;
}

function parsePreviewDirective(value: string): PreviewConfig {
	if (value === "none") return { mode: "none" };
	if (value === "auto" || !value) return { mode: "auto" };

	// custom: field1, field2 separator=" · " prefix="Label: "
	const fieldsMatch = value.match(/^([\w,\s]+)/);
	if (fieldsMatch?.[1]) {
		const fieldKeys = fieldsMatch[1]
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const sepMatch = value.match(/separator="([^"]*)"/);
		const prefixMatch = value.match(/prefix="([^"]*)"/);
		return {
			mode: "custom",
			fields: fieldKeys,
			separator: (sepMatch?.[1] as any) ?? " · ",
			maxLength: 100,
			...(prefixMatch?.[1] ? { prefix: prefixMatch[1] } : {}),
		};
	}

	return { mode: "auto" };
}

// ─── Serializer (schema → text DSL) ────────────────────────────────────────

export function schemaToTextDsl(schema: SchemaDslV1): string {
	const lines: string[] = [];

	lines.push("@version 1");
	if (schema.title) lines.push(`@title ${schema.title}`);
	if (schema.desc) lines.push(`@description ${schema.desc}`);
	if (schema.meta) lines.push(`@meta ${schema.meta}`);
	if (schema.preview) {
		if (schema.preview.mode === "none") lines.push("@preview none");
		else if (schema.preview.mode === "auto") lines.push("@preview auto");
		else if (schema.preview.mode === "custom") {
			const sep = schema.preview.separator ? ` separator="${schema.preview.separator}"` : "";
			const prefix = schema.preview.prefix
				? ` prefix="${schema.preview.prefix.replace(/"/g, '\\"')}"`
				: "";
			lines.push(`@preview ${schema.preview.fields.join(", ")}${sep}${prefix}`);
		}
	}
	lines.push("");

	for (const field of schema.fields) {
		let line = `${field.k}: ${field.t} "${field.label}"`;
		if (field.req) line += " required";
		if (field.hidden) line += " hidden";
		if (field.sensitive === true) line += " sensitive";
		else if (field.sensitive === false) line += " not-sensitive";
		if (field.default !== undefined && field.default !== null) {
			line += ` default=${String(field.default)}`;
		}
		if (field.meta) {
			line += ` meta="${field.meta.replace(/"/g, '\\"')}"`;
		}

		// Type-specific constraints
		if (
			(field.t === "text" || field.t === "textarea") &&
			"min" in field &&
			field.min !== undefined
		) {
			line += ` min=${field.min}`;
		}
		if (
			(field.t === "text" ||
				field.t === "textarea" ||
				field.t === "markdown" ||
				field.t === "email" ||
				field.t === "url" ||
				field.t === "phone") &&
			"max" in field &&
			field.max !== undefined
		) {
			line += ` max=${field.max}`;
		}
		if (field.t === "number" || field.t === "integer") {
			if ("min" in field && field.min !== undefined) line += ` min=${field.min}`;
			if ("max" in field && field.max !== undefined) line += ` max=${field.max}`;
		}
		if (field.t === "date" || field.t === "datetime" || field.t === "time") {
			if ("min" in field && field.min !== undefined) line += ` min="${field.min}"`;
			if ("max" in field && field.max !== undefined) line += ` max="${field.max}"`;
		}
		if (field.t === "daterange") {
			if ("min" in field && field.min !== undefined) line += ` min="${field.min}"`;
			if ("max" in field && field.max !== undefined) line += ` max="${field.max}"`;
			if ("minSpanDays" in field && field.minSpanDays !== undefined) {
				line += ` minSpan=${field.minSpanDays}d`;
			}
			if ("maxSpanDays" in field && field.maxSpanDays !== undefined) {
				line += ` maxSpan=${field.maxSpanDays}d`;
			}
		}
		if (field.t === "dynlist" && "maxItems" in field && field.maxItems !== undefined) {
			line += ` maxItems=${field.maxItems}`;
		}

		lines.push(line);

		// Options for fixed fields
		if (field.t === "fixed" && "opts" in field) {
			for (const opt of field.opts) {
				if (opt.label && opt.label !== opt.k) {
					lines.push(`  - ${opt.k} "${opt.label}"`);
				} else {
					lines.push(`  - ${opt.k}`);
				}
			}
		}

		// Dynlist item
		if (field.t === "dynlist" && "item" in field) {
			const item = field.item as any;
			let itemLine = `  item: ${item.t} "${item.label}"`;
			if (item.max !== undefined) itemLine += ` max=${item.max}`;
			if (item.min !== undefined) itemLine += ` min=${item.min}`;
			lines.push(itemLine);
		}
	}

	return lines.join("\n");
}
