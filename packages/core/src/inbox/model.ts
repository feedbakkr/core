import { z } from "zod";

// One inbox and its messages: statuses, flags, notes, who sent a message and
// where a reply goes. Storage-free: the host keeps the message however it
// likes and calls these to change it. There are no workspaces, projects or
// channels; an app that has several inboxes keeps them apart itself.

/** Where a message stands. New until someone opens it; closed once dealt with. */
export const MESSAGE_STATUSES = ["new", "open", "closed", "spam"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** The statuses still waiting for someone: what an inbox shows first. */
export const WAITING_STATUSES: readonly MessageStatus[] = ["new", "open"];

export function isMessageStatus(value: unknown): value is MessageStatus {
	return (MESSAGE_STATUSES as readonly unknown[]).includes(value);
}

/**
 * Who wrote a note or changed a message. `name` is always shown; `userId`
 * is set when the person has an account in the host app. An app without
 * accounts for its staff signs them with a name alone ("Support team").
 */
export interface MessageAuthor {
	userId?: string;
	name: string;
}

/**
 * Who sent the message: the host's signed-in user, copied when it arrived.
 * Never read from the answers; a message sent by someone not signed in has
 * no sender. Where to reply is `replyTo`, from the form.
 */
export interface MessageSender {
	userId: string;
	name: string | null;
	email: string | null;
}

/** An internal note on a message, seen by the people who manage the inbox only. */
export interface MessageNote {
	id: string;
	body: string;
	author: MessageAuthor;
	createdAt: number;
	/** When it was last edited, or null if never. */
	updatedAt: number | null;
}

/** What a message keeps beside its answers and status. Versioned, so it can grow. */
export interface MessageMeta {
	v: 1;
	notes: MessageNote[];
}

/** How many notes a message holds, and how long one may be. */
export const NOTE_LIMITS = { maxNotes: 50, maxLength: 1000 } as const;

export const messageAuthorSchema = z.object({
	userId: z.string().min(1).max(100).optional(),
	name: z.string().min(1).max(120),
});

export const messageNoteSchema = z.object({
	id: z.string().min(1).max(100),
	body: z.string().min(1).max(NOTE_LIMITS.maxLength),
	author: messageAuthorSchema,
	createdAt: z.number().int(),
	updatedAt: z.number().int().nullable(),
});

export const messageMetaSchema = z.object({
	v: z.literal(1),
	notes: z.array(messageNoteSchema).max(NOTE_LIMITS.maxNotes),
});

/** A message's meta when it has none yet. */
export function emptyMessageMeta(): MessageMeta {
	return { v: 1, notes: [] };
}

/**
 * Reads stored meta (parsed JSON, or the JSON text itself). Missing or
 * unreadable meta reads as empty, so a message from before meta existed, or
 * a damaged one, still opens.
 */
export function parseMessageMeta(input: unknown): MessageMeta {
	let value = input;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return emptyMessageMeta();
		}
	}
	const parsed = messageMetaSchema.safeParse(value);
	return parsed.success ? (parsed.data as MessageMeta) : emptyMessageMeta();
}

/**
 * The address a reply goes to: the form's reply address, or else the
 * signed-in sender's own email. Null when there is neither.
 */
export function replyAddress(message: {
	replyTo: string | null;
	sender: MessageSender | null;
}): string | null {
	return message.replyTo ?? message.sender?.email ?? null;
}
