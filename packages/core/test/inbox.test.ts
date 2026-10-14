import { describe, expect, it } from "vitest";
import { usesV2 } from "../src/builder/v2-ops.js";
import {
	addNote,
	editNote,
	emptyMessageMeta,
	isMessageStatus,
	type MessageAuthor,
	type MessageMeta,
	NOTE_LIMITS,
	parseMessageMeta,
	removeNote,
	replyAddress,
} from "../src/inbox/index.js";
import { prepareMessage, replyToOf } from "../src/messages/index.js";
import type { SchemaDslV2 } from "../src/schema/schema-dsl-v2.js";
import { validateSchema } from "../src/schema/validate-schema.js";
import { parseFormDslText, schemaToTextDsl } from "../src/text/index.js";

const admin = { name: "Support team" };
const sam = { userId: "u1", name: "Sam Lee" };
const kim = { userId: "u2", name: "Kim Ode" };

function withNote(author: MessageAuthor = sam): MessageMeta {
	const r = addNote(emptyMessageMeta(), { id: "n1", body: " Called back ", author, now: 10 });
	if (!r.ok) throw new Error(r.message);
	return r.meta;
}

describe("statuses", () => {
	it("knows the four", () => {
		expect(isMessageStatus("closed")).toBe(true);
		expect(isMessageStatus("archived")).toBe(false);
	});
});

describe("message meta", () => {
	it("reads stored JSON, and reads anything unreadable as empty", () => {
		const meta = withNote();
		expect(parseMessageMeta(JSON.stringify(meta))).toEqual(meta);
		expect(parseMessageMeta(meta)).toEqual(meta);
		for (const bad of [null, undefined, "", "{", { v: 2, notes: [] }, { v: 1, notes: [{}] }]) {
			expect(parseMessageMeta(bad)).toEqual(emptyMessageMeta());
		}
	});
});

describe("notes", () => {
	it("adds a trimmed note at the end, and never changes the meta it was given", () => {
		const before = emptyMessageMeta();
		const r = addNote(before, { id: "n1", body: " Called back ", author: sam, now: 10 });
		expect(r.ok && r.meta.notes).toEqual([
			{ id: "n1", body: "Called back", author: sam, createdAt: 10, updatedAt: null },
		]);
		expect(before.notes).toEqual([]);
	});

	it("refuses an empty note, a long one, and one too many", () => {
		const meta = emptyMessageMeta();
		const add = (body: string, m = meta) => addNote(m, { id: "x", body, author: sam, now: 1 });
		expect(add("   ")).toMatchObject({ ok: false, code: "empty" });
		expect(add("a".repeat(NOTE_LIMITS.maxLength + 1))).toMatchObject({
			ok: false,
			code: "too_long",
		});
		expect(add("a".repeat(NOTE_LIMITS.maxLength)).ok).toBe(true);
		const full: MessageMeta = {
			v: 1,
			notes: Array.from({ length: NOTE_LIMITS.maxNotes }, (_, i) => ({
				id: `n${i}`,
				body: "x",
				author: sam,
				createdAt: i,
				updatedAt: null,
			})),
		};
		expect(add("one more", full)).toMatchObject({ ok: false, code: "too_many" });
	});

	it("lets only the author edit, by user id, or by name for authors without one", () => {
		const meta = withNote();
		expect(editNote(meta, { id: "n1", body: "x", editor: kim, now: 20 })).toMatchObject({
			ok: false,
			code: "not_allowed",
		});
		// Same name, no account: not the author.
		expect(editNote(meta, { id: "n1", body: "x", editor: { name: "Sam Lee" }, now: 20 }).ok).toBe(
			false,
		);
		const edited = editNote(meta, { id: "n1", body: "Called back twice", editor: sam, now: 20 });
		expect(edited.ok && edited.note).toMatchObject({ body: "Called back twice", updatedAt: 20 });

		const staff = withNote(admin);
		expect(
			editNote(staff, { id: "n1", body: "y", editor: { name: "Support team" }, now: 2 }).ok,
		).toBe(true);
		expect(editNote(staff, { id: "n9", body: "y", editor: admin, now: 2 })).toMatchObject({
			code: "not_found",
		});
	});

	it("lets the author remove a note, and anyone the host allows", () => {
		const meta = withNote();
		expect(removeNote(meta, { id: "n1", by: kim })).toMatchObject({ code: "not_allowed" });
		expect(removeNote(meta, { id: "n1", by: kim, canRemoveAny: true })).toEqual({
			ok: true,
			meta: emptyMessageMeta(),
		});
		expect(removeNote(meta, { id: "n1", by: sam }).ok).toBe(true);
	});
});

const enquiry: SchemaDslV2 = {
	v: 2,
	fields: [
		{ k: "name", label: "Name", t: "text", req: true },
		{ k: "email", label: "Your email", t: "email", req: true, replyTo: true },
		{ k: "supplier", label: "Supplier's email", t: "email" },
	],
};

describe("the reply address", () => {
	it("is the answer to the marked field only", async () => {
		const values = { name: "Jo", email: " jo@example.com ", supplier: "s@example.com" };
		expect(replyToOf(enquiry, values)).toBe("jo@example.com");
		const unmarked = { ...enquiry, fields: enquiry.fields.map(({ replyTo: _r, ...f }) => f) };
		expect(replyToOf(unmarked as SchemaDslV2, values)).toBeNull();
		const prepared = await prepareMessage(enquiry, values);
		expect(prepared.ok && prepared.replyTo).toBe("jo@example.com");
	});

	it("falls back to the signed-in sender's email", () => {
		const sender = { userId: "u1", name: "Sam", email: "sam@acme.com" };
		expect(replyAddress({ replyTo: "jo@example.com", sender })).toBe("jo@example.com");
		expect(replyAddress({ replyTo: null, sender })).toBe("sam@acme.com");
		expect(replyAddress({ replyTo: null, sender: null })).toBeNull();
	});

	it("is a v2 key, on one email field at most", () => {
		expect(validateSchema(enquiry, { allowV2: true }).ok).toBe(true);
		expect(usesV2({ ...enquiry, v: 1 } as never)).toBe(true);
		const onText = {
			...enquiry,
			fields: [{ k: "name", label: "Name", t: "text", replyTo: true }],
		};
		const refused = validateSchema(onText, { allowV2: true });
		expect(!refused.ok && refused.issues[0]?.message).toContain("not an email field");
		const two = {
			...enquiry,
			fields: enquiry.fields.map((f) => (f.k === "supplier" ? { ...f, replyTo: true } : f)),
		};
		const twice = validateSchema(two, { allowV2: true });
		expect(!twice.ok && twice.issues[0]?.message).toBe("Only one field can be the reply address");
		// A v1 schema does not carry it, as FeedBakkr's v1 readers would not.
		const v1 = validateSchema({ ...enquiry, v: 1 });
		expect(v1.ok && v1.schema.fields.some((f) => "replyTo" in f)).toBe(false);
	});

	it("round-trips through the text format as reply-to", () => {
		const text = schemaToTextDsl(enquiry);
		expect(text).toContain("reply-to");
		expect(parseFormDslText(text)).toEqual({ ok: true, schema: enquiry });
		const v1Text = text.replace("@version 2", "");
		expect(parseFormDslText(v1Text).ok).toBe(false);
	});
});
