import { describe, expect, it } from "vitest";
import { schemaDslV1Schema } from "../src/index.js";
import { parseFormDslText, schemaToTextDsl } from "../src/text/index.js";
import { allFixtures } from "./fixtures.js";

describe.each(allFixtures())("$name", ({ schema }) => {
	it("round-trips through the text format", () => {
		const parsed = schemaDslV1Schema.parse(schema);
		const result = parseFormDslText(schemaToTextDsl(parsed));
		if (!result.ok) throw new Error(JSON.stringify(result));
		expect(result.schema).toEqual(parsed);
	});
});
