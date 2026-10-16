import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson, hashSchema, validateSchema } from "../src/index.js";

/*
 * Golden fingerprint vectors, shared with FeedBakkr Cloud (which pins the same file).
 * Cloud stores "sha256:" + hashSchema(schema) for every schema version it accepts, and
 * FoodACN keys its stored versions by hashSchema, so these values must never change
 * silently. A change here is a breaking change and needs a new fingerprint version.
 * Never edit the fixture by hand.
 */

type Vector = { name: string; schema: unknown; canonicalJson: string; fingerprint: string };
const file = JSON.parse(
	readFileSync(new URL("../../../fixtures/fingerprints/v1.json", import.meta.url), "utf8"),
) as { fingerprintVersion: number; vectors: Vector[] };

function reverseKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseKeys);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value).reverse()) {
			out[key] = reverseKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

async function fingerprint(schema: unknown) {
	const checked = validateSchema(schema, { allowV2: true });
	if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
	return {
		canonical: canonicalJson(checked.schema),
		fingerprint: `sha256:${await hashSchema(checked.schema)}`,
	};
}

describe("fingerprint golden vectors (v1)", () => {
	it("are fingerprint version 1 and all distinct", () => {
		expect(file.fingerprintVersion).toBe(1);
		expect(new Set(file.vectors.map((v) => v.fingerprint)).size).toBe(file.vectors.length);
	});

	for (const vector of file.vectors) {
		it(`reproduces ${vector.name}`, async () => {
			expect(await fingerprint(vector.schema)).toEqual({
				canonical: vector.canonicalJson,
				fingerprint: vector.fingerprint,
			});
		});

		it(`ignores key order for ${vector.name}`, async () => {
			expect((await fingerprint(reverseKeys(vector.schema))).fingerprint).toBe(vector.fingerprint);
		});

		it(`is SHA-256 of the UTF-8 canonical JSON for ${vector.name}`, () => {
			const hex = createHash("sha256")
				.update(Buffer.from(vector.canonicalJson, "utf8"))
				.digest("hex");
			expect(`sha256:${hex}`).toBe(vector.fingerprint);
		});
	}
});
