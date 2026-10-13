// Fails the build if a published entry reaches something it must not.
//
// The library entries are pure TypeScript for servers, Workers and browsers
// alike, so the only package they or their chunks may import is `zod`. React,
// the builder's UI libraries, the MCP SDK and Node built-ins are all refused,
// as is code generation at run time (`eval`, `new Function`), which Cloudflare
// Workers forbid.
//
// `cli.js`, the `feedbakkr` command, runs only in Node and may also import
// Node built-ins. Nothing else may import it.
import { builtinModules } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const ALLOWED_PACKAGES = new Set(["zod"]);
const NODE_ONLY = new Set(["cli.js"]);
const NODE_BUILTINS = new Set(builtinModules);

const files = (await readdir(DIST, { recursive: true })).filter((f) => f.endsWith(".js"));
if (files.length === 0) {
	console.error("check-boundaries: no built files in dist/. Run the build first.");
	process.exit(1);
}

const problems = [];
// Static imports and re-exports start a line in esbuild output; dynamic
// imports can appear anywhere. String contents never match these shapes.
const patterns = [
	/^\s*(?:import|export)\s[^"';]*?\bfrom\s*["']([^"']+)["']/gm,
	/^\s*import\s*["']([^"']+)["']/gm,
	/\bimport\(\s*["']([^"']+)["']\s*\)/g,
];
for (const file of files) {
	const code = await readFile(join(DIST, file), "utf8");
	const specs = patterns.flatMap((p) => [...code.matchAll(p)].map((m) => m[1]));
	for (const spec of specs) {
		if (spec.startsWith(".")) {
			if (NODE_ONLY.has(spec.replace(/^\.\//, ""))) problems.push(`${file}: imports the CLI`);
			continue;
		}
		if (NODE_ONLY.has(file) && (spec.startsWith("node:") || NODE_BUILTINS.has(spec.split("/")[0]))) {
			continue;
		}
		const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
		if (!ALLOWED_PACKAGES.has(pkg)) problems.push(`${file}: imports "${spec}"`);
	}
	if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(code)) {
		problems.push(`${file}: uses eval or new Function`);
	}
}

if (problems.length > 0) {
	console.error(`check-boundaries: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
	process.exit(1);
}
const library = files.length - NODE_ONLY.size;
console.log(
	`check-boundaries: ${library} library files import only ${[...ALLOWED_PACKAGES].join(", ")}; the CLI adds only Node built-ins`,
);
