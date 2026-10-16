# @ai-food-focus/feedbakkr-core

FeedBakkr's form schema format and its checks, the pipeline that checks and
stores answers, and the text format, as pure TypeScript with `zod` as the
only dependency. It runs in Cloudflare Workers, Node and browsers. A React
form, a form hook and the form builder are separate entries.

## Entry points

| Import | What it holds |
| --- | --- |
| `@ai-food-focus/feedbakkr-core` | `/schema`, `/submissions` and `/messages` together: what a server needs |
| `@ai-food-focus/feedbakkr-core/schema` | Schema DSL v1 types and Zod schema, `validateSchema`, `generateZod`, `hashSchema`, sample data, date bounds, preview helpers |
| `@ai-food-focus/feedbakkr-core/submissions` | `validateSubmission`, `validateFields`, `normalizeSubmission`, error codes |
| `@ai-food-focus/feedbakkr-core/messages` | `prepareMessage`, `interpretSubmission`, `summarizeSubmission`, `replyToOf` |
| `@ai-food-focus/feedbakkr-core/inbox` | Managing received messages in one inbox: statuses, notes (`addNote`, `editNote`, `removeNote`), `MessageMeta`, `MessageSender`, `replyAddress` |
| `@ai-food-focus/feedbakkr-core/conditions` | Schema v2: `evaluateCondition`, `visibleFields`, `visibleSections`, `resolveForm` |
| `@ai-food-focus/feedbakkr-core/form` | Form state as plain data: `createFormState`, `setValue`, `checkFields` |
| `@ai-food-focus/feedbakkr-core/text` | `parseFormDslText`, `schemaToTextDsl` |
| `@ai-food-focus/feedbakkr-core/export` | `generateJsonSchema`, `generateZodCode` |
| `@ai-food-focus/feedbakkr-core/react` | `FeedbakkrForm`, `useFeedbakkrForm` and `DynamicForm`. Needs `react` 19, an optional peer dependency that only this entry imports. |
| `@ai-food-focus/feedbakkr-core/builder` | `FeedbakkrBuilder`, the form builder. Needs the optional peer dependencies below and `builder.css`. |
| `@ai-food-focus/feedbakkr-core/builder.css` | The builder's stylesheet. |

## Check a schema

```ts
import { validateSchema } from "@ai-food-focus/feedbakkr-core";

const result = validateSchema(input, { publish: true });
if (!result.ok) {
	// result.issues: [{ code: "invalid_structure" | "invalid_default" | "not_publishable", message, path }]
}
```

Without `publish: true` it runs the checks FeedBakkr runs when a draft is
saved (structure and defaults). With it, it also runs the publish checks
(at least one field, unique keys, a valid preview).

## Schema v2: conditions and sections

A v2 schema (`"v": 2`) is v1 plus `when` conditions on fields and sections,
`sections` that group the fields, and `help` and `placeholder` text. v1 is
unchanged, and FeedBakkr's own parser rejects v2, so an old reader fails
loudly instead of dropping conditions. The format is in
[docs/schema-guide.md](docs/schema-guide.md#schema-v2-conditions-and-sections).

- `validateSchema(input, { allowV2: true })` accepts either version; without
  `allowV2` a v2 schema is refused, so a v1-only app cannot take one in.
  `maxFields` caps the number of fields (v2 has no cap of its own; v1 keeps
  FeedBakkr's 25).
- A condition names only earlier fields, so there are no cycles and a form
  is judged top to bottom in one pass. A field whose condition does not hold
  is not checked, not required, and its answer is dropped.
- `validateSubmission`, `validateFields`, `prepareMessage`, the form state
  and the hook all follow conditions. `sectionStatus` (in `/form`) and
  `form.sections` give each section's fields and whether they pass.
- The text format writes v2 with `@version 2`, `@section` lines and
  `when <condition>`. JSON Schema and Zod code exports express conditions
  with `if`/`then` and `superRefine`; a test runs both, and
  `validateSubmission`, over thousands of answer combinations and requires
  the same verdict.
- `FeedbakkrForm` and the builder handle v2. `DynamicForm` and `generateZod`
  stay v1 only, as FeedBakkr's.

## Check and store answers

```ts
import { prepareMessage } from "@ai-food-focus/feedbakkr-core";

const message = await prepareMessage(schema, body.answers);
if (!message.ok) return json({ errors: message.errors }, 400);
// message.values      the checked answers, to store
// message.rows        one row per field: label, value, display text
// message.summary     the one-line inbox summary
// message.schemaHash  which version of the schema the answers belong to
// message.searchText  plain text of the answers that are not sensitive
```

`prepareMessage` runs these steps, each available on its own:

1. `normalizeSubmission(schema, raw)`: trims text; an empty or blank answer
   and `null` count as not given; numbers and yes or no are read from form
   text; empty list entries are dropped; a hidden field that was not given
   takes its default. Only the schema's fields are kept.
2. `validateSubmission(schema, raw, { unknownFields })`: normalises, then
   checks every answer. A blank required answer is refused, and so are
   answers to keys the schema does not have, unless `unknownFields: "strip"`.
   Errors are keyed by field, each `{ code, message, path? }`, with stable
   codes: `required`, `invalid_type`, `too_short`, `too_long`,
   `invalid_email`, `invalid_url`, `invalid_phone`, `invalid_date`,
   `invalid_datetime`, `invalid_time`, `invalid_range`, `out_of_range`,
   `not_integer`, `invalid_option`, `too_many_items`, `unknown_field`.
3. `interpretSubmission(schema, values)`: display rows in schema order, with
   option labels, Yes or No, and dates written out ("15 June 2026"), plain
   text only. Fields with no answer read "Not provided".
4. `summarizeSubmission(schema, values)`: the inbox summary from the
   schema's `preview` setting.

`validateFields(schema, values, keys)` checks some fields only, for one step
of a form.

Once answers are normalised, the checks are FeedBakkr's: a test runs every
fixture and probe through both and requires the same verdict. Where core is
stricter or more forgiving than FeedBakkr's `generateZod`, the difference is
listed and tested in `test/submissions.test.ts`. The summary differs in one
way: email, url and phone answers appear in it, where FeedBakkr showed
nothing for them.

`generateZod` is still exported, unchanged, and `DynamicForm` still uses it.

## A form from your own components

```tsx
import { useFeedbakkrForm } from "@ai-food-focus/feedbakkr-core/react";

const form = useFeedbakkrForm(schema, { onSubmit: (values) => send(values) });

<form onSubmit={form.handleSubmit} noValidate>
	{form.fields.map((field) => (
		<MyInput
			key={field.k}
			label={field.label}
			value={String(form.values[field.k] ?? "")}
			onChange={(v) => form.setValue(field.k, v)}
			onBlur={() => form.blur(field.k)}
			error={form.errorFor(field.k)}
		/>
	))}
</form>;
```

The hook holds the answers and errors and runs `validateSubmission`'s checks:
a field when the person leaves it, all of them on submit. `onSubmit` gets
the normalised values. `setErrors` shows errors from the server, `validate`
checks chosen fields, and `reset` starts again. It renders nothing.

## Render a form: FeedbakkrForm

```tsx
import { FeedbakkrForm } from "@ai-food-focus/feedbakkr-core/react";

<FeedbakkrForm schema={schema} onSubmit={(answers) => send(answers)} />;
```

`FeedbakkrForm` renders v1 and v2 schemas on `useFeedbakkrForm`, so it
checks answers with the server's rules and follows conditions. It takes
`DynamicForm`'s props (`initialValues`, `submitting`, `renderFooter`,
`className`, `style`) and adds `components` (the app's own building blocks;
plain elements with `data-fbk` attributes by default), `widgets` (a control
per field type), `strings` (every label, and wording per error code),
controlled `values` and `onChange`, `errors` from the server, and
`layout="steps"` for sections. Errors and help text are linked to their
inputs for screen readers, and tests run axe on the rendered fixtures.

## Render a form: DynamicForm (v1)

```tsx
import { DynamicForm } from "@ai-food-focus/feedbakkr-core/react";

<DynamicForm schema={schema} onSubmit={(answers) => send(answers)} />;
```

`DynamicForm` is FeedBakkr's form renderer: plain inputs with inline styles,
one per field type, checked with `generateZod` before `onSubmit` is called.
It differs from FeedBakkr's in one way: list entries that were added but left
empty are left out, so the answers still pass the check after being sent as
JSON. It takes `initialValues` (hidden fields are filled this
way), `submitting`, `renderFooter`, and `className` and `style` for the
`<form>`. Tests render every fixture through it and FeedBakkr's copy and
require the same HTML, and require everything it submits to pass the check
after a JSON round trip.

## Edit a form: the builder

```tsx
import { FeedbakkrBuilder } from "@ai-food-focus/feedbakkr-core/builder";
import "@ai-food-focus/feedbakkr-core/builder.css";

<FeedbakkrBuilder
	value={schema}
	onChange={setSchema}        // every edit
	onSave={save}               // optional: shows a Save button
	onDirtyChange={setDirty}    // the host blocks navigation while dirty
	onNotify={(n) => toast(n.message)}
	readOnly={!canEdit}
	allowV2                     // offer conditions, sections, help, placeholder
	lockedFields={["name", "email"]}
/>;
```

It is FeedBakkr's builder: a field list with drag to reorder, add and edit
dialogs, settings for each field type, warnings, inbox preview settings,
meta, the JSON, Zod and JSON Schema views, export as a JSON template or the
text format, and import from a template. Beside the list, a preview renders
the form with `DynamicForm` and checks answers locally. It makes no network
calls and has no login or routing: the host loads and saves the schema.

`onSave` receives the schema only after `validateSchema` passes; a thrown
error is shown in the builder.

With `allowV2` (or a v2 `value`), the edit dialog has help text, a
placeholder and "Show this field: Always / Only when [field] [is] [value]";
"Group into sections" and "Start a new section here" split the field list
into sections, each with a title, description and condition. Conditions
follow the fields: renaming a key renames it in conditions, deleting a field
removes conditions on it, and a moved field joins the section above it. The
schema is v2 only while it uses one of these, and v1 otherwise. Broken
conditions (such as one that names a field below it) show as warnings and
stop a save. `lockedFields` cannot be deleted, renamed or change type. The
preview uses `FeedbakkrForm`, so it shows and hides fields as conditions
change. `title` and `description` name the exported
template, and default to the schema's own.

It needs these optional peer dependencies, which only `/builder` imports:
`react` and `react-dom` 19, `radix-ui`, `@dnd-kit/core`, `@dnd-kit/sortable`,
`@dnd-kit/utilities` and `lucide-react`.

`builder.css` is compiled from FeedBakkr's Tailwind classes and scoped to
`.fbk-builder`, so the host needs neither Tailwind nor shadcn, and nothing
outside the builder is styled. Change its colours by setting these on
`.fbk-builder`: `--fbk-accent`, `--fbk-accent-foreground`, `--fbk-background`,
`--fbk-foreground`, `--fbk-muted`, `--fbk-muted-foreground`, `--fbk-border`
and `--fbk-destructive`. A `.dark` class on an ancestor switches to dark
colours.

What differs from FeedBakkr's builder page:

- Loading, saving, permissions and navigation blocking are the host's, through
  the props above.
- The schema's `title` and `desc` are kept. FeedBakkr removed them, because a
  channel holds its own.
- The preview beside the field list and the check before `onSave` are new.
  FeedBakkr tested a draft on a separate page, by sending it to the channel's
  inbox.
- The warnings button sits in the toolbar rather than the page header.
- A read-only builder with no fields says so, rather than offering to add one.

Its tests: unit tests for the reducer, component tests, and browser tests
(`pnpm test:e2e`) that add, edit, reorder, preview, export and save on a test
page (`e2e/page`), and fail if the page makes any request beyond itself.

## Store the version a message was validated against

```ts
import { hashSchema } from "@ai-food-focus/feedbakkr-core";

const hash = await hashSchema(schema); // SHA-256 of key-sorted JSON
```

`canonicalizeDsl` and `hashDsl` are FeedBakkr's own versions, which depend
on key order. They are kept for comparing against hashes FeedBakkr has
already stored.

## The `feedbakkr` command

Installing the package adds a `feedbakkr` command (Node 22 or later):

```bash
pnpm exec feedbakkr validate --publish form.json   # check schemas, JSON or text format
pnpm exec feedbakkr text form.json                 # JSON to text, or text to JSON
pnpm exec feedbakkr sample form.json               # example answers that pass
pnpm exec feedbakkr guide                          # the schema format
pnpm exec feedbakkr mcp                            # the MCP server, on stdio
```

`validate` exits 1 when a schema is invalid, so it can run in CI.

## MCP server for coding agents

`feedbakkr mcp` is a local MCP server with the tools `schema_guide`,
`validate_schema`, `schema_from_text`, `schema_to_text` and `sample_payload`,
and the two guides as resources. To use it from Claude Code, add it to the
app's `.mcp.json`:

```json
{
  "mcpServers": {
    "feedbakkr": { "command": "pnpm", "args": ["exec", "feedbakkr", "mcp"] }
  }
}
```

It runs on the developer's machine, holds no data and makes no network
calls.

## Guides

- [`docs/schema-guide.md`](docs/schema-guide.md): the schema format, for
  people and agents writing schemas.
- [`docs/claude-guide.md`](docs/claude-guide.md): how an app should use
  core, for coding agents. Point to it from the app's `CLAUDE.md`.

Both ship in the package, and every example in them is tested.

## Licence

MIT. Copyright © Bytechaser Ltd. See [LICENSE](LICENSE). Parts of the builder come from third-party projects under MIT and Apache-2.0 licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
