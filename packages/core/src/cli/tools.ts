// The work behind each CLI command and MCP tool. Each returns plain text for
// a person or an agent to read, and the data a caller can use directly, so
// the CLI and the MCP server stay thin and say the same things.

import type { SchemaDslV1 } from "../schema/schema-dsl.js";
import { generateSamplePayload } from "../schema/schema-utils.js";
import { type SchemaIssue, validateSchema } from "../schema/validate-schema.js";
import { parseFormDslText, schemaToTextDsl } from "../text/form-dsl-text.js";

export interface ToolResult {
	ok: boolean;
	/** What to show: a summary, the issues, or the converted output. */
	text: string;
	/** The result as data: the schema, the issues, or the sample answers. */
	data?: unknown;
}

/**
 * Agents sometimes send a schema as a JSON string rather than an object.
 * Accept both, and say so plainly when a string is not JSON.
 */
export function readSchemaArgument(value: unknown): { ok: true; value: unknown } | ToolResult {
	if (typeof value !== "string") return { ok: true, value };
	try {
		return { ok: true, value: JSON.parse(value) };
	} catch {
		return {
			ok: false,
			text: "The schema is a string but not valid JSON. Pass the schema as a JSON object.",
		};
	}
}

export function formatIssues(issues: SchemaIssue[]): string {
	return issues
		.map((issue) => {
			const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
			return `- ${where}${issue.message} (${issue.code})`;
		})
		.join("\n");
}

function describe(schema: SchemaDslV1): string {
	const n = schema.fields.length;
	return `${n} field${n === 1 ? "" : "s"}`;
}

/**
 * The commonest mistake, and FeedBakkr's own old MCP example made it: long
 * property names. The structure error alone ("Invalid discriminator value")
 * does not say what to change.
 */
function longNameHint(input: unknown): string {
	const fields = (input as { fields?: unknown })?.fields;
	if (!Array.isArray(fields)) return "";
	const long = fields.some(
		(f) => typeof f === "object" && f !== null && ("key" in f || "type" in f || "required" in f),
	);
	return long ? "\nFields use k, t and req, not key, type and required." : "";
}

export function validateTool(input: unknown, publish: boolean): ToolResult {
	const result = validateSchema(input, { publish });
	const checks = publish ? "including the publish checks" : "without the publish checks";
	if (result.ok) {
		return {
			ok: true,
			text: `Valid schema (${describe(result.schema)}), ${checks}.`,
			data: { ok: true, issues: [] },
		};
	}
	const n = result.issues.length;
	return {
		ok: false,
		text: `Invalid schema, ${n} issue${n === 1 ? "" : "s"}:\n${formatIssues(result.issues)}${longNameHint(input)}`,
		data: { ok: false, issues: result.issues },
	};
}

export function fromTextTool(text: string, publish: boolean): ToolResult {
	const parsed = parseFormDslText(text);
	if (!parsed.ok) {
		const lines = parsed.errors.map((e) => `- line ${e.line}: ${e.message}`).join("\n");
		return { ok: false, text: `The text could not be read:\n${lines}`, data: parsed };
	}
	const checked = validateTool(parsed.schema, publish);
	const json = JSON.stringify(parsed.schema, null, 2);
	return {
		ok: checked.ok,
		text: `${checked.text}\n\n${json}`,
		data: { schema: parsed.schema, ...(checked.data as object) },
	};
}

/** Runs the structure and default checks, which the conversions need to trust their input. */
function checkedSchema(input: unknown): { ok: true; schema: SchemaDslV1 } | ToolResult {
	const result = validateSchema(input);
	if (result.ok) return { ok: true, schema: result.schema };
	return {
		ok: false,
		text: `Fix the schema first. Invalid schema:\n${formatIssues(result.issues)}`,
		data: { ok: false, issues: result.issues },
	};
}

export function toTextTool(input: unknown): ToolResult {
	const checked = checkedSchema(input);
	if (!("schema" in checked)) return checked;
	return { ok: true, text: schemaToTextDsl(checked.schema) };
}

export function sampleTool(input: unknown): ToolResult {
	const checked = checkedSchema(input);
	if (!("schema" in checked)) return checked;
	const answers = generateSamplePayload(checked.schema);
	return { ok: true, text: JSON.stringify(answers, null, 2), data: answers };
}
