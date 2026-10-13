import { hashSchema } from "../schema/hash.js";
import type { SchemaDsl } from "../schema/schema-dsl-v2.js";
import type { SubmissionErrors } from "../submissions/errors.js";
import { type ValidateSubmissionOptions, validateSubmission } from "../submissions/validate.js";
import { type InterpretOptions, interpretSubmission, type SubmissionRow } from "./interpret.js";
import { summarizeSubmission } from "./summarize.js";

/** Everything to store for one accepted submission. */
export interface PreparedMessage {
	/** The checked, normalised answers. */
	values: Record<string, unknown>;
	/** The answers as display rows (see `interpretSubmission`). */
	rows: SubmissionRow[];
	/** The one-line inbox summary (see `summarizeSubmission`). */
	summary: string;
	/** `hashSchema(schema)`: which version of the form the answers belong to. */
	schemaHash: string;
	/** Plain text of every answer that is not sensitive, for search. */
	searchText: string;
}

export type PrepareMessageResult =
	| ({ ok: true } & PreparedMessage)
	| { ok: false; values: Record<string, unknown>; errors: SubmissionErrors };

/**
 * Turns raw answers into a message to store: checks them with
 * `validateSubmission`, then adds display rows, the inbox summary, the
 * schema's hash and search text. Refused answers come back with their errors
 * and nothing else.
 */
export async function prepareMessage(
	schema: SchemaDsl,
	raw: unknown,
	options: ValidateSubmissionOptions & InterpretOptions = {},
): Promise<PrepareMessageResult> {
	const checked = validateSubmission(schema, raw, options);
	if (!checked.ok) return checked;
	const rows = interpretSubmission(schema, checked.values, options);
	const searchText = rows
		.filter((row) => row.value !== null && !row.sensitive)
		.map((row) => row.display)
		.join("\n");
	return {
		ok: true,
		values: checked.values,
		rows,
		summary: summarizeSubmission(schema, checked.values),
		schemaHash: await hashSchema(schema),
		searchText,
	};
}
