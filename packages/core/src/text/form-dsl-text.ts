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
 *     item step: text "Step" required max=500
 *   page_url: text "Page URL" hidden
 *   environment: fixed "Environment" hidden default=production
 *     - production
 *     - staging
 *     - development
 *
 * Rules:
 *   - Lines starting with @ are metadata directives
 *   - Field lines: key: type "label" [flags...] [constraints...]
 *   - Indented lines starting with - are options for fixed fields, or for a
 *     dynlist's fixed item
 *   - Indented `item key:` (or `item:`) lines define a dynlist's item, with the
 *     same syntax as a field line
 *   - Flags: required, optional (an explicit req: false), hidden, sensitive,
 *     not-sensitive
 *   - Constraints: min=N, max=N, maxItems=N, default=VALUE, meta="..."
 *   - Quoted strings may contain \" and \\; defaults that are lists or
 *     objects are written as JSON (default=["a","b"])
 *   - @preview a, b separator=" · " maxLength=100 fallback=c,d prefix="..."
 *   - Blank lines and # comments are ignored
 *
 * Schema v2 (`@version 2`) adds:
 *   - help="..." and placeholder="..." on a field line
 *   - reply-to on an email field line: replies go to this address
 *   - `when <condition>` at the end of a field line (see condition-text.ts)
 *   - `@section id "Title" desc="..." when <condition>`: the fields that
 *     follow belong to that section, up to the next @section
 *
 * Changed from FeedBakkr (8ae744e) so every schema round-trips exactly; each
 * change is listed and tested in test/intentional-differences.test.ts.
 */

import type { DslField, FixedOption, PreviewConfig, SchemaDslV1 } from "../schema/schema-dsl.js";
import type {
	Condition,
	DslFieldV2,
	SchemaDsl,
	SchemaDslV2,
	SchemaSection,
} from "../schema/schema-dsl-v2.js";
import { conditionToText, parseCondition } from "./condition-text.js";

export interface TextDslParseResult {
	ok: true;
	/** A v1 schema, or v2 when the text says `@version 2`. */
	schema: SchemaDsl;
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
	let version = 1;
	/** The line of the first v2 feature, to report it in a v1 text. */
	let firstV2Line = 0;
	const sections: SchemaSection[] = [];
	const fields: DslField[] = [];
	const noteV2 = (line: number) => {
		if (!firstV2Line) firstV2Line = line;
	};

	let currentField: DslField | null = null;
	let _currentFieldLine = 0;

	function pushCurrentField() {
		if (currentField) {
			fields.push(currentField);
			sections.at(-1)?.fields.push(currentField.k);
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
					if (value.trim() === "1" || value.trim() === "2") {
						version = Number(value.trim());
					} else {
						errors.push({ line: lineNum, message: `Unsupported version: ${value.trim()}` });
					}
					break;
				case "section": {
					noteV2(lineNum);
					if (fields.length > 0 && sections.length === 0) {
						errors.push({
							line: lineNum,
							message:
								"With sections, every field must be in one: put a @section before the first field",
						});
					}
					try {
						sections.push(parseSectionDirective(value));
					} catch (err) {
						errors.push({ line: lineNum, message: `Invalid section: ${(err as Error).message}` });
					}
					break;
				}
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
			const field = currentField as DslField;
			const itemMatch = trimmed.match(/^item(?:\s+([a-zA-Z_][a-zA-Z0-9_]*))?\s*:/);
			if (trimmed.startsWith("-")) {
				// Option for a fixed field, or for a dynlist whose item is fixed
				const target =
					field.t === "fixed"
						? field
						: field.t === "dynlist" && field.item.t === "fixed"
							? field.item
							: null;
				if (!target) {
					errors.push({ line: lineNum, message: "Options (- ...) only valid for fixed fields" });
					continue;
				}
				const opt = parseOption(trimmed);
				if (opt) {
					target.opts.push(opt);
				} else {
					errors.push({ line: lineNum, message: `Invalid option: ${trimmed}` });
				}
			} else if (itemMatch) {
				// Dynlist item definition
				if (field.t !== "dynlist") {
					errors.push({ line: lineNum, message: "item: only valid inside dynlist fields" });
					continue;
				}
				const itemDef = trimmed.slice(itemMatch[0].length).trim();
				let itemField: DslFieldV2 | null = null;
				try {
					itemField = parseFieldLine(itemMatch[1] ?? "_item", itemDef);
				} catch (err) {
					errors.push({ line: lineNum, message: (err as Error).message });
					continue;
				}
				if (
					itemField &&
					(itemField.when || itemField.help || itemField.placeholder || itemField.replyTo)
				) {
					errors.push({
						line: lineNum,
						message: "A list's item takes no when, help, placeholder or reply-to",
					});
				} else if (itemField) {
					(field as any).item = itemField;
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

		let field: DslFieldV2 | null = null;
		try {
			field = parseFieldLine(key, rest);
		} catch (err) {
			errors.push({ line: lineNum, message: (err as Error).message });
			continue;
		}
		if (field && (field.when || field.help || field.placeholder || field.replyTo)) noteV2(lineNum);
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
		if (f.t === "dynlist" && f.item.t === "fixed" && f.item.opts.length === 0) {
			errors.push({ line: 0, message: `Fixed item of dynlist "${f.k}" has no options` });
		}
	}

	if (firstV2Line && version !== 2) {
		errors.push({
			line: firstV2Line,
			message: "Conditions, sections, help, placeholder and reply-to need @version 2",
		});
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	const schema = { v: version, fields } as SchemaDslV1 | SchemaDslV2;
	if (title) schema.title = title;
	if (desc) schema.desc = desc;
	if (meta) schema.meta = meta;
	if (sections.length > 0) (schema as SchemaDslV2).sections = sections;
	if (preview) schema.preview = preview;

	return { ok: true, schema };
}

// ─── Tokens and quoting ────────────────────────────────────────────────────

/**
 * Split on whitespace, keeping a "quoted string" (with \" and \\ escapes) and
 * a JSON value after `=` ([...] or {...}) inside one token.
 */
function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let i = 0;
	while (i < input.length) {
		const ch = input[i] as string;
		if (/\s/.test(ch)) {
			if (current) tokens.push(current);
			current = "";
			i++;
		} else if (ch === '"') {
			const end = quotedEnd(input, i);
			current += input.slice(i, end);
			i = end;
		} else if ((ch === "[" || ch === "{") && (current === "" || current.endsWith("="))) {
			const end = bracketEnd(input, i);
			current += input.slice(i, end);
			i = end;
		} else {
			current += ch;
			i++;
		}
	}
	if (current) tokens.push(current);
	return tokens;
}

function quotedEnd(s: string, start: number): number {
	let i = start + 1;
	while (i < s.length) {
		if (s[i] === "\\") i += 2;
		else if (s[i] === '"') return i + 1;
		else i++;
	}
	return s.length;
}

function bracketEnd(s: string, start: number): number {
	let depth = 0;
	let i = start;
	while (i < s.length) {
		const ch = s[i];
		if (ch === '"') {
			i = quotedEnd(s, i);
			continue;
		}
		if (ch === "[" || ch === "{") depth++;
		if (ch === "]" || ch === "}") depth--;
		i++;
		if (depth === 0) return i;
	}
	return s.length;
}

function isQuoted(token: string): boolean {
	return token.length >= 2 && token.startsWith('"') && token.endsWith('"');
}

function unquote(token: string): string {
	if (!isQuoted(token)) return token;
	return token.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ─── Field line parser ─────────────────────────────────────────────────────

/** Splits `... when <condition>` at the first `when` outside quotes. */
function splitWhen(text: string): [string, string | undefined] {
	let inQuote = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === "\\" && inQuote) {
			i++;
			continue;
		}
		if (ch === '"') inQuote = !inQuote;
		if (
			!inQuote &&
			text.startsWith("when", i) &&
			(i === 0 || /\s/.test(text[i - 1] as string)) &&
			(i + 4 === text.length || /\s/.test(text[i + 4] as string))
		) {
			return [text.slice(0, i).trim(), text.slice(i + 4).trim()];
		}
	}
	return [text, undefined];
}

function parseWhen(text: string): Condition {
	try {
		return parseCondition(text);
	} catch (err) {
		throw new Error(`Invalid condition "${text}": ${(err as Error).message}`);
	}
}

function parseSectionDirective(value: string): SchemaSection {
	const [head, whenText] = splitWhen(value.trim());
	const tokens = tokenize(head);
	const id = tokens.shift();
	if (!id || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) throw new Error("expected an id");
	// The title is optional: an untitled section is numbered by its place.
	const section: SchemaSection = { id, fields: [] };
	if (tokens[0] !== undefined && isQuoted(tokens[0])) {
		section.title = unquote(tokens.shift() as string);
	}
	for (const token of tokens) {
		if (token.startsWith("desc=")) section.desc = unquote(token.slice(5));
		else throw new Error(`unexpected ${token}`);
	}
	if (whenText !== undefined) section.when = parseWhen(whenText);
	return section;
}

function parseFieldLine(key: string, line: string): DslFieldV2 | null {
	const [rest, whenText] = splitWhen(line);
	const tokens = tokenize(rest);

	// Type (first word)
	const fieldType = tokens.shift();
	if (!fieldType || !/^\w+$/.test(fieldType)) return null;

	// Label (quoted string straight after the type); falls back to the key
	let label = key;
	if (tokens[0] !== undefined && isQuoted(tokens[0])) {
		label = unquote(tokens.shift() as string);
	}

	let req: boolean | undefined;
	let hidden: boolean | undefined;
	let sensitive: boolean | undefined;
	let defaultVal: unknown;
	let meta: string | undefined;
	let minNum: number | undefined;
	let maxNum: number | undefined;
	let minBound: string | undefined;
	let maxBound: string | undefined;
	let maxItems: number | undefined;
	let minSpanDays: number | undefined;
	let maxSpanDays: number | undefined;
	let help: string | undefined;
	let placeholder: string | undefined;
	let replyTo = false;

	for (const token of tokens) {
		if (token === "reply-to") {
			replyTo = true;
			continue;
		}
		if (token === "required") {
			req = true;
			continue;
		}
		if (token === "optional") {
			req = false;
			continue;
		}
		if (token === "hidden") {
			hidden = true;
			continue;
		}
		if (token === "sensitive") {
			sensitive = true;
			continue;
		}
		if (token === "not-sensitive") {
			sensitive = false;
			continue;
		}
		const eq = token.indexOf("=");
		if (eq < 1) continue;
		const name = token.slice(0, eq);
		const raw = token.slice(eq + 1);
		const quoted = isQuoted(raw);
		const value = unquote(raw);
		switch (name) {
			case "default":
				defaultVal = parseDefaultValue(value, fieldType, quoted);
				break;
			case "meta":
				meta = value;
				break;
			case "help":
				help = value;
				break;
			case "placeholder":
				placeholder = value;
				break;
			// A quoted bound is always a string (min="today+5d"); an unquoted one
			// is a number when it reads as one.
			case "min":
				if (!quoted && !Number.isNaN(Number(value))) minNum = Number(value);
				else minBound = value;
				break;
			case "max":
				if (!quoted && !Number.isNaN(Number(value))) maxNum = Number(value);
				else maxBound = value;
				break;
			case "maxItems":
				maxItems = Number(value);
				break;
			case "minSpan":
				minSpanDays = parseDaysToken(value);
				break;
			case "maxSpan":
				maxSpanDays = parseDaysToken(value);
				break;
		}
	}

	const base: Record<string, unknown> = { k: key, label, t: fieldType };
	if (req !== undefined) base.req = req;
	if (hidden) base.hidden = true;
	if (sensitive !== undefined) base.sensitive = sensitive;
	if (defaultVal !== undefined) base.default = defaultVal;
	if (meta) base.meta = meta;
	if (help !== undefined) base.help = help;
	if (placeholder !== undefined) base.placeholder = placeholder;
	if (replyTo) base.replyTo = true;
	if (whenText !== undefined) base.when = parseWhen(whenText);

	switch (fieldType) {
		case "text":
		case "textarea":
			if (minNum !== undefined) base.min = minNum;
			if (maxNum !== undefined) base.max = maxNum;
			return base as DslFieldV2;
		case "markdown":
		case "email":
		case "url":
		case "phone":
			if (maxNum !== undefined) base.max = maxNum;
			return base as DslFieldV2;
		case "number":
		case "integer":
			if (minNum !== undefined) base.min = minNum;
			if (maxNum !== undefined) base.max = maxNum;
			return base as DslFieldV2;
		case "bool":
			return base as DslFieldV2;
		case "date":
		case "datetime":
		case "time":
			if (minBound !== undefined) base.min = minBound;
			if (maxBound !== undefined) base.max = maxBound;
			return base as DslFieldV2;
		case "daterange":
			if (minBound !== undefined) base.min = minBound;
			if (maxBound !== undefined) base.max = maxBound;
			if (minSpanDays !== undefined) base.minSpanDays = minSpanDays;
			if (maxSpanDays !== undefined) base.maxSpanDays = maxSpanDays;
			return base as DslFieldV2;
		case "fixed":
			base.opts = [];
			return base as DslFieldV2;
		case "dynlist":
			base.item = { k: "item", label: "Item", t: "text" };
			if (maxItems !== undefined) base.maxItems = maxItems;
			return base as DslFieldV2;
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
	const tokens = tokenize(line.replace(/^-\s*/, ""));
	const [first, second] = tokens;
	if (first === undefined || tokens.length > 2) return null;

	if (!isQuoted(first)) {
		if (second === undefined) return { k: first };
		if (isQuoted(second)) return { k: first, label: unquote(second) };
		return null;
	}

	// Just a quoted label — use as both key and label
	const label = unquote(first);
	if (second !== undefined || !label) return null;
	const k = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_|_$/g, "");
	return { k, label };
}

function parseDefaultValue(raw: string, fieldType: string, quoted: boolean): unknown {
	if (!quoted && (raw.startsWith("[") || raw.startsWith("{"))) {
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	}
	if (!quoted && (fieldType === "number" || fieldType === "integer")) {
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
	const tokens = tokenize(value);

	// The field list runs up to the first name=value token.
	const listParts: string[] = [];
	while (tokens[0] !== undefined && !tokens[0].includes("=")) {
		listParts.push(tokens.shift() as string);
	}
	const settings = new Map<string, string>();
	for (const token of tokens) {
		const eq = token.indexOf("=");
		settings.set(token.slice(0, eq), unquote(token.slice(eq + 1)));
	}
	const maxLength = settings.has("maxLength") ? Number(settings.get("maxLength")) : undefined;

	const list = listParts.join(" ");
	if (list === "auto" || !list) {
		return maxLength === undefined ? { mode: "auto" } : { mode: "auto", maxLength };
	}

	const config: PreviewConfig = { mode: "custom", fields: splitList(list) };
	const separator = settings.get("separator");
	if (separator !== undefined) config.separator = separator as typeof config.separator;
	if (maxLength !== undefined) config.maxLength = maxLength;
	const fallback = settings.get("fallback");
	if (fallback !== undefined) config.fallbackFields = splitList(fallback);
	const prefix = settings.get("prefix");
	if (prefix) config.prefix = prefix;
	return config;
}

function splitList(list: string): string[] {
	return list
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

// ─── Serializer (schema → text DSL) ────────────────────────────────────────

export function schemaToTextDsl(schema: SchemaDsl): string {
	const lines: string[] = [];
	const sectionStarts = new Map<string, SchemaSection>();
	if (schema.v === 2) {
		for (const section of schema.sections ?? []) {
			const first = section.fields[0];
			if (first !== undefined) sectionStarts.set(first, section);
		}
	}

	lines.push(`@version ${schema.v}`);
	if (schema.title) lines.push(`@title ${schema.title}`);
	if (schema.desc) lines.push(`@description ${schema.desc}`);
	if (schema.meta) lines.push(`@meta ${schema.meta}`);
	if (schema.preview) lines.push(`@preview ${previewToText(schema.preview)}`);
	lines.push("");

	for (const field of schema.fields as DslFieldV2[]) {
		const section = sectionStarts.get(field.k);
		if (section) lines.push(sectionToLine(section));
		lines.push(fieldToLine(`${field.k}:`, field));

		if (field.t === "fixed") {
			for (const opt of field.opts) lines.push(optionToLine("  ", opt));
		}

		if (field.t === "dynlist") {
			const item = field.item as DslField;
			const head = item.k === "_item" ? "  item:" : `  item ${item.k}:`;
			lines.push(fieldToLine(head, item));
			if (item.t === "fixed") {
				for (const opt of item.opts) lines.push(optionToLine("    ", opt));
			}
		}
	}

	return lines.join("\n");
}

function sectionToLine(section: SchemaSection): string {
	let line = `@section ${section.id}`;
	if (section.title !== undefined) line += ` ${quote(section.title)}`;
	if (section.desc !== undefined) line += ` desc=${quote(section.desc)}`;
	if (section.when) line += ` when ${conditionToText(section.when)}`;
	return line;
}

function previewToText(preview: PreviewConfig): string {
	if (preview.mode === "none") return "none";
	if (preview.mode === "auto") {
		return preview.maxLength === undefined ? "auto" : `auto maxLength=${preview.maxLength}`;
	}
	const parts = [preview.fields.join(", ")];
	if (preview.separator !== undefined) parts.push(`separator=${quote(preview.separator)}`);
	if (preview.maxLength !== undefined) parts.push(`maxLength=${preview.maxLength}`);
	if (preview.fallbackFields !== undefined) {
		parts.push(`fallback=${preview.fallbackFields.join(",")}`);
	}
	if (preview.prefix) parts.push(`prefix=${quote(preview.prefix)}`);
	return parts.join(" ");
}

function optionToLine(indent: string, opt: FixedOption): string {
	return opt.label === undefined
		? `${indent}- ${opt.k}`
		: `${indent}- ${opt.k} ${quote(opt.label)}`;
}

function defaultToText(value: unknown): string {
	if (typeof value === "string") {
		return /^[^\s"[{]+$/.test(value) ? value : quote(value);
	}
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return JSON.stringify(value);
}

function fieldToLine(head: string, field: DslFieldV2): string {
	let line = `${head} ${field.t} ${quote(field.label)}`;
	if (field.req === true) line += " required";
	else if (field.req === false) line += " optional";
	if (field.hidden) line += " hidden";
	if (field.sensitive === true) line += " sensitive";
	else if (field.sensitive === false) line += " not-sensitive";
	if (field.default !== undefined && field.default !== null) {
		line += ` default=${defaultToText(field.default)}`;
	}
	if (field.meta) line += ` meta=${quote(field.meta)}`;

	// Type-specific constraints
	if ((field.t === "text" || field.t === "textarea") && field.min !== undefined) {
		line += ` min=${field.min}`;
	}
	if (
		(field.t === "text" ||
			field.t === "textarea" ||
			field.t === "markdown" ||
			field.t === "email" ||
			field.t === "url" ||
			field.t === "phone") &&
		field.max !== undefined
	) {
		line += ` max=${field.max}`;
	}
	if (field.t === "number" || field.t === "integer") {
		if (field.min !== undefined) line += ` min=${field.min}`;
		if (field.max !== undefined) line += ` max=${field.max}`;
	}
	if (
		field.t === "date" ||
		field.t === "datetime" ||
		field.t === "time" ||
		field.t === "daterange"
	) {
		if (field.min !== undefined) line += ` min=${quote(field.min)}`;
		if (field.max !== undefined) line += ` max=${quote(field.max)}`;
	}
	if (field.t === "daterange") {
		if (field.minSpanDays !== undefined) line += ` minSpan=${field.minSpanDays}d`;
		if (field.maxSpanDays !== undefined) line += ` maxSpan=${field.maxSpanDays}d`;
	}
	if (field.t === "dynlist" && field.maxItems !== undefined) {
		line += ` maxItems=${field.maxItems}`;
	}
	if (field.help !== undefined) line += ` help=${quote(field.help)}`;
	if (field.placeholder !== undefined) line += ` placeholder=${quote(field.placeholder)}`;
	if (field.replyTo) line += " reply-to";
	if (field.when) line += ` when ${conditionToText(field.when)}`;
	return line;
}
