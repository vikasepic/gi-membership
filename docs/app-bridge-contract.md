# App bridge contract (store ↔ connected app)

> **Sharing this with an external app team? Send them
> [`app-integration-guide.md`](./app-integration-guide.md) instead.** That one is
> self-contained, vendor-neutral, and assumes no knowledge of this codebase —
> including the login model, verified reference implementations in Node and
> Python, a test matrix, and the lifecycle gaps. This file is the terse internal
> version and is specific to Content Engine.

The **store** (gi-membership) is the front door and system of record for
accounts. A connected app (Content Engine first) is a row in the `apps` table:
`base_url`, `provision_endpoint`, `handoff_endpoint`, `shared_secret`,
`entitlement_mapping`. The store implements everything below; **the app repo
(Content Machine) must implement the two endpoints and the two guarantees.**

Store and app keep **separate user tables, reconciled on lowercased email.**

---

## 1. Provision — `POST {base_url}{provision_endpoint}` (default `/api/store/provision`)

Server-to-server. The store calls this the moment it grants an app subscription
(bump, OTO, or a standing offer accepted from the library).

**Request**
```
POST /api/store/provision
x-store-secret: <apps.shared_secret>
content-type: application/json

{
  "email": "buyer@example.com",       // lowercased
  "entitlementKey": "content-engine", // from offers.grant_entitlement_key
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_..."   // the store-created subscription
}
```

**App must:**
- Reject if `x-store-secret` ≠ the shared secret (401).
- Be **idempotent by email** — a repeat call for the same buyer must not double-provision.
- Find-or-create its own user by email, grant the entitlement, and reconcile the
  Stripe customer/subscription. Content Engine wraps its existing
  `provisionPurchaseFromSession` for this.
- Respond `200 { ok: true }` (optionally a `handoffUrl`/confirmation).

The store call is **best-effort** and never blocks the purchase. If it fails,
the handoff (below) re-drives provisioning on first arrival, so provisioning is
self-healing as long as it stays idempotent.

---

## 2. Handoff — `GET {base_url}{handoff_endpoint}` (default `/auth/store-handoff`)

"Open the app" in the store sends the user here with a signed token.

```
GET /auth/store-handoff?token=<token>
```

**Token format** (the store mints it; the app verifies it):
```
token   = base64url(payloadJson) + "." + base64url(sig)
payload = { "email": "...", "userId": "<store uid>", "appId": "...", "exp": <unix seconds> }
sig     = HMAC_SHA256( base64url(payloadJson), apps.shared_secret )   // base64url
```

**App must:**
- Recompute `sig` and compare **timing-safe**; reject on mismatch.
- Reject if `exp < now` (tokens are ~5-minute TTL).
- Enforce **single-use** (track consumed tokens; a replay must fail).
- Resolve/create the user by `email` (provision on first arrival), mint an app
  session, and redirect into the app — user lands already signed in.

Reference implementation of the signer: `lib/apps.ts#signHandoffToken` in this repo.

---

## 3. Two guarantees the app repo owns

**Trial support.** The store creates the subscription with `trial_period_days`
(e.g. Content Engine = 7). CE's `createCheckoutSession` sets no trial today —
it must accept/honour store-created trials so the trial state is consistent on
both sides.

**Subscription-ownership boundary.** Store-created subscriptions are tagged
`metadata.store_created = "true"`. CE's existing Stripe webhook receives the same
`customer.subscription.*` events and **must not clobber** these rows — define one
owner of subscription state. CE's single-`subscriptions`-row-per-org model
(`billing/checkout.ts`) can't reconcile a second externally-created sub, so this
seam must be resolved before pointing ads at the funnel.

---

## What the store sends / expects (summary)

| Store action | App endpoint | Secret | Idempotency |
|---|---|---|---|
| Grant app subscription | `POST /api/store/provision` | `x-store-secret` header | by email |
| User clicks "Open the app" | `GET /auth/store-handoff?token=` | HMAC over shared secret | single-use token |
