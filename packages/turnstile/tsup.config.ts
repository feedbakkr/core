import { defineConfig } from "tsup";

const entry = {
	index: "src/index.ts",
	server: "src/server.ts",
	browser: "src/browser.ts",
	react: "src/react.tsx",
};

export default defineConfig({
	entry,
	format: ["esm"],
	target: "es2022",
	dts: { entry, compilerOptions: { types: [] } },
	tsconfig: "tsconfig.build.json",
	clean: true,
	splitting: true,
	sourcemap: true,
	treeshake: true,
	external: ["react"],
});
