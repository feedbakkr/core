# Reference copy: FeedBakkr at 8ae744e

Verbatim copies of FeedBakkr's schema parser, payload validator, inbox preview and form renderer, taken from
`feedbakkr/feedbakkr` at commit `8ae744e0e66cb14827117950699966a5957b084b`
(2026-06-30). Only the import paths are changed.

The differential tests compare `@feedbakkr/core` against these
files. They must never be edited: when core changes behaviour on purpose, list
the difference in `test/intentional-differences.test.ts` instead.

| Copy | Original path |
| --- | --- |
| `schema-dsl.ts` | `packages/shared/src/schema-dsl.ts` |
| `date-bounds.ts` | `packages/shared/src/date-bounds.ts` |
| `form-dsl-text.ts` | `packages/shared/src/form-dsl-text.ts` |
| `generate-zod.ts` | `packages/ui/src/generators/generate-zod.ts` (imports from `@feedbakkr/shared` pointed at the copies) |
| `dynamic-form.tsx` | `packages/ui/src/dynamic-form.tsx` (imports pointed at the copies and sorted) |
| `schema-utils.ts` | `packages/shared/src/schema-utils.ts` |
| `preview-generation.ts` | `apps/api/src/features/channels/services/preview-generation.service.ts` (imports from `@feedbakkr/shared` pointed at the copies) |
