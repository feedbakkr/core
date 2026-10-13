import { readFileSync } from "node:fs";

/**
 * Reads a file shipped in the package, such as `docs/schema-guide.md`.
 *
 * Built, this module is bundled into `dist/cli.js`, one level below the
 * package root. Under the tests it runs from `src/cli/`, two levels below.
 */
export function readPackageFile(relativePath: string): string {
	for (const up of ["../", "../../"]) {
		try {
			return readFileSync(new URL(up + relativePath, import.meta.url), "utf8");
		} catch {
			// Try the next level up.
		}
	}
	throw new Error(`feedbakkr: cannot find ${relativePath} in the package`);
}

export function packageVersion(): string {
	return (JSON.parse(readPackageFile("package.json")) as { version: string }).version;
}
