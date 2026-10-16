# FeedBakkr Core

The FeedBakkr form toolkit, `@feedbakkr/core`: FeedBakkr's schema format and its
checks, validation, submission preparation, a React form and the form builder,
with no database, hosted API or framework attached. It works with any backend;
FeedBakkr Cloud is one optional destination.

Beside it, as a separate optional package, `@feedbakkr/turnstile`: Cloudflare
Turnstile for forms and for any app's login or sign-up. `@feedbakkr/core` does not
depend on it.

```bash
npm install @feedbakkr/core
npm install @feedbakkr/turnstile   # optional
```

The code was extracted from the original FeedBakkr service
([feedbakkr/feedbakkr-legacy](https://github.com/feedbakkr/feedbakkr-legacy))
at commit `8ae744e` (2026-06-30).

## Layout

```text
packages/core/                  the published package
  src/schema/                   Schema DSL v1, checks, payload validator, hash
  src/text/                     the text format (parse and print)
  src/export/                   JSON Schema and Zod code export
  test/                         unit, fixture, differential and round-trip tests
  test/reference/feedbakkr-8ae744e/   verbatim FeedBakkr copies the tests compare against
  scripts/check-boundaries.mjs  fails if a built entry imports anything but zod
packages/turnstile/             @feedbakkr/turnstile: server check, script loader, React hook (optional)
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

Both packages are published to the public npm registry with provenance, by GitHub
Actions using npm trusted publishing (OIDC). No npm token is stored in the repo.
Each publish waits for approval on the `npm-release` environment.

The first versions under the new names (`@feedbakkr/core@0.11.0-next.1`,
`@feedbakkr/turnstile@0.2.0-next.1`) were published once by hand with npm
two-factor authentication, after which trusted publishing was configured.

1. Set the version in `packages/core/package.json` and merge to `main`.
2. Push a matching tag: `git tag v0.11.0 && git push origin v0.11.0`.
   A tag with a suffix (`v0.11.0-next.1`) publishes under the `next` dist-tag.

`.github/workflows/release.yml` verifies, packs and publishes `@feedbakkr/core`.

`@feedbakkr/turnstile` is released on its own: set its version in
`packages/turnstile/package.json`, merge, and push `turnstile-v<version>`
(`git tag turnstile-v0.2.0 && git push origin turnstile-v0.2.0`);
`.github/workflows/release-turnstile.yml` publishes it.

Earlier versions (0.1.0–0.10.0, and Turnstile 0.1.0) were published privately as
`@ai-food-focus/feedbakkr-core` and `@ai-food-focus/turnstile` on GitHub Packages.
They stay available to existing consumers until those have moved to the new names.

## Licence

MIT. Copyright © Bytechaser Ltd. See [LICENSE](LICENSE). The builder bundles third-party code under MIT and Apache-2.0 licences; see [packages/core/THIRD_PARTY_NOTICES.md](packages/core/THIRD_PARTY_NOTICES.md).
