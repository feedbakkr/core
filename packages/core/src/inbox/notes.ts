import { type MessageAuthor, type MessageMeta, type MessageNote, NOTE_LIMITS } from "./model.js";

/** Why a change to a message's notes was refused. */
export type NoteErrorCode = "empty" | "too_long" | "too_many" | "not_found" | "not_allowed";

export type NoteResult =
	| { ok: true; meta: MessageMeta; note: MessageNote }
	| { ok: false; code: NoteErrorCode; message: string };

export type NoteRemoveResult =
	| { ok: true; meta: MessageMeta }
	| { ok: false; code: NoteErrorCode; message: string };

const refuse = (code: NoteErrorCode, message: string) => ({ ok: false as const, code, message });

function checkBody(body: string) {
	const text = body.trim();
	if (text === "") return refuse("empty", "Write something in the note");
	if (text.length > NOTE_LIMITS.maxLength) {
		return refuse("too_long", `A note can be at most ${NOTE_LIMITS.maxLength} characters`);
	}
	return { ok: true as const, text };
}

/**
 * Whether this person wrote the note. People with accounts match by user id;
 * authors without one (an app's staff signed by name) match by name.
 */
export function isNoteAuthor(note: MessageNote, person: MessageAuthor): boolean {
	if (note.author.userId || person.userId) return note.author.userId === person.userId;
	return note.author.name === person.name;
}

/** Adds a note at the end. The host gives the id and the time. */
export function addNote(
	meta: MessageMeta,
	input: { id: string; body: string; author: MessageAuthor; now: number },
): NoteResult {
	const body = checkBody(input.body);
	if (!body.ok) return body;
	if (meta.notes.length >= NOTE_LIMITS.maxNotes) {
		return refuse("too_many", `A message can have at most ${NOTE_LIMITS.maxNotes} notes`);
	}
	const note: MessageNote = {
		id: input.id,
		body: body.text,
		author: input.author,
		createdAt: input.now,
		updatedAt: null,
	};
	return { ok: true, meta: { ...meta, notes: [...meta.notes, note] }, note };
}

/** Changes a note's words. Only its author may. */
export function editNote(
	meta: MessageMeta,
	input: { id: string; body: string; editor: MessageAuthor; now: number },
): NoteResult {
	const existing = meta.notes.find((n) => n.id === input.id);
	if (!existing) return refuse("not_found", "That note is not on this message");
	if (!isNoteAuthor(existing, input.editor)) {
		return refuse("not_allowed", "Only the person who wrote a note can change it");
	}
	const body = checkBody(input.body);
	if (!body.ok) return body;
	const note: MessageNote = { ...existing, body: body.text, updatedAt: input.now };
	return {
		ok: true,
		meta: { ...meta, notes: meta.notes.map((n) => (n.id === note.id ? note : n)) },
		note,
	};
}

/**
 * Removes a note. Its author may; so may anyone the host lets remove any
 * note (`canRemoveAny`, such as an inbox's admins).
 */
export function removeNote(
	meta: MessageMeta,
	input: { id: string; by: MessageAuthor; canRemoveAny?: boolean },
): NoteRemoveResult {
	const existing = meta.notes.find((n) => n.id === input.id);
	if (!existing) return refuse("not_found", "That note is not on this message");
	if (!input.canRemoveAny && !isNoteAuthor(existing, input.by)) {
		return refuse("not_allowed", "Only the person who wrote a note can remove it");
	}
	return { ok: true, meta: { ...meta, notes: meta.notes.filter((n) => n.id !== input.id) } };
}
