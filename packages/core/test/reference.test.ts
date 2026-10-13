// The reference copies must never be edited (see their README). Their
// checksums are recorded in SHA256SUMS, and this fails when one changes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const DIR = join(import.meta.dirname, "reference/feedbakkr-8ae744e");

it("keeps every reference copy as recorded in SHA256SUMS", () => {
	const lines = readFileSync(join(DIR, "SHA256SUMS"), "utf8").trim().split("\n");
	expect(lines.length).toBeGreaterThan(0);
	for (const line of lines) {
		const [sum, file] = line.split(/\s+/);
		const actual = createHash("sha256")
			.update(readFileSync(join(DIR, file as string)))
			.digest("hex");
		expect({ file, sum: actual }).toEqual({ file, sum });
	}
});
