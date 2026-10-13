import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		schema: "src/schema/index.ts",
		text: "src/text/index.ts",
		export: "src/export/index.ts",
		submissions: "src/submissions/index.ts",
		messages: "src/messages/index.ts",
		form: "src/form/index.ts",
		react: "src/react/index.ts",
		builder: "src/builder/index.ts",
		// The `feedbakkr` command, run by bin/feedbakkr.js. Node only, and not
		// an export, so it gets no type declarations.
		cli: "src/cli/index.ts",
	},
	format: ["esm"],
	target: "es2022",
	dts: {
		entry: {
			index: "src/index.ts",
			schema: "src/schema/index.ts",
			text: "src/text/index.ts",
			export: "src/export/index.ts",
			submissions: "src/submissions/index.ts",
			messages: "src/messages/index.ts",
			form: "src/form/index.ts",
			react: "src/react/index.ts",
			builder: "src/builder/index.ts",
		},
		compilerOptions: { types: [] },
	},
	tsconfig: "tsconfig.build.json",
	clean: true,
	splitting: true,
	sourcemap: true,
	treeshake: true,
});
