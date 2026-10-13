// A local MCP server over stdio, for coding agents such as Claude Code.
//
// Written against the protocol directly rather than with the MCP SDK: the
// server needs only initialize, ping, tools and resources, and the SDK would
// add Express and a dozen other packages to every app that installs core.
// The tests drive it with the SDK's own client to prove it speaks the
// protocol. Messages are JSON-RPC 2.0, one per line.
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { readPackageFile } from "./package-files.js";
import {
	fromTextTool,
	readSchemaArgument,
	sampleTool,
	type ToolResult,
	toTextTool,
	validateTool,
} from "./tools.js";

/** Newest first. A client asking for one of these gets it back. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const GUIDE_URI = "feedbakkr://guide/schema";
const CLAUDE_GUIDE_URI = "feedbakkr://guide/claude";

const INSTRUCTIONS =
	"Tools for FeedBakkr form schemas. Read the format with schema_guide before writing a " +
	"schema, and check every schema you write or change with validate_schema, passing " +
	'"publish": true for forms people will fill in.';

const schemaProperty = {
	type: "object",
	description:
		'A FeedBakkr schema as a JSON object (not a string), for example { "v": 1, "fields": ' +
		'[{ "k": "email", "label": "Email", "t": "email", "req": true }] }. Fields use k, t ' +
		"and req, never key, type or required.",
};

const TOOLS = [
	{
		name: "schema_guide",
		title: "FeedBakkr schema guide",
		description:
			"The FeedBakkr form schema format: every field type and its settings, defaults, " +
			"preview, the checks and the text format, with examples. Read it before writing a schema.",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: "validate_schema",
		title: "Validate a schema",
		description:
			"Check a FeedBakkr form schema. Returns that it is valid, or every issue with its " +
			"path. Pass publish: true for forms people will fill in; it adds the publish checks " +
			"(at least one field, unique keys, a valid preview).",
		inputSchema: {
			type: "object",
			properties: {
				schema: schemaProperty,
				publish: {
					type: "boolean",
					description: "Also run the publish checks. Use true for real forms.",
				},
			},
			required: ["schema"],
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: "schema_from_text",
		title: "Schema from text",
		description:
			"Convert a schema written in the FeedBakkr text format into the JSON schema, and " +
			"check it. The format is described in schema_guide.",
		inputSchema: {
			type: "object",
			properties: {
				text: { type: "string", description: "The schema in the text format." },
				publish: { type: "boolean", description: "Also run the publish checks." },
			},
			required: ["text"],
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: "schema_to_text",
		title: "Schema to text",
		description:
			"Write a JSON schema in the FeedBakkr text format, which is shorter to read and " +
			"review. Converting back gives the same schema.",
		inputSchema: { type: "object", properties: { schema: schemaProperty }, required: ["schema"] },
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	{
		name: "sample_payload",
		title: "Sample answers",
		description:
			"Example answers for a schema, keyed by field, that pass its checks. Use them in " +
			"tests and fixtures.",
		inputSchema: { type: "object", properties: { schema: schemaProperty }, required: ["schema"] },
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
] as const;

const RESOURCES = [
	{
		uri: GUIDE_URI,
		name: "schema-guide",
		title: "FeedBakkr schema guide",
		description: "The form schema format, the checks and the text format.",
		mimeType: "text/markdown",
		file: "docs/schema-guide.md",
	},
	{
		uri: CLAUDE_GUIDE_URI,
		name: "claude-guide",
		title: "Working with FeedBakkr Core",
		description: "How an app uses core: one schema on both sides, server checks, versions.",
		mimeType: "text/markdown",
		file: "docs/claude-guide.md",
	},
];

type Id = string | number;
type JsonRpcResponse =
	| { jsonrpc: "2.0"; id: Id | null; result: unknown }
	| { jsonrpc: "2.0"; id: Id | null; error: { code: number; message: string } };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

class RpcError extends Error {
	constructor(
		readonly code: number,
		message: string,
	) {
		super(message);
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCallResult(result: ToolResult) {
	return {
		content: [{ type: "text", text: result.text }],
		...(result.ok ? {} : { isError: true }),
	};
}

function callTool(name: string, args: Record<string, unknown>) {
	const publish = args.publish === true;
	switch (name) {
		case "schema_guide":
			return toCallResult({ ok: true, text: readPackageFile("docs/schema-guide.md") });
		case "schema_from_text":
			if (typeof args.text !== "string")
				throw new RpcError(INVALID_PARAMS, "text must be a string");
			return toCallResult(fromTextTool(args.text, publish));
		case "validate_schema":
		case "schema_to_text":
		case "sample_payload": {
			if (!("schema" in args)) throw new RpcError(INVALID_PARAMS, "schema is required");
			const schema = readSchemaArgument(args.schema);
			if (!("value" in schema)) return toCallResult(schema);
			if (name === "validate_schema") return toCallResult(validateTool(schema.value, publish));
			if (name === "schema_to_text") return toCallResult(toTextTool(schema.value));
			return toCallResult(sampleTool(schema.value));
		}
		default:
			throw new RpcError(INVALID_PARAMS, `Unknown tool: ${name}`);
	}
}

export interface McpServerOptions {
	version: string;
}

/**
 * Handles one decoded message. Returns the response to send, or `undefined`
 * for notifications and for responses the client sends back.
 */
export function createMcpHandler(options: McpServerOptions) {
	function dispatch(method: string, params: Record<string, unknown>): unknown {
		switch (method) {
			case "initialize": {
				const requested = params.protocolVersion;
				const protocolVersion =
					typeof requested === "string" && PROTOCOL_VERSIONS.includes(requested)
						? requested
						: PROTOCOL_VERSIONS[0];
				return {
					protocolVersion,
					capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
					serverInfo: { name: "feedbakkr", title: "FeedBakkr Core", version: options.version },
					instructions: INSTRUCTIONS,
				};
			}
			case "ping":
				return {};
			case "tools/list":
				return { tools: TOOLS };
			case "tools/call": {
				if (typeof params.name !== "string") throw new RpcError(INVALID_PARAMS, "name is required");
				const args = isObject(params.arguments) ? params.arguments : {};
				return callTool(params.name, args);
			}
			case "resources/list":
				return { resources: RESOURCES.map(({ file: _file, ...resource }) => resource) };
			case "resources/templates/list":
				return { resourceTemplates: [] };
			case "resources/read": {
				const resource = RESOURCES.find((r) => r.uri === params.uri);
				if (!resource)
					throw new RpcError(INVALID_PARAMS, `Unknown resource: ${String(params.uri)}`);
				return {
					contents: [
						{
							uri: resource.uri,
							mimeType: resource.mimeType,
							text: readPackageFile(resource.file),
						},
					],
				};
			}
			default:
				throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
		}
	}

	return function handle(message: unknown): JsonRpcResponse | undefined {
		if (!isObject(message) || message.jsonrpc !== "2.0") {
			return {
				jsonrpc: "2.0",
				id: null,
				error: { code: INVALID_REQUEST, message: "Invalid request" },
			};
		}
		const { id, method } = message;
		const isRequest = typeof id === "string" || typeof id === "number";
		if (typeof method !== "string") {
			// A response from the client; this server never sends requests.
			if (isRequest || id === null) return undefined;
			return {
				jsonrpc: "2.0",
				id: null,
				error: { code: INVALID_REQUEST, message: "Invalid request" },
			};
		}
		if (!isRequest) return undefined; // A notification, such as notifications/initialized.
		try {
			const params = isObject(message.params) ? message.params : {};
			return { jsonrpc: "2.0", id, result: dispatch(method, params) };
		} catch (err) {
			const code = err instanceof RpcError ? err.code : -32603;
			const text = err instanceof Error ? err.message : String(err);
			return { jsonrpc: "2.0", id, error: { code, message: text } };
		}
	};
}

/** Serves MCP on a pair of streams until the input ends. */
export function serveStdio(
	options: McpServerOptions,
	input: Readable,
	output: Writable,
): Promise<void> {
	const handle = createMcpHandler(options);
	const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
	const send = (response: JsonRpcResponse | undefined) => {
		if (response) output.write(`${JSON.stringify(response)}\n`);
	};
	lines.on("line", (line) => {
		if (line.trim() === "") return;
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			send({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Parse error" } });
			return;
		}
		send(handle(message));
	});
	return new Promise((resolve) => lines.once("close", () => resolve()));
}
