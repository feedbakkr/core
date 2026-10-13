# @ai-food-focus/feedbakkr-core

FeedBakkr's form schema format, its checks and its payload validator, as pure
TypeScript with `zod` as the only dependency. It runs in Cloudflare Workers,
Node and browsers. A React form renderer and the form builder are separate
entries.

## Entry points

| Import | What it holds |
| --- | --- |
| `@ai-food-focus/feedbakkr-core` | Same as `/schema` |
| `@ai-food-focus/feedbakkr-core/schema` | Schema DSL v1 types and Zod schema, `validateSchema`, `generateZod`, `hashSchema`, sample data, date bounds, preview helpers |
| `@ai-food-focus/feedbakkr-core/text` | `parseFormDslText`, `schemaToTextDsl` |
| `@ai-food-focus/feedbakkr-core/export` | `generateJsonSchema`, `generateZodCode` |
| `@ai-food-focus/feedbakkr-core/react` | `DynamicForm`. Needs `react` 19, an optional peer dependency that only this entry imports. |
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

## Validate a submission

```ts
import { generateZod } from "@ai-food-focus/feedbakkr-core";

const parsed = generateZod(result.schema).safeParse(body.fields);
```

`generateZod` behaves exactly as FeedBakkr's: unknown keys are stripped, and
an optional field may be left out. Stricter submission validation comes in a
later release.

## Render a form

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
/>;
```

It is FeedBakkr's builder: a field list with drag to reorder, add and edit
dialogs, settings for each field type, warnings, inbox preview settings,
meta, the JSON, Zod and JSON Schema views, export as a JSON template or the
text format, and import from a template. Beside the list, a preview renders
the form with `DynamicForm` and checks answers locally. It makes no network
calls and has no login or routing: the host loads and saves the schema.

`onSave` receives the schema only after `validateSchema` passes; a thrown
error is shown in the builder. `title` and `description` name the exported
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
