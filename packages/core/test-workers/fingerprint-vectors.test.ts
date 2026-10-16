import { describe, expect, it } from "vitest";
import vectors from "../../../fixtures/fingerprints/v1.json";
import { canonicalJson, hashSchema, validateSchema } from "../dist/index.js";

/*
 * The same golden vectors, hashed by the published build inside workerd: Cloud
 * fingerprints schemas in a Worker, browsers in WebCrypto, and the results must
 * be identical everywhere.
 */
describe("fingerprint golden vectors in workerd", () => {
	for (const vector of vectors.vectors) {
		it(`reproduces ${vector.name}`, async () => {
			const checked = validateSchema(vector.schema, { allowV2: true });
			expect(checked.ok).toBe(true);
			if (!checked.ok) return;
			expect(canonicalJson(checked.schema)).toBe(vector.canonicalJson);
			expect(`sha256:${await hashSchema(checked.schema)}`).toBe(vector.fingerprint);
		});
	}
});
