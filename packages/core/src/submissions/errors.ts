/**
 * Why an answer was refused. The codes are stable, so an app can map them to
 * its own wording; `message` is an English default.
 */
export type SubmissionErrorCode =
	| "required"
	| "invalid_type"
	| "too_short"
	| "too_long"
	| "invalid_email"
	| "invalid_url"
	| "invalid_phone"
	| "invalid_date"
	| "invalid_datetime"
	| "invalid_time"
	| "invalid_range"
	| "out_of_range"
	| "not_integer"
	| "invalid_option"
	| "too_many_items"
	| "unknown_field";

export interface SubmissionError {
	code: SubmissionErrorCode;
	message: string;
	/** Where inside the answer, for lists (`[2]`) and date ranges (`["from"]`). */
	path?: (string | number)[];
}

/** Errors by field key. A field with no errors has no entry. */
export type SubmissionErrors = Record<string, SubmissionError[]>;

export function submissionError(
	code: SubmissionErrorCode,
	message: string,
	path?: (string | number)[],
): SubmissionError {
	return path && path.length > 0 ? { code, message, path } : { code, message };
}
