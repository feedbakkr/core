import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs test-workers/ inside workerd, the Workers runtime, against the built
// package. No nodejs_compat flag on purpose: core must not need Node APIs.
export default defineConfig({
	plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2026-10-01" } })],
	test: {
		include: ["test-workers/**/*.test.ts"],
	},
});
