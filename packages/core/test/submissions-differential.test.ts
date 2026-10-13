// validateSubmission must apply exactly FeedBakkr's answer rules once the
// answers are normalised. For every fixture and every probe:
//
//   validateSubmission(schema, answers)
//     agrees with FeedBakkr's generateZod (the reference copy) on
//   normalizeSubmission(schema, answers)
//
// on the verdict and on which fields are wrong. What normalising changes is
// listed and tested in submissions.test.ts.
import { describe, expect, it } from "vitest";
import { schemaDslV1Schema } from "../src/schema/schema-dsl.js";
import { normalizeSubmission, validateSubmission } from "../src/submissions/index.js";
import { allFixtures } from "./fixtures.js";
import { payloadsFor } from "./probes.js";
import { generateZod as refGenerateZod } from "./reference/feedbakkr-8ae744e/generate-zod.js";
import { schemaDslV1Schema as refSchema } from "./reference/feedbakkr-8ae744e/schema-dsl.js";

describe.each(allFixtures())("$name", ({ schema: raw }) => {
	it("agrees with FeedBakkr's validator on normalised answers", () => {
		const schema = schemaDslV1Schema.parse(raw);
		const reference = refGenerateZod(refSchema.parse(raw));
		let rejected = 0;
		for (const answers of payloadsFor(schema)) {
			// Refusing unknown keys is a listed difference; here they are dropped.
			const ours = validateSubmission(schema, answers, { unknownFields: "strip" });
			const normalised = normalizeSubmission(schema, answers);
			const theirs = reference.safeParse(normalised);
			const ourKeys = ours.ok ? [] : Object.keys(ours.errors).sort();
			const theirKeys = theirs.success
				? []
				: [...new Set(theirs.error.issues.map((i) => String(i.path[0])))].sort();
			expect({ answers, ok: ours.ok, keys: ourKeys }).toEqual({
				answers,
				ok: theirs.success,
				keys: theirKeys,
			});
			if (ours.ok && theirs.success) expect(ours.values).toEqual(theirs.data);
			if (!ours.ok) rejected++;
		}
		// The probes must exercise refusals, not only acceptances.
		if (schema.fields.length > 0) expect(rejected).toBeGreaterThan(0);
	});
});
