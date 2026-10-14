// Managing received messages in one inbox: statuses, notes, who sent a
// message and where a reply goes. Pure and storage-free, like the rest of
// the library entries; the host stores messages and decides who may act.
export {
	emptyMessageMeta,
	isMessageStatus,
	MESSAGE_STATUSES,
	type MessageAuthor,
	type MessageMeta,
	type MessageNote,
	type MessageSender,
	type MessageStatus,
	messageAuthorSchema,
	messageMetaSchema,
	messageNoteSchema,
	NOTE_LIMITS,
	parseMessageMeta,
	replyAddress,
	WAITING_STATUSES,
} from "./model.js";
export {
	addNote,
	editNote,
	isNoteAuthor,
	type NoteErrorCode,
	type NoteRemoveResult,
	type NoteResult,
	removeNote,
} from "./notes.js";
