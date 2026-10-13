import { defineConfig, devices } from "@playwright/test";

// Browser tests for the builder (e2e/tests) against the test page in
// e2e/page, which uses the built package.
export default defineConfig({
	testDir: "./e2e/tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? "github" : "list",
	use: { baseURL: "http://127.0.0.1:4319", trace: "retain-on-failure" },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "vite --config e2e/vite.config.ts",
		url: "http://127.0.0.1:4319",
		reuseExistingServer: !process.env.CI,
	},
});
