// Fails the build if a published entry reaches something it must not.
//
// Every entry in milestone 1 is pure TypeScript for servers, Workers and
// browsers alike, so the only package any built file may import is `zod`.
// React, the builder's UI libraries, the MCP SDK and Node built-ins are all
// refused, as is code generation at run time (`eval`, `new Function`), which
// Cloudflare Workers forbid.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const ALLOWED_PACKAGES = new Set(["zod"]);

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
		if (spec.startsWith(".")) continue;
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
console.log(`check-boundaries: ${files.length} built files import only ${[...ALLOWED_PACKAGES].join(", ")}`);
