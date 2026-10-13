import { readFile } from "node:fs/promises";
import { serveStdio } from "./mcp.js";
import { packageVersion, readPackageFile } from "./package-files.js";
import { fromTextTool, sampleTool, type ToolResult, toTextTool, validateTool } from "./tools.js";

export const USAGE = `Usage: feedbakkr <command> [options]

Commands:
  validate [--publish] [--json] <file...>  Check schemas (JSON or the text format)
  text <file>                              JSON to the text format, or text to JSON
  sample <file>                            Example answers that pass the schema
  guide [schema|claude]                    Print the schema guide, or the notes for agents
  mcp                                      Run the MCP server on stdin and stdout

A file of "-" reads standard input. Exit codes: 0 success, 1 invalid input,
2 a usage error or a file that cannot be read.`;

export interface CliIo {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	readFile: (path: string) => Promise<string>;
	readStdin: () => Promise<string>;
	/** Runs the MCP server; only `feedbakkr mcp` uses it. */
	serveMcp: () => Promise<void>;
}

class UsageError extends Error {}

/** JSON when it looks like JSON, otherwise the text format. */
function isJson(source: string): boolean {
	return source.trimStart().startsWith("{");
}

function readSource(io: CliIo, file: string): Promise<string> {
	return file === "-" ? io.readStdin() : io.readFile(file);
}

/** A schema from a file in either format, or the reason it could not be read. */
function schemaFrom(source: string): { ok: true; schema: unknown } | ToolResult {
	if (isJson(source)) {
		try {
			return { ok: true, schema: JSON.parse(source) };
		} catch (err) {
			return { ok: false, text: `Not valid JSON: ${(err as Error).message}` };
		}
	}
	const parsed = fromTextTool(source, false);
	const data = parsed.data as { schema?: unknown };
	if (data?.schema === undefined) return parsed;
	return { ok: true, schema: data.schema };
}

function parseFlags(args: string[], allowed: string[]) {
	const flags = new Set<string>();
	const rest: string[] = [];
	for (const arg of args) {
		if (arg.startsWith("--")) {
			if (!allowed.includes(arg)) throw new UsageError(`Unknown option: ${arg}`);
			flags.add(arg);
		} else rest.push(arg);
	}
	return { flags, rest };
}

function oneFile(rest: string[], command: string): string {
	if (rest.length !== 1) throw new UsageError(`${command} takes one file`);
	return rest[0] as string;
}

async function validate(io: CliIo, args: string[]): Promise<number> {
	const { flags, rest } = parseFlags(args, ["--publish", "--json"]);
	if (rest.length === 0) throw new UsageError("validate needs at least one file");
	const publish = flags.has("--publish");
	const report: { file: string; ok: boolean; issues: unknown }[] = [];
	let failed = false;
	for (const file of rest) {
		const loaded = schemaFrom(await readSource(io, file));
		const result = "schema" in loaded ? validateTool(loaded.schema, publish) : loaded;
		failed ||= !result.ok;
		const issues = (result.data as { issues?: unknown })?.issues ?? [{ message: result.text }];
		report.push({ file, ok: result.ok, issues: result.ok ? [] : issues });
		if (!flags.has("--json")) io.stdout(`${file}: ${result.text}\n`);
	}
	if (flags.has("--json")) io.stdout(`${JSON.stringify(report, null, 2)}\n`);
	return failed ? 1 : 0;
}

async function text(io: CliIo, args: string[]): Promise<number> {
	const { rest } = parseFlags(args, []);
	const source = await readSource(io, oneFile(rest, "text"));
	if (isJson(source)) {
		const loaded = schemaFrom(source);
		const result = "schema" in loaded ? toTextTool(loaded.schema) : loaded;
		(result.ok ? io.stdout : io.stderr)(`${result.text}\n`);
		return result.ok ? 0 : 1;
	}
	const result = fromTextTool(source, false);
	const schema = (result.data as { schema?: unknown })?.schema;
	if (!result.ok || schema === undefined) {
		io.stderr(`${result.text}\n`);
		return 1;
	}
	io.stdout(`${JSON.stringify(schema, null, 2)}\n`);
	return 0;
}

async function sample(io: CliIo, args: string[]): Promise<number> {
	const { rest } = parseFlags(args, []);
	const loaded = schemaFrom(await readSource(io, oneFile(rest, "sample")));
	const result = "schema" in loaded ? sampleTool(loaded.schema) : loaded;
	(result.ok ? io.stdout : io.stderr)(`${result.text}\n`);
	return result.ok ? 0 : 1;
}

function guide(io: CliIo, args: string[]): number {
	const which = args[0] ?? "schema";
	if (args.length > 1 || (which !== "schema" && which !== "claude")) {
		throw new UsageError("guide takes schema or claude");
	}
	io.stdout(readPackageFile(`docs/${which}-guide.md`));
	return 0;
}

export async function runCli(argv: string[], io: CliIo): Promise<number> {
	const [command, ...args] = argv;
	try {
		switch (command) {
			case "validate":
				return await validate(io, args);
			case "text":
				return await text(io, args);
			case "sample":
				return await sample(io, args);
			case "guide":
				return guide(io, args);
			case "mcp":
				await io.serveMcp();
				return 0;
			case "--version":
			case "-v":
				io.stdout(`${packageVersion()}\n`);
				return 0;
			case undefined:
			case "help":
			case "--help":
			case "-h":
				io.stdout(`${USAGE}\n`);
				return 0;
			default:
				throw new UsageError(`Unknown command: ${command}`);
		}
	} catch (err) {
		if (err instanceof UsageError) {
			io.stderr(`feedbakkr: ${err.message}\n\n${USAGE}\n`);
			return 2;
		}
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "EISDIR" || code === "EACCES") {
			io.stderr(`feedbakkr: ${(err as Error).message}\n`);
			return 2;
		}
		throw err;
	}
}

export function nodeIo(): CliIo {
	return {
		stdout: (s) => process.stdout.write(s),
		stderr: (s) => process.stderr.write(s),
		readFile: (path) => readFile(path, "utf8"),
		readStdin: async () => {
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
			return Buffer.concat(chunks).toString("utf8");
		},
		serveMcp: () => serveStdio({ version: packageVersion() }, process.stdin, process.stdout),
	};
}
