// Builds dist/builder.css from src/builder/builder.css.
//
// Tailwind compiles the classes the builder's components use. The result is
// then scoped to `.fbk-builder`: page-wide selectors (`:root`, `html`, `body`)
// become `.fbk-builder`, and every other selector gets `.fbk-builder ` in
// front, so the builder neither styles nor resets anything outside it.
// Cascade layers are removed as well, because a host's unlayered CSS beats
// layered rules whatever their specificity.
import { readFile, writeFile } from "node:fs/promises";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

const SOURCE = new URL("../src/builder/builder.css", import.meta.url).pathname;
const OUT = new URL("../dist/builder.css", import.meta.url).pathname;
const SCOPE = ".fbk-builder";
const PAGE_SELECTORS = new Set([":root", ":host", "html", "body"]);
// Rules about the scope itself, or about an ancestor, stay as they are.
const UNSCOPED = new Set([SCOPE, ".dark"]);

function scopeSelector(selector) {
	const s = selector.trim();
	if (UNSCOPED.has(s)) return s;
	if (PAGE_SELECTORS.has(s)) return SCOPE;
	return `${SCOPE} ${s}`;
}

/** @type {import("postcss").PluginCreator<void>} */
const scope = () => ({
	postcssPlugin: "fbk-scope",
	OnceExit(root) {
		root.walkAtRules("layer", (rule) => {
			if (rule.nodes) rule.replaceWith(rule.nodes);
			else rule.remove();
		});
		root.walkRules((rule) => {
			if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
			rule.selectors = [...new Set(rule.selectors.map(scopeSelector))];
		});
	},
});
scope.postcss = true;

const css = await readFile(SOURCE, "utf8");
const result = await postcss([tailwindcss({ optimize: { minify: true } }), scope]).process(css, {
	from: SOURCE,
	to: OUT,
});
await writeFile(OUT, result.css);
console.log(`builder.css: ${(result.css.length / 1024).toFixed(1)} KB`);
