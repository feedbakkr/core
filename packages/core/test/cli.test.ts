import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { type CliIo, runCli } from "../src/cli/run.js";
import { generateZod } from "../src/schema/generate-zod.js";
import { schemaDslV1Schema } from "../src/schema/schema-dsl.js";
import { parseFormDslText } from "../src/text/form-dsl-text.js";

const contact = {
	v: 1,
	title: "Contact",
	fields: [
		{ k: "name", label: "Name", t: "text", req: true, min: 1 },
		{
			k: "topic",
			label: "Topic",
			t: "fixed",
			opts: [{ k: "order", label: "An order" }, { k: "other" }],
		},
	],
	preview: { mode: "custom", fields: ["name"] },
};

const contactText = `@version 1
@title Contact
@preview name

name: text "Name" required min=1
topic: fixed "Topic"
  - order "An order"
  - other
`;

const files: Record<string, string> = {
	"contact.json": JSON.stringify(contact),
	"contact.fbk": contactText,
	"empty.json": JSON.stringify({ v: 1, fields: [] }),
	"long-names.json": JSON.stringify({ v: 1, fields: [{ key: "a", type: "text", label: "A" }] }),
	"broken.json": "{ nope",
	"broken.fbk": "@version 1\nname: nonsense",
};

async function cli(argv: string[], stdin = "") {
	let stdout = "";
	let stderr = "";
	const io: CliIo = {
		stdout: (s) => {
			stdout += s;
		},
		stderr: (s) => {
			stderr += s;
		},
		readFile: async (path) => {
			const file = files[path];
			if (file === undefined) {
				throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: "ENOENT" });
			}
			return file;
		},
		readStdin: async () => stdin,
		serveMcp: async () => {
			stdout += "(mcp)";
		},
	};
	const code = await runCli(argv, io);
	return { code, stdout, stderr };
}

describe("feedbakkr validate", () => {
	it("passes valid schemas in either format", async () => {
		expect(await cli(["validate", "--publish", "contact.json", "contact.fbk"])).toMatchSnapshot();
	});

	it("fails and lists the issues", async () => {
		const result = await cli([
			"validate",
			"--publish",
			"contact.json",
			"empty.json",
			"long-names.json",
		]);
		expect(result.code).toBe(1);
		expect(result).toMatchSnapshot();
	});

	it("runs the publish checks only when asked", async () => {
		expect((await cli(["validate", "empty.json"])).code).toBe(0);
		expect((await cli(["validate", "--publish", "empty.json"])).code).toBe(1);
	});

	it("reports files it cannot read", async () => {
		const result = await cli(["validate", "broken.json", "broken.fbk"]);
		expect(result.code).toBe(1);
		// Node words the JSON error itself, differently between versions.
		expect(result.stdout).toMatch(/^broken\.json: Not valid JSON: .+\n/);
		expect(result.stdout).toContain(
			"broken.fbk: The text could not be read:\n- line 2: Could not parse field: name: nonsense\n",
		);
	});

	it("writes JSON for scripts", async () => {
		const result = await cli(["validate", "--publish", "--json", "contact.json", "empty.json"]);
		expect(result.code).toBe(1);
		expect(JSON.parse(result.stdout)).toEqual([
			{ file: "contact.json", ok: true, issues: [] },
			{
				file: "empty.json",
				ok: false,
				issues: [
					{ code: "not_publishable", message: "Schema must have at least one field", path: [] },
				],
			},
		]);
	});

	it("reads standard input", async () => {
		expect((await cli(["validate", "-"], contactText)).code).toBe(0);
	});
});

describe("feedbakkr text", () => {
	it("writes JSON as text", async () => {
		const result = await cli(["text", "contact.json"]);
		expect(result).toMatchSnapshot();
	});

	it("writes text as JSON, the same schema", async () => {
		const result = await cli(["text", "contact.fbk"]);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual(contact);
	});

	it("round-trips", async () => {
		const text = (await cli(["text", "contact.json"])).stdout;
		expect(parseFormDslText(text)).toEqual({ ok: true, schema: contact });
	});

	it("fails on text it cannot read", async () => {
		expect(await cli(["text", "broken.fbk"])).toMatchSnapshot();
	});
});

describe("feedbakkr sample", () => {
	it("prints answers that pass the schema", async () => {
		const result = await cli(["sample", "contact.fbk"]);
		expect(result).toMatchSnapshot();
		const schema = schemaDslV1Schema.parse(contact);
		expect(generateZod(schema).safeParse(JSON.parse(result.stdout)).success).toBe(true);
	});
});

describe("feedbakkr guide, mcp, help and errors", () => {
	it("prints the guides shipped in the package", async () => {
		const schema = await cli(["guide"]);
		expect(schema.stdout).toBe(
			await readFile(new URL("../docs/schema-guide.md", import.meta.url), "utf8"),
		);
		const claude = await cli(["guide", "claude"]);
		expect(claude.stdout).toMatch(/^# Working with FeedBakkr Core/);
	});

	it("starts the MCP server", async () => {
		expect(await cli(["mcp"])).toEqual({ code: 0, stdout: "(mcp)", stderr: "" });
	});

	it("prints its version and help", async () => {
		const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
		expect((await cli(["--version"])).stdout).toBe(`${pkg.version}\n`);
		expect(await cli([])).toMatchSnapshot();
	});

	it("exits 2 on usage errors and missing files", async () => {
		for (const argv of [
			["nope"],
			["validate"],
			["validate", "--nope", "a"],
			["text", "a", "b"],
			["guide", "x"],
		]) {
			const result = await cli(argv);
			expect(result.code, argv.join(" ")).toBe(2);
			expect(result.stderr).toContain("Usage: feedbakkr");
		}
		expect(await cli(["validate", "missing.json"])).toMatchObject({
			code: 2,
			stderr: expect.stringContaining("ENOENT"),
		});
	});
});
