import { describe, expect, it } from "vitest";
import { generateJsonSchema, generateZodCode } from "../src/export/index.js";
import { generateZod, schemaDslV1Schema, validateSchema } from "../src/index.js";
import { allFixtures, platformFixtures, templateFixtures } from "./fixtures.js";

describe("fixture set", () => {
	it("has all 74 templates and all 4 platform forms", () => {
		expect(templateFixtures()).toHaveLength(74);
		expect(platformFixtures()).toHaveLength(4);
	});
});

// These marketplace templates name a number or date field in their inbox
// preview, which FeedBakkr's own publish check rejects ("not previewable").
// FeedBakkr installs templates as they are, so a channel made from one of
// them cannot be published until its preview is changed. Core keeps the same
// verdict; the templates themselves are a FeedBakkr maintenance item.
const KNOWN_UNPUBLISHABLE = new Set([
	"template beta-nps-feedback",
	"template beta-usability-feedback",
	"template event-venue-enquiry",
	"template event-webinar-feedback",
	"template general-beta-feedback",
	"template nps-survey",
	"template onboarding-feedback",
	"template post-purchase-feedback",
	"template rating-comment-widget",
	"template support-interaction-feedback",
]);

describe.each(allFixtures())("$name", ({ name, schema }) => {
	it("passes the draft save checks", () => {
		const result = validateSchema(schema);
		expect(result.issues).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it("gets FeedBakkr's verdict from the publish checks", () => {
		const result = validateSchema(schema, { publish: true });
		if (KNOWN_UNPUBLISHABLE.has(name)) {
			expect(result.ok).toBe(false);
			expect(result.issues.every((i) => i.code === "not_publishable")).toBe(true);
			expect(result.issues.every((i) => i.message.includes("not previewable"))).toBe(true);
		} else {
			expect(result.issues).toEqual([]);
		}
	});

	it("parses without losing or changing anything", () => {
		expect(schemaDslV1Schema.parse(schema)).toEqual(schema);
	});

	it("builds a payload validator and both exports", () => {
		const parsed = schemaDslV1Schema.parse(schema);
		expect(() => generateZod(parsed)).not.toThrow();
		expect(generateJsonSchema(parsed)).toHaveProperty("type", "object");
		expect(generateZodCode(parsed)).toContain("z.object(");
	});
});
