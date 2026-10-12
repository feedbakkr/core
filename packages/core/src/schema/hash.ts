import { hashDsl } from "./schema-utils.js";

/**
 * JSON with object keys sorted at every level, so two schemas that differ only
 * in key order serialise identically. Array order is kept (field order
 * matters). Properties set to `undefined` are dropped, as `JSON.stringify` does.
 *
 * FeedBakkr's own `canonicalizeDsl` is plain `JSON.stringify`, which depends
 * on key order; it stays exported for comparing against hashes FeedBakkr has
 * already stored.
 */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}
	return value;
}

/** SHA-256 (hex) of the schema's canonical JSON. Stable across key order. */
export function hashSchema(schema: unknown): Promise<string> {
	return hashDsl(canonicalJson(schema));
}
