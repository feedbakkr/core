import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Serves e2e/page for the Playwright tests. The page imports the built
// package from dist/, so run the build first.
export default defineConfig({
	root: new URL("./page", import.meta.url).pathname,
	plugins: [react()],
	server: { port: 4319, strictPort: true, host: "127.0.0.1" },
	logLevel: "warn",
});
