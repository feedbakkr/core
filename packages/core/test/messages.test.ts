// interpretSubmission, summarizeSubmission and prepareMessage.
import { describe, expect, it } from "vitest";
import { interpretSubmission, prepareMessage, summarizeSubmission } from "../src/messages/index.js";
import { generateSampleData } from "../src/schema/generate-sample-data.js";
import { hashSchema } from "../src/schema/hash.js";
import { type SchemaDslV1, schemaDslV1Schema } from "../src/schema/schema-dsl.js";
import { allFixtures } from "./fixtures.js";
import { generatePreviewText as refPreview } from "./reference/feedbakkr-8ae744e/preview-generation.js";

const enquiry: SchemaDslV1 = {
	v: 1,
	title: "Enquiry",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true },
		{ k: "email", label: "Email", t: "email", req: true },
		{
			k: "enquiryType",
			label: "Enquiry type",
			t: "fixed",
			opts: [{ k: "supplier", label: "I'm a supplier" }, { k: "other" }],
		},
		{ k: "volume", label: "Expected monthly volume", t: "number" },
		{ k: "visit", label: "Visit", t: "date" },
		{ k: "call", label: "Call", t: "datetime" },
		{ k: "stay", label: "Stay", t: "daterange" },
		{ k: "news", label: "Send me news", t: "bool" },
		{
			k: "needs",
			label: "Dietary needs",
			t: "dynlist",
			item: {
				k: "need",
				label: "Need",
				t: "fixed",
				opts: [{ k: "vegan", label: "Vegan" }, { k: "gf" }],
			},
		},
		{ k: "notes", label: "Notes", t: "markdown" },
		{ k: "dob", label: "Date of birth", t: "date", sensitive: true },
		{ k: "page", label: "Page", t: "url", hidden: true },
	],
	preview: { mode: "custom", fields: ["name", "enquiryType"] },
};

const answers = {
	name: "Jane Smith",
	email: "jane@example.com",
	enquiryType: "supplier",
	visit: "2026-06-15",
	call: "2026-06-15T09:30",
	stay: { from: "2026-07-01", to: "2026-07-03" },
	news: false,
	needs: ["vegan", "gf"],
	notes: "**Hello**",
	dob: "1990-02-01",
	page: "https://example.com/contact",
};

describe("interpretSubmission", () => {
	const rows = interpretSubmission(enquiry, answers);
	const row = (key: string) => rows.find((r) => r.key === key);

	it("gives one row per field, in the schema's order", () => {
		expect(rows.map((r) => r.key)).toEqual(enquiry.fields.map((f) => f.k));
		expect(row("name")).toEqual({
			key: "name",
			label: "Your name",
			type: "text",
			value: "Jane Smith",
			display: "Jane Smith",
		});
	});

	it("shows option labels, Yes or No, and readable dates", () => {
		expect(row("enquiryType")?.display).toBe("I'm a supplier");
		expect(row("news")?.display).toBe("No");
		expect(row("visit")?.display).toBe("15 June 2026");
		expect(row("call")?.display).toBe("15 June 2026, 09:30");
		expect(row("stay")?.display).toBe("1 July 2026 to 3 July 2026");
	});

	it("lists list entries, with option labels, and an option without one by its key", () => {
		expect(row("needs")).toMatchObject({ display: "Vegan, gf", items: ["Vegan", "gf"] });
	});

	it("marks Markdown, hidden and sensitive fields, and fields with no answer", () => {
		expect(row("notes")).toMatchObject({ markdown: true, display: "**Hello**" });
		expect(row("page")).toMatchObject({ hidden: true });
		expect(row("dob")).toMatchObject({ sensitive: true });
		expect(row("volume")).toMatchObject({ value: null, display: "Not provided" });
	});

	it("takes a locale and the wording for a missing answer", () => {
		const us = interpretSubmission(enquiry, answers, { locale: "en-US", notProvided: "None" });
		expect(us.find((r) => r.key === "visit")?.display).toBe("June 15, 2026");
		expect(us.find((r) => r.key === "volume")?.display).toBe("None");
	});
});

describe("summarizeSubmission", () => {
	it("follows the preview setting", () => {
		expect(summarizeSubmission(enquiry, answers)).toBe("Jane Smith · I'm a supplier");
		expect(summarizeSubmission({ ...enquiry, preview: { mode: "none" } }, answers)).toBe("");
	});

	// Differences from FeedBakkr's generatePreviewText (the reference copy).
	it("1. uses email, url and phone answers, which FeedBakkr showed as nothing", () => {
		const byEmail = { ...enquiry, preview: { mode: "custom" as const, fields: ["email"] } };
		expect(refPreview(byEmail, answers)).toBe("");
		expect(summarizeSubmission(byEmail, answers)).toBe("jane@example.com");
	});

	it("2. skips sensitive fields itself; FeedBakkr's caller removed them first", () => {
		const schema: SchemaDslV1 = {
			v: 1,
			fields: [{ k: "secret", label: "Secret", t: "text", sensitive: true }],
			preview: { mode: "auto" },
		};
		expect(refPreview(schema, { secret: "x" })).toBe("x");
		expect(summarizeSubmission(schema, { secret: "x" })).toBe("");
	});

	it("matches FeedBakkr on every fixture without email, url or phone fields", () => {
		let compared = 0;
		for (const { schema: raw } of allFixtures()) {
			const schema = schemaDslV1Schema.parse(raw);
			if (schema.fields.some((f) => ["email", "url", "phone"].includes(f.t))) continue;
			for (let i = 0; i < 3; i++) {
				const values = generateSampleData(schema);
				// FeedBakkr removed sensitive fields before summarising.
				const plaintext = Object.fromEntries(
					Object.entries(values).filter(
						([k]) => schema.fields.find((f) => f.k === k)?.sensitive !== true,
					),
				);
				expect(summarizeSubmission(schema, values)).toBe(refPreview(schema, plaintext));
			}
			compared++;
		}
		expect(compared).toBeGreaterThan(20);
	});
});

describe("prepareMessage", () => {
	it("checks, interprets, summarises and hashes in one call", async () => {
		const result = await prepareMessage(enquiry, { ...answers, name: "  Jane Smith " });
		if (!result.ok) throw new Error(JSON.stringify(result.errors));
		expect(result.values.name).toBe("Jane Smith");
		expect(result.rows).toEqual(interpretSubmission(enquiry, result.values));
		expect(result.summary).toBe("Jane Smith · I'm a supplier");
		expect(result.schemaHash).toBe(await hashSchema(enquiry));
		expect(result.searchText).toContain("jane@example.com");
		expect(result.searchText).toContain("I'm a supplier");
		expect(result.searchText).not.toContain("1990");
		expect(result.searchText).not.toContain("Not provided");
	});

	it("returns only the errors for refused answers", async () => {
		expect(await prepareMessage(enquiry, { email: "nope" })).toEqual({
			ok: false,
			values: { email: "nope" },
			errors: {
				name: [{ code: "required", message: "Required" }],
				email: [{ code: "invalid_email", message: "Invalid email address" }],
			},
		});
	});
});
