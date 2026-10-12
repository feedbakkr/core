import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		schema: "src/schema/index.ts",
		text: "src/text/index.ts",
		export: "src/export/index.ts",
	},
	format: ["esm"],
	target: "es2022",
	dts: { compilerOptions: { types: [] } },
	tsconfig: "tsconfig.build.json",
	clean: true,
	splitting: true,
	sourcemap: true,
	treeshake: true,
});
