# Content Engine — entitlement lookup (the pull side)

**From the Greater Inside store. 4 November 2026.**
Companion to `content-engine-entitlement-contract.md`, which covers the push.

## Why this exists

The push tells you what changed. It cannot help you when you have lost your own
copy and cannot reconstruct it.

That happened. A Content Engine customer deleted their workspace on 27 October;
the delete cascaded away the local entitlement, and nothing in Content Engine's
own database could say what had been bought. A second customer hit it on
31 October and waited two days until a store message happened to re-grant her.
Both needed a human running SQL.

This endpoint answers the question on demand.

## The request

`POST https://grow.greaterinside.com/api/apps/entitlement/lookup`

```
content-type:    application/json
x-store-secret:  <the shared secret you already have>
```

```json
{ "email": "buyer@example.com", "entitlementKey": "content-engine" }
```

`email` is the identity, lowercased and trimmed on our side before matching.

`entitlementKey` is accepted and **deliberately ignored**. All three offers
share one key, so scoping on it would collapse them. Your secret already says
which app is asking, and that is the only scope applied: app A cannot see app
B's customers.

## The reply

`200`

```json
{ "hasAccess": true, "channels": ["instagram"] }
```

| Reply | Means |
|---|---|
| `{ "hasAccess": true, "channels": [...] }` | They hold these channels. Replace your list with it, exactly as with the push. |
| `{ "hasAccess": true }`, no `channels` | Access is real, no channel list is attributable. **No change** — never a grant, never a revoke. Same meaning as an omitted `channels` on the push. |
| `{ "hasAccess": false }` | Every subscription they hold for your app is cancelled, or we have no record of this email. A definitive no. |

`channels` is **omitted, never `[]`**. An empty array would read as "revoke
everything" to anything obeying replace-don't-merge, so we do not send one.

`channels` is the union of every subscription that is not cancelled, and
`past_due` counts, exactly as on the push. The two directions call the same
function, so they cannot disagree: your customer's access does not depend on
which way the question travelled.

## Status codes

| Code | Means | What to do |
|---|---|---|
| `200` | A real answer, including `hasAccess: false` | Act on it |
| `401` | Secret missing, wrong, or the app is deactivated | Do not retry; tell a human |
| `400` | Body is not valid JSON, or `email` is not an email | Fix the call |
| `500` | We failed to read | **Treat as "cannot tell"**, not as a denial. Retry later. |

A `500` must never become a revoke. We would rather you wait than lock out
somebody who is paying, which is why a read failure stays a `500` instead of
degrading into `hasAccess: false`.

## The one case that is not definitive

An app-first subscriber — someone you reported to us via
`POST /api/apps/entitlement` who has no store account yet — is parked by email
in a table that has no channels column. We can tell you they hold something; we
cannot tell you which channels. You get `{ "hasAccess": true }` with no list,
which is the "no change" case above. That is honest rather than helpful, and it
is the right way round: guessing a channel list would over-grant.
