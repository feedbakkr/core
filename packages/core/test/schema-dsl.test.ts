import { describe, expect, it } from "vitest";
import { type DslField, isFieldSensitive } from "../src/schema/schema-dsl.js";

const baseFor = (t: DslField["t"]): Partial<DslField> => ({ k: "k", label: "Label", t });

describe("isFieldSensitive (opt-in only)", () => {
	it("returns true only when the flag is explicitly true", () => {
		expect(isFieldSensitive({ ...baseFor("text"), sensitive: true } as DslField)).toBe(true);
		expect(isFieldSensitive({ ...baseFor("number"), sensitive: true } as DslField)).toBe(true);
		expect(isFieldSensitive({ ...baseFor("email"), sensitive: true } as DslField)).toBe(true);
	});

	it("returns false when the flag is undefined, regardless of field type", () => {
		expect(isFieldSensitive({ ...baseFor("text") } as DslField)).toBe(false);
		expect(isFieldSensitive({ ...baseFor("textarea") } as DslField)).toBe(false);
		expect(isFieldSensitive({ ...baseFor("email") } as DslField)).toBe(false);
		expect(isFieldSensitive({ ...baseFor("phone") } as DslField)).toBe(false);
		expect(isFieldSensitive({ ...baseFor("number") } as DslField)).toBe(false);
		expect(isFieldSensitive({ ...baseFor("date") } as DslField)).toBe(false);
		expect(isFieldSensitive({ ...baseFor("bool") } as DslField)).toBe(false);
	});

	it("returns false when the flag is explicitly false", () => {
		expect(isFieldSensitive({ ...baseFor("text"), sensitive: false } as DslField)).toBe(false);
		expect(isFieldSensitive({ ...baseFor("email"), sensitive: false } as DslField)).toBe(false);
	});
});
