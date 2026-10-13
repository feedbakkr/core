// Fails the build if a published entry reaches something it must not.
//
// The library entries (`index`, `schema`, `submissions`, `messages`, `form`,
// `text`, `export`) are pure
// TypeScript for servers, Workers and browsers alike, so the only package
// they, and every chunk they load, may import is `zod`. Code generation at
// run time (`eval`, `new Function`), which Cloudflare Workers forbid, is
// refused everywhere.
//
// The other entries add packages of their own, and so may the chunks that
// only they load:
//
// - `react.js` adds `react`, an optional peer dependency.
// - `builder.js` adds `react`, `react-dom` and the builder's UI libraries,
//   all optional peer dependencies.
// - `cli.js`, the `feedbakkr` command, runs only in Node and adds Node
//   built-ins.
//
// No file may import one of these entries.
import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const NODE_BUILTINS = new Set(builtinModules);
const REACT = ["react"];
const BUILDER = [
	...REACT,
	"react-dom",
	"radix-ui",
	"@dnd-kit/core",
	"@dnd-kit/sortable",
	"@dnd-kit/utilities",
	"lucide-react",
];
/** What each entry may import beyond `zod`. */
const ENTRY_EXTRAS = {
	"index.js": [],
	"schema.js": [],
	"text.js": [],
	"export.js": [],
	"submissions.js": [],
	"messages.js": [],
	"form.js": [],
	"react.js": REACT,
	"builder.js": BUILDER,
	"cli.js": ["node:"],
};
const NOT_IMPORTABLE = new Set(["react.js", "builder.js", "cli.js"]);

const files = (await readdir(DIST, { recursive: true })).filter((f) => f.endsWith(".js"));
for (const entry of Object.keys(ENTRY_EXTRAS)) {
	if (!files.includes(entry)) {
		console.error(`check-boundaries: dist/${entry} is missing. Run the build first.`);
		process.exit(1);
	}
}

// Static imports and re-exports start a line in esbuild output; dynamic
// imports can appear anywhere. String contents never match these shapes.
const patterns = [
	/^\s*(?:import|export)\s[^"';]*?\bfrom\s*["']([^"']+)["']/gm,
	/^\s*import\s*["']([^"']+)["']/gm,
	/\bimport\(\s*["']([^"']+)["']\s*\)/g,
];
const problems = [];
const localImports = new Map();
const packageImports = new Map();
for (const file of files) {
	const code = await readFile(join(DIST, file), "utf8");
	const specs = patterns.flatMap((p) => [...code.matchAll(p)].map((m) => m[1]));
	const local = specs.filter((s) => s.startsWith(".")).map((s) => s.replace(/^\.\//, ""));
	localImports.set(file, local);
	packageImports.set(
		file,
		specs.filter((s) => !s.startsWith(".")),
	);
	for (const target of local) {
		if (NOT_IMPORTABLE.has(target)) problems.push(`${file}: imports the ${target} entry`);
	}
	if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(code)) {
		problems.push(`${file}: uses eval or new Function`);
	}
}

// Which entries load each file, directly or through other chunks.
const loadedBy = new Map(files.map((f) => [f, new Set()]));
for (const entry of Object.keys(ENTRY_EXTRAS)) {
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.pop();
		if (loadedBy.get(file)?.has(entry)) continue;
		loadedBy.get(file)?.add(entry);
		queue.push(...(localImports.get(file) ?? []));
	}
}

function packageOf(spec) {
	if (spec.startsWith("node:") || NODE_BUILTINS.has(spec.split("/")[0])) return "node:";
	return spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
}

for (const file of files) {
	const entries = [...(loadedBy.get(file) ?? [])];
	if (entries.length === 0) {
		problems.push(`${file}: not loaded by any entry`);
		continue;
	}
	for (const spec of packageImports.get(file)) {
		const pkg = packageOf(spec);
		if (pkg === "zod") continue;
		// A file may import a package only if every entry that loads it may.
		const refused = entries.filter((e) => !ENTRY_EXTRAS[e].includes(pkg));
		if (refused.length > 0) {
			problems.push(`${file}: imports "${spec}" but is loaded by ${refused.join(", ")}`);
		}
	}
}

if (problems.length > 0) {
	console.error(`check-boundaries: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
	process.exit(1);
}
console.log(
	`check-boundaries: ${files.length} files; the library entries reach only zod, the React and builder entries add only their peers, the CLI only Node built-ins`,
);
