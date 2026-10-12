# @ai-food-focus/feedbakkr-core

FeedBakkr's form schema format, its checks and its payload validator, as pure
TypeScript with `zod` as the only dependency. It runs in Cloudflare Workers,
Node and browsers.

## Entry points

| Import | What it holds |
| --- | --- |
| `@ai-food-focus/feedbakkr-core` | Same as `/schema` |
| `@ai-food-focus/feedbakkr-core/schema` | Schema DSL v1 types and Zod schema, `validateSchema`, `generateZod`, `hashSchema`, sample data, date bounds, preview helpers |
| `@ai-food-focus/feedbakkr-core/text` | `parseFormDslText`, `schemaToTextDsl` |
| `@ai-food-focus/feedbakkr-core/export` | `generateJsonSchema`, `generateZodCode` |

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

## Store the version a message was validated against

```ts
import { hashSchema } from "@ai-food-focus/feedbakkr-core";

const hash = await hashSchema(schema); // SHA-256 of key-sorted JSON
```

`canonicalizeDsl` and `hashDsl` are FeedBakkr's own versions, which depend
on key order. They are kept for comparing against hashes FeedBakkr has
already stored.
