import { describe, expect, it } from "vitest";
import { evaluateCondition, visibleSections } from "../dist/conditions.js";
import { generateJsonSchema } from "../dist/export.js";
import { prepareMessage, validateFields, validateSchema } from "../dist/index.js";
import { parseFormDslText, schemaToTextDsl } from "../dist/text.js";

/* Schema v2 in workerd: parsing, conditions, per-section and whole checks. */

const text = `@version 2
@title Work with us
@section you "About you"
name: text "Your name" required
kind: fixed "Enquiry type" required
  - supplier "I'm a supplier"
  - other "Something else"
@section business "Your business" when kind = supplier
volume: integer "Monthly volume" required min=1 help="Cases a month"
@section request "Your request"
details: textarea "Details" required min=10`;

describe("schema v2 in the Workers runtime", () => {
	it("reads, checks and prepares a conditional enquiry", async () => {
		const parsed = parseFormDslText(text);
		if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
		const checked = validateSchema(parsed.schema, { allowV2: true, publish: true });
		if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
		const schema = checked.schema;
		expect(parseFormDslText(schemaToTextDsl(schema))).toEqual({ ok: true, schema });

		const supplier = { name: "Jane", kind: "supplier", details: "We supply cheese." };
		expect(visibleSections(schema, supplier).map((s) => s.id)).toEqual([
			"you",
			"business",
			"request",
		]);
		expect(validateFields(schema, supplier, ["volume"]).errors.volume?.[0]?.code).toBe("required");

		const other = await prepareMessage(schema, { ...supplier, kind: "other", volume: "9" });
		if (!other.ok) throw new Error(JSON.stringify(other.errors));
		expect(other.values).toEqual({ name: "Jane", kind: "other", details: "We supply cheese." });
		expect(other.rows.map((r) => r.section)).toEqual(["you", "you", "request"]);
		expect(evaluateCondition({ k: "kind", eq: "other" }, other.values)).toBe(true);
		expect(generateJsonSchema(schema)).toHaveProperty("allOf");
	});
});
