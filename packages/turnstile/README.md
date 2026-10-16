# @feedbakkr/turnstile

Cloudflare Turnstile, done once, for any app: forms sent to FeedBakkr, login,
sign-up. Published to npm beside `@feedbakkr/core`. It does not depend on Core, and Core does not depend on it.

| Import | What it holds |
| --- | --- |
| `@feedbakkr/turnstile` | `TURNSTILE_TEST_KEYS`, `TURNSTILE_FIELD`, the result and widget types |
| `@feedbakkr/turnstile/server` | `verifyTurnstile(token, options)`: Workers, Node, browsers; needs only `fetch` |
| `@feedbakkr/turnstile/browser` | `loadTurnstile()`, `renderTurnstile(element, options)` for pages without React |
| `@feedbakkr/turnstile/react` | `useTurnstile(options)` and `TurnstileWidget`. Needs `react` 19, an optional peer dependency |

## On the server

```ts
import { verifyTurnstile } from "@feedbakkr/turnstile/server";

const check = await verifyTurnstile(body.turnstileToken, {
  secret: env.TURNSTILE_SECRET_KEY,
  remoteIp: request.headers.get("CF-Connecting-IP"),
  expectedAction: "contact",
});
if (!check.ok) {
  // check.reason: missing-token | missing-secret | rejected | action-mismatch
  //               | hostname-mismatch | unavailable; check.errorCodes from Cloudflare
}
```

It never throws. A timeout (5 seconds by default), a failed request or an
unreadable reply is `unavailable`, which is a failure: an outage never lets
everything through. A token is good for one check, within five minutes;
pass `idempotencyKey` if one request may check the same token twice.

Decide in the app what a missing secret means. FoodACN skips the check when
no secret is set (local development without keys), and requires a token as
soon as one is.

## In a React form

```tsx
import { TurnstileWidget, useTurnstile } from "@feedbakkr/turnstile/react";

const turnstile = useTurnstile({ siteKey, action: "contact" });

<TurnstileWidget turnstile={turnstile} />
<button disabled={!turnstile.ready}>Send</button>

// After every submit, whatever the answer: tokens are single use.
turnstile.reset();
```

- Without a site key the hook is `disabled`, `ready` is true and nothing is
  shown, so a form works unchanged where Turnstile is not set up.
- The widget renders in the browser only, once per element and site key;
  re-rendering the form does not rebuild it.
- Expired tokens refresh themselves, and Cloudflare retries failures.
- The `action` names the form, so a token for the contact form cannot be
  spent on login. Check it with `expectedAction`.

## Keys

Each site needs a widget in the Cloudflare dashboard (Turnstile), with its
hostnames, giving a site key (public, for the page) and a secret (server
only). For local development and tests use Cloudflare's test keys:
`TURNSTILE_TEST_KEYS.site.passes` with `TURNSTILE_TEST_KEYS.secret.passes`
always pass, on any hostname including localhost. They give no protection, so
never deploy them.

## Releasing

Version in `package.json`, then a tag `turnstile-v<version>` (for example
`turnstile-v0.1.0`) publishes it. Core's own tags (`v<version>`) do not.

## Licence

MIT. Copyright © Bytechaser Ltd. See [LICENSE](LICENSE).
