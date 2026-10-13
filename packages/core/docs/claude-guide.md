# Working with FeedBakkr Core: notes for Claude

This file is for coding agents working in an app that uses
`@ai-food-focus/feedbakkr-core`. Read it before writing or changing a form.

## What core is for

Core holds the form schema format and the code that checks it:

- A **schema** describes a form's fields. The format is in
  [schema-guide.md](schema-guide.md). Read that before writing a schema.
- `validateSchema(schema, { publish: true })` checks a schema is complete
  and correct.
- `validateSubmission(schema, answers)` checks the answers on the server,
  and `prepareMessage(schema, answers)` checks them and returns everything
  to store: the clean values, display rows, a one-line summary, the schema's
  hash and search text.
- `useFeedbakkrForm(schema)` (from `/react`) holds form state and runs the
  same checks in the browser, for forms built from the app's own components.
- `parseFormDslText` and `schemaToTextDsl` convert to and from the text
  format.
- `hashSchema(schema)` gives a stable id for a schema version.

It runs in Workers, Node and browsers, and depends only on `zod`. The
React form, `DynamicForm`, and the builder, `FeedbakkrBuilder`, are separate
entries, `/react` and `/builder`, so servers never load React.

## Tools

When the `feedbakkr` MCP server is connected, use its tools:

| Tool | Use it to |
| --- | --- |
| `schema_guide` | Read the schema format before writing one. |
| `validate_schema` | Check every schema you write or change. Pass `"publish": true` for real forms. |
| `schema_from_text` | Turn the text format into a JSON schema, checked. |
| `schema_to_text` | Show a JSON schema as text, which is easier to review. |
| `sample_payload` | Get example answers that pass the schema, for tests and fixtures. |
| `validate_submission` | Check answers exactly as the server will, with error codes. |
| `interpret_submission` | See answers as an inbox shows them: labels, readable values, the summary. |

Without MCP, the same comes from the CLI:

```bash
pnpm exec feedbakkr guide                     # the schema format
pnpm exec feedbakkr validate --publish form.json
pnpm exec feedbakkr text form.json            # JSON to text, or text to JSON
pnpm exec feedbakkr sample form.json          # example answers
```

## Rules when adding a form

1. **Write the schema first and validate it** with `validate_schema` and
   `"publish": true`. Fix every issue before writing UI or routes.
2. **One schema, both sides.** The page and the server route must use the
   same schema object. Put it in one module and import it in both places.
   Never copy it.
3. **The server always checks the answers.** In the route that receives a
   submission, run `validateSubmission(schema, answers)` (or
   `prepareMessage`, which runs it) and reject the request when it fails.
   Store `values` from the result, never the raw answers. Browser checks are
   for the person filling in the form, not for security.
4. **Check schemas that people edit.** Where a schema is saved from an
   editor or an API, run `validateSchema` on the server before storing it,
   with `publish: true` when it goes live.
5. **Store which version an answer was checked against.** Save
   `schemaHash` from `prepareMessage` (or `await hashSchema(schema)`) with
   each submission, and keep that schema, so old answers can still be read
   after the form changes.
6. **Give required text a minimum.** `validateSubmission` refuses a blank
   required answer, but `DynamicForm` checks with FeedBakkr's rules, which
   accept an empty string unless the field has `"min": 1`.

## Example: a form defined in code

```ts
// forms/contact.ts: imported by the page and by the route
import type { SchemaDslV1 } from "@ai-food-focus/feedbakkr-core";

export const contactForm = {
	v: 1,
	title: "Contact us",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, min: 1, max: 100 },
		{ k: "email", label: "Email", t: "email", req: true },
		{ k: "message", label: "Message", t: "textarea", req: true, min: 10, max: 2000 },
	],
	preview: { mode: "custom", fields: ["name"] },
} satisfies SchemaDslV1;
```

```ts
// in the route
import { prepareMessage } from "@ai-food-focus/feedbakkr-core";
import { contactForm } from "../forms/contact.js";

const message = await prepareMessage(contactForm, body.answers);
if (!message.ok) {
	return c.json({ error: "invalid_answers", errors: message.errors }, 400);
}
// Store message.values, message.summary, message.searchText and
// message.schemaHash; show message.rows in emails and the inbox.
```

`errors` is keyed by field: `{ email: [{ code: "invalid_email", message:
"Invalid email address" }] }`. The codes (`required`, `too_long`,
`invalid_option`, `unknown_field` and so on) are stable, so the page can map
them to its own wording.

Add a test that runs `validateSchema(contactForm, { publish: true })` and
expects `ok: true`, so a later edit cannot break the form unnoticed.

## Letting people edit a form

`FeedbakkrBuilder` from `@ai-food-focus/feedbakkr-core/builder` is the form
builder. The app loads the schema, passes it as `value`, and saves it in
`onSave`, which the builder calls only after `validateSchema` passes. Import
`@ai-food-focus/feedbakkr-core/builder.css` once. The route that stores the
schema must still run `validateSchema` (rule 4), with `publish: true` when it
goes live. See the README for its props and peer dependencies.

## Building the form from the app's components

`useFeedbakkrForm` from `@ai-food-focus/feedbakkr-core/react` holds the
answers and errors and runs the server's checks in the browser. It renders
nothing, so the page uses its own inputs:

```tsx
import { useFeedbakkrForm } from "@ai-food-focus/feedbakkr-core/react";
import { contactForm } from "../forms/contact.js";

const form = useFeedbakkrForm(contactForm, {
	onSubmit: async (values) => {
		const res = await send(values);
		if (res.errors) form.setErrors(res.errors); // errors from the route
	},
});

<form onSubmit={form.handleSubmit} noValidate>
	{form.fields.map((field) => (
		<TextField
			key={field.k}
			label={field.label}
			value={String(form.values[field.k] ?? "")}
			onChange={(v) => form.setValue(field.k, v)}
			onBlur={() => form.blur(field.k)}
			error={form.errorFor(field.k)}
		/>
	))}
	<Button type="submit" disabled={form.submitting}>Send</Button>
</form>;
```

- `fields` leaves out hidden fields; pass their values in `initialValues`.
- A field is checked when the person leaves it; `validate(keys)` checks a
  step of a multi-step form.
- `onSubmit` receives the normalised values, only when every field passes.

## Showing a form without custom components

`DynamicForm` from `@ai-food-focus/feedbakkr-core/react` renders any v1
schema (React 19):

```tsx
// in the page
import { DynamicForm } from "@ai-food-focus/feedbakkr-core/react";
import { contactForm } from "../forms/contact.js";

<DynamicForm
	schema={contactForm}
	initialValues={{ source_page: location.href }}
	submitting={sending}
	onSubmit={(answers) => send(answers)}
	className="contact-form"
/>;
```

- It checks the answers with `generateZod` before calling `onSubmit`, and
  shows the first problem under each field. The route must still check them
  (rule 3).
- `onSubmit` gets the checked answers. Errors from the server are not shown
  by the form, so show them on the page.
- Hidden fields are not rendered. Fill them through `initialValues`.
- `submitting` disables the Submit button. `renderFooter` replaces the
  button with your own.
- The look is fixed: plain inputs with inline styles and English text
  ("Submit", "Select..."). `className` and `style` go on the `<form>`
  element. When the app needs its own components, build the form from the
  schema's fields instead, and keep rules 2 and 3.
- Errors are not yet linked to their inputs for screen readers. A renderer
  that can be styled comes in a later release; until then, use the hook.
