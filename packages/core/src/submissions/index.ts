// Checking the answers to a form: normalise, then validate, on the server and,
// field by field, in the browser.
export type { SubmissionError, SubmissionErrorCode, SubmissionErrors } from "./errors.js";
export { normalizeSubmission } from "./normalize.js";
export {
	type SubmissionResult,
	type ValidateSubmissionOptions,
	validateFields,
	validateSubmission,
} from "./validate.js";
