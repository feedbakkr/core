import type { Condition, ConditionValue } from "../schema/schema-dsl-v2.js";

function given(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return value.trim() !== "";
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

function matches(value: unknown, wanted: ConditionValue): boolean {
	return Array.isArray(value) ? value.includes(wanted) : value === wanted;
}

/**
 * Whether a condition holds for these answers. Pass normalised answers (as
 * `normalizeSubmission` returns them), so "5" and 5, or "on" and true, compare
 * as the person meant.
 */
export function evaluateCondition(condition: Condition, values: Record<string, unknown>): boolean {
	if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, values));
	if ("any" in condition) return condition.any.some((c) => evaluateCondition(c, values));
	const value = values[condition.k];
	if ("eq" in condition) return given(value) && matches(value, condition.eq);
	if ("neq" in condition) return !(given(value) && matches(value, condition.neq));
	if ("in" in condition) return given(value) && condition.in.some((v) => matches(value, v));
	if ("filled" in condition) return given(value);
	return !given(value);
}
