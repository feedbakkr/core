# feedbakkr-core

The FeedBakkr form toolkit as one private package, `@ai-food-focus/feedbakkr-core`,
for apps such as FoodACN. It holds FeedBakkr's schema format and its checks,
with no database, hosted API or framework attached.

The code was extracted from [FeedBakkr](https://github.com/feedbakkr/feedbakkr)
at commit `8ae744e` (2026-06-30). The FeedBakkr app is unchanged and does not
use this package.

## Layout

```text
packages/core/                  the published package
  src/schema/                   Schema DSL v1, checks, payload validator, hash
  src/text/                     the text format (parse and print)
  src/export/                   JSON Schema and Zod code export
  test/                         unit, fixture, differential and round-trip tests
  test/reference/feedbakkr-8ae744e/   verbatim FeedBakkr copies the tests compare against
  scripts/check-boundaries.mjs  fails if a built entry imports anything but zod
fixtures/                       74 marketplace templates, 4 platform forms, per-type schemas
```

## Develop

Node 22 and pnpm 11 (picked up from `packageManager`).

```bash
pnpm install
pnpm verify   # biome, build, typecheck, tests, package checks
```

## Compatibility with FeedBakkr

- **Schema and payload validation match FeedBakkr exactly.** `test/differential.test.ts`
  runs every fixture and a set of probe payloads through core and through the
  reference copies, and the verdicts must agree.
- **Intentional differences are listed in one place.** `test/intentional-differences.test.ts`
  shows FeedBakkr's behaviour next to core's for each one. In 0.1.0 they are
  all in the text format, so that every schema round-trips exactly.
- **Ten of the 74 marketplace templates cannot be published, in FeedBakkr or in core.**
  Their inbox preview names a number or date field. The fixture test pins
  exactly which ones.

## Release

1. Set the version in `packages/core/package.json` and merge to `main`.
2. Push a matching tag: `git tag v0.1.0 && git push origin v0.1.0`.
   A tag with a suffix (`v0.2.0-next.1`) publishes under the `next` dist-tag.

`.github/workflows/release.yml` verifies, packs and publishes to GitHub
Packages with the workflow's own token. GitHub Packages has no npm provenance,
so the tag is the record of what was published.

## Installing it in another repo

The package is private to the ai-food-focus organisation.

- **Registry:** add `@ai-food-focus:registry=https://npm.pkg.github.com` to the
  repo's `.npmrc`.
- **On your machine:** add `//npm.pkg.github.com/:_authToken=<token>` to `~/.npmrc`,
  using a classic personal access token with `read:packages` only.
- **In GitHub Actions:**
  - Give the job `permissions: { contents: read, packages: read }`.
  - Before `pnpm install`, write the same `_authToken` line to `~/.npmrc` using `${{ secrets.GITHUB_TOKEN }}`.
  - An organisation admin adds the repo under the package's **Manage Actions access**, with Read.
