// Turning checked answers into a message: display rows, the inbox summary,
// and the whole pipeline in one call.
export { type InterpretOptions, interpretSubmission, type SubmissionRow } from "./interpret.js";
export { type PreparedMessage, type PrepareMessageResult, prepareMessage } from "./prepare.js";
export { summarizeSubmission } from "./summarize.js";
