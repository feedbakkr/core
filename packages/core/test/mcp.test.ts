import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMcpHandler, PROTOCOL_VERSIONS } from "../src/cli/mcp.js";
import { generateZod } from "../src/schema/generate-zod.js";
import { schemaDslV1Schema } from "../src/schema/schema-dsl.js";

const contact = {
	v: 1,
	fields: [
		{ k: "name", label: "Name", t: "text", req: true, min: 1 },
		{ k: "email", label: "Email", t: "email", req: true },
		{ k: "topic", label: "Topic", t: "fixed", opts: [{ k: "order" }, { k: "other" }] },
	],
	preview: { mode: "custom", fields: ["name"] },
};

const handle = createMcpHandler({ version: "9.9.9" });
let nextId = 1;

function request(method: string, params?: unknown) {
	return handle({ jsonrpc: "2.0", id: nextId++, method, params });
}

function call(name: string, args: Record<string, unknown>) {
	const response = request("tools/call", { name, arguments: args });
	if (!response || !("result" in response)) throw new Error(JSON.stringify(response));
	return response.result as { content: { type: string; text: string }[]; isError?: boolean };
}

describe("MCP handler", () => {
	it("agrees a protocol version and describes itself", () => {
		const response = request("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "test", version: "1" },
		});
		expect(response).toMatchObject({
			result: {
				protocolVersion: "2025-06-18",
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: "feedbakkr", version: "9.9.9" },
			},
		});
		const future = request("initialize", { protocolVersion: "2099-01-01" });
		expect(future).toMatchObject({ result: { protocolVersion: PROTOCOL_VERSIONS[0] } });
	});

	it("lists the seven tools with object input schemas", () => {
		const response = request("tools/list");
		const tools = (response as { result: { tools: { name: string; inputSchema: unknown }[] } })
			.result.tools;
		expect(tools.map((t) => t.name)).toEqual([
			"schema_guide",
			"validate_schema",
			"schema_from_text",
			"schema_to_text",
			"sample_payload",
			"validate_submission",
			"interpret_submission",
		]);
		for (const tool of tools) expect(tool.inputSchema).toMatchObject({ type: "object" });
	});

	it("validates a schema, with and without the publish checks", () => {
		expect(call("validate_schema", { schema: contact, publish: true })).toEqual({
			content: [{ type: "text", text: "Valid schema (3 fields), including the publish checks." }],
		});
		const empty = { v: 1, fields: [] };
		expect(call("validate_schema", { schema: empty }).isError).toBeUndefined();
		const published = call("validate_schema", { schema: empty, publish: true });
		expect(published.isError).toBe(true);
		expect(published.content[0]?.text).toContain("Schema must have at least one field");
	});

	it("explains long property names, the commonest mistake", () => {
		const result = call("validate_schema", {
			schema: { v: 1, fields: [{ key: "email", type: "email", label: "Email", required: true }] },
		});
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain(
			"Fields use k, t and req, not key, type and required.",
		);
	});

	it("accepts a schema sent as a JSON string, and says when a string is not JSON", () => {
		expect(call("validate_schema", { schema: JSON.stringify(contact) }).isError).toBeUndefined();
		const bad = call("validate_schema", { schema: "{ not json" });
		expect(bad).toMatchObject({ isError: true });
		expect(bad.content[0]?.text).toContain("not valid JSON");
	});

	it("converts text to a schema and back", () => {
		const text = call("schema_to_text", { schema: contact }).content[0]?.text ?? "";
		expect(text).toContain('name: text "Name" required min=1');
		const back = call("schema_from_text", { text, publish: true });
		expect(back.isError).toBeUndefined();
		const json = back.content[0]?.text.split("\n\n").slice(1).join("\n\n") ?? "";
		expect(JSON.parse(json)).toEqual(contact);
	});

	it("reports text it cannot read by line", () => {
		const result = call("schema_from_text", { text: "@version 1\nname: nonsense" });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toMatch(/line 2/);
	});

	it("gives sample answers that pass the schema", () => {
		const text = call("sample_payload", { schema: contact }).content[0]?.text ?? "";
		const schema = schemaDslV1Schema.parse(contact);
		expect(generateZod(schema).safeParse(JSON.parse(text)).success).toBe(true);
	});

	it("serves the guides as a tool and as resources", () => {
		const guide = call("schema_guide", {}).content[0]?.text ?? "";
		expect(guide).toMatch(/^# FeedBakkr form schemas/);
		const list = request("resources/list") as { result: { resources: { uri: string }[] } };
		expect(list.result.resources.map((r) => r.uri)).toEqual([
			"feedbakkr://guide/schema",
			"feedbakkr://guide/claude",
		]);
		const read = request("resources/read", { uri: "feedbakkr://guide/claude" });
		expect(read).toMatchObject({
			result: { contents: [{ uri: "feedbakkr://guide/claude", mimeType: "text/markdown" }] },
		});
	});

	it("checks answers as the server does", () => {
		const ok = call("validate_submission", {
			schema: contact,
			answers: { name: " Ada ", email: "ada@example.com", topic: "order" },
		});
		expect(ok.isError).toBeUndefined();
		expect(ok.content[0]?.text).toContain('"name": "Ada"');

		const refused = call("validate_submission", {
			schema: contact,
			answers: { name: "   ", email: "nope", colour: "red" },
		});
		expect(refused.isError).toBe(true);
		expect(refused.content[0]?.text).toContain("- name: Required (required)");
		expect(refused.content[0]?.text).toContain("- email: Invalid email address (invalid_email)");
		expect(refused.content[0]?.text).toContain(
			"- colour: Not a field of this form (unknown_field)",
		);

		const stripped = call("validate_submission", {
			schema: contact,
			answers: JSON.stringify({ name: "Ada", email: "ada@example.com", colour: "red" }),
			strip: true,
		});
		expect(stripped.isError).toBeUndefined();
	});

	it("shows answers as an inbox would", () => {
		const result = call("interpret_submission", {
			schema: contact,
			answers: { name: "Ada", email: "ada@example.com", topic: "order" },
		});
		expect(result.content[0]?.text).toBe(
			"Summary: Ada\n\n- Name: Ada\n- Email: ada@example.com\n- Topic: order",
		);
	});

	it("checks v2 schemas and their answers", () => {
		const v2 = {
			v: 2,
			fields: [
				{ k: "kind", label: "Kind", t: "fixed", opts: [{ k: "a" }, { k: "b" }], req: true },
				{ k: "detail", label: "Detail", t: "text", req: true, when: { k: "kind", eq: "b" } },
			],
		};
		expect(call("validate_schema", { schema: v2, publish: true }).content[0]?.text).toBe(
			"Valid schema (v2, 2 fields), including the publish checks.",
		);
		const late = { ...v2, fields: [...v2.fields].reverse() };
		expect(call("validate_schema", { schema: late }).content[0]?.text).toContain(
			'refers to "kind", which does not come before it',
		);
		expect(
			call("validate_submission", { schema: v2, answers: { kind: "a", detail: "x" } }).isError,
		).toBeUndefined();
		expect(
			call("validate_submission", { schema: v2, answers: { kind: "b" } }).content[0]?.text,
		).toContain("- detail: Required (required)");
		expect(call("schema_to_text", { schema: v2 }).content[0]?.text).toContain(
			'detail: text "Detail" required when kind = b',
		);
	});

	it("answers protocol errors as JSON-RPC errors", () => {
		expect(request("nope")).toMatchObject({ error: { code: -32601 } });
		expect(request("tools/call", { name: "nope" })).toMatchObject({ error: { code: -32602 } });
		expect(request("tools/call", { name: "validate_schema", arguments: {} })).toMatchObject({
			error: { code: -32602 },
		});
		expect(
			request("tools/call", { name: "validate_submission", arguments: { schema: contact } }),
		).toMatchObject({ error: { code: -32602 } });
		expect(request("resources/read", { uri: "feedbakkr://nope" })).toMatchObject({
			error: { code: -32602 },
		});
		expect(handle({ id: 1, method: "ping" })).toMatchObject({ error: { code: -32600 } });
		expect(request("ping")).toMatchObject({ result: {} });
	});

	it("sends nothing back for notifications", () => {
		expect(handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined();
		expect(handle({ jsonrpc: "2.0", id: 5, result: {} })).toBeUndefined();
	});
});

// The built command, driven by the official MCP client over stdio: proof the
// hand-written server speaks the protocol real clients use.
const BIN = fileURLToPath(new URL("../bin/feedbakkr.js", import.meta.url));
const BUILT = existsSync(fileURLToPath(new URL("../dist/cli.js", import.meta.url)));

describe.runIf(BUILT)("feedbakkr mcp with the MCP SDK client", () => {
	const client = new Client({ name: "feedbakkr-test", version: "1.0.0" });

	beforeAll(async () => {
		await client.connect(
			new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"] }),
		);
	});
	afterAll(() => client.close());

	it("connects and lists the tools and resources", async () => {
		expect(client.getServerVersion()).toMatchObject({ name: "feedbakkr" });
		const { tools } = await client.listTools();
		expect(tools).toHaveLength(7);
		const { resources } = await client.listResources();
		expect(resources).toHaveLength(2);
	});

	it("calls a tool and reads a resource", async () => {
		const result = await client.callTool({
			name: "validate_schema",
			arguments: { schema: contact, publish: true },
		});
		expect(result).toMatchObject({
			content: [{ type: "text", text: expect.stringContaining("Valid") }],
		});
		const guide = await client.readResource({ uri: "feedbakkr://guide/schema" });
		expect(guide.contents[0]).toMatchObject({ mimeType: "text/markdown" });
	});
});

it("runs the stdio test only after a build, which pnpm verify always does", () => {
	if (!BUILT && process.env.CI) throw new Error("dist/cli.js is missing in CI");
});
