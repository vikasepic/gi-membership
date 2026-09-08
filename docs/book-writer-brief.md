# Book Writer — integration brief

**For the Book Writer developer.** From the Greater Inside store
(`grow.greaterinside.com`). Read `app-integration-guide.md` first — it is the
protocol and it is the same for every app we connect. This brief is only what
the guide cannot know: your stack, your existing code, and the decisions that
are yours.

Written against your own `Purchase to Provision` reference (8 Sep 2026), so it
names your files and tables directly.

---

## 1. Your registered values

| | |
|---|---|
| App key | `book-writer` |
| Display name | Book Writer |
| `base_url` | `https://book.greaterinside.com` |
| Provision endpoint | `POST /api/store/provision` — you build this |
| Handoff endpoint | `GET /auth/store-handoff` — you build this |
| Entitlement key | `book-writer` |
| Channels | **none** — you have no sub-permissions, so the store will never send a `channels` array |
| Shared secret | sent separately, never in this pack |
| App id | in your `.env.example` |

**Until we flip you active, the store cannot call you and you cannot call the
store.** `POST /api/apps/entitlement` answers `401` for an inactive app, and
that `401` is indistinguishable from a wrong secret. Do not go hunting a secret
that is correct — we have verified it against the database row ourselves. Tell
us when your endpoints are up and we will activate.

---

## 2. The question that decides how much work this is

**Does `book.greaterinside.com` bill through the same Stripe account as the
store?**

You already run a webhook on `checkout.session.completed`. If it is the same
account, that webhook is about to start receiving *our* events — every
subscription the store creates, for every app, not only yours.

Your classifier already saves you here, and it is worth knowing why: step 03
matches the expanded product id against your three `_PRODUCT_ID` env vars and
returns `source=null` for anything else, so a store event lands on
`diag.stage='ignored_unrelated_product'` and provisions nothing. That is the
correct behaviour and you should keep it.

Two things to check even so:

- Store-created subscriptions carry `metadata.store_created = "true"`. If you
  ever relax the product-id match, filter on that instead.
- Store subscriptions can be in `trialing`. Your flow has never seen a
  subscription at all — it is a one-time $47 payment — so if you add any
  subscription handling later, treat `trialing` as access.

If it is a **different** Stripe account, ignore all of the above: the
`stripeCustomerId` and `stripeSubscriptionId` we send are informational and
will not resolve against your account.

---

## 3. You have already built most of this

Your webhook's steps 06 and 07 are, almost exactly, the store's provision
endpoint. The mapping:

| Store needs | You already have |
|---|---|
| Find-or-create a user by email | step 06 — `admin/generate_link` with `type=magiclink` auto-creates the auth user and returns `user id` |
| Grant access idempotently | step 07 — `user_access` upsert `onConflict: 'user_id'` |
| Be idempotent on repeat calls | both of the above already are, by your own account |

So the provision endpoint is mostly a re-wrap of code you have running in
production. **Extract steps 06 and 07 into one function and call it from both
your Stripe webhook and the new endpoint** rather than writing a second copy —
two provisioning paths that drift is the failure mode here.

Two differences from the webhook path:

- The store gives you an **email**, not a Stripe session. You never call
  `listLineItems`, and there is no product to classify.
- `stripe_customer_id` / `stripe_payment_id` refer to the **store's** Stripe
  account. Either leave them null for store-provisioned rows or add separate
  columns — do not write them into the same columns your own checkout uses, or
  a later lookup against your account will silently find nothing.

---

## 4. What is genuinely new

### 4.1 Revocation — you have no path for it today

Every write in your reference sets `has_access: true`. Nothing in your flow
ever sets it false, because a $47 one-time purchase never ends.

A store subscription does. You will receive:

```json
{ "email": "...", "entitlementKey": "book-writer", "status": "canceled", "hasAccess": false, "occurredAt": 1785300000 }
```

**Honour `hasAccess`.** Set `has_access = false` on that user's `user_access`
row. Treating our endpoint as grant-only leaves you serving customers who
stopped paying, and nothing will ever come along to correct it.

`past_due` arrives with `hasAccess: true` on purpose — Stripe retries a failed
card for days and often succeeds. Only `canceled` removes access. If you simply
write `has_access = payload.hasAccess` you get this right without thinking
about it.

### 4.2 `user_access.source` needs a fourth value

Today it is `greater_inside | mindvalley | sahara`, chosen by your product-id
classifier. A store-provisioned buyer came through none of those.

Add **`store`**. If `source` is a Postgres enum or has a CHECK constraint, that
is a migration — worth finding out now rather than at the first live purchase,
because the upsert will fail and the buyer will be charged with no access. If
it is a plain `text` column, nothing to do.

Do **not** reuse `greater_inside`. Your affiliate tracker resolves its
destination from `source`, and a store sale is not a `greater_inside` sale — it
would report revenue to the tracker twice, once by us and once by you.

### 4.3 The out-of-order guard

`occurredAt` is Unix seconds, stamped when the entitlement changed, and it is
stable across our retries of the same message. Store the last one you applied
per user and **ignore anything older** — then still answer `2xx`, or we keep
retrying a message you have deliberately rejected.

This is not theoretical. We retry with backoff, so a queued grant can land
after a newer cancellation. Without the guard, that replay re-grants access to
someone who cancelled.

### 4.4 The handoff endpoint

`GET /auth/store-handoff?token=…` — a buyer clicking "Open the app" from the
store library. Full token format is §4 of the guide; the three things that
actually break integrations:

- **The HMAC covers the base64url string, not the decoded JSON.** Sign the
  encoded text exactly as it appears before the dot. This is the single most
  common bug and the reason `test-vector.json` is in the pack — verify against
  it offline before you touch anything live.
- **base64url throughout**: `+`→`-`, `/`→`_`, no `=` padding.
- **Single use.** Store consumed tokens (or their hash) until `exp` passes and
  reject repeats. A leaked URL in browser history is otherwise a permanent
  backdoor.

Then **provision on arrival** — same shared function from §3 — and only then
mint your own session. You already have that last part: it is your existing
magic-link path, minus the email.

Provisioning here is the safety net. A missed grant heals the moment the buyer
opens the app, faster than any retry schedule.

### 4.5 Telling the store about your own sales

You keep selling directly at $47 through `/checkout`, `/mindvalley` and
`/sahara`. When someone buys that way, tell us:

```
POST https://grow.greaterinside.com/api/apps/entitlement
x-store-secret: <your shared secret>
```

Without it the store will keep offering Book Writer in the library to someone
who already owns it, and may sell it to them twice. §5 of the guide has the
body.

---

## 5. Your failure modes, revisited

Your reference lists six. Three change once the store is connected:

| Your case | What changes |
|---|---|
| **Wrong email typed at Stripe** | Cannot happen on the store path — we own the email and it is already lowercased when it reaches you. Still your biggest risk on your own three routes. |
| **Email fails but everything else succeeded** | Store buyers have a second door: they open the app from the store library and the handoff signs them in. Your `/login` + `check_paid_access` path stays the fallback for direct buyers. |
| **Non-Books product event on this webhook** | Becomes the *common* case if we share a Stripe account. Keep the `ignored_unrelated_product` branch exactly as it is. |

One new one: **a store buyer whose `auth.users` row already exists from a direct
purchase.** `generate_link` is idempotent and the `user_access` upsert is keyed
on `user_id`, so this is safe — but it means one person can hold access from
both a direct $47 payment and a store subscription. Decide what happens when
the store subscription is cancelled and they still have the direct purchase:
**do not blindly write `has_access = false`** if they paid you separately. If
that is a real scenario for you, tell us and we will talk about how to
represent it.

---

## 6. What to build, in order

1. Extract webhook steps 06+07 into one `provisionByEmail(email, fullName, source)` function. No behaviour change; your existing webhook keeps working.
2. Add `source = 'store'` (and check for an enum/CHECK constraint first).
3. `POST /api/store/provision` — verify `x-store-secret` timing-safe, honour `hasAccess` both ways, apply the `occurredAt` guard, call the shared function, answer `200` in under 5 seconds.
4. `GET /auth/store-handoff` — verify against `test-vector.json` offline first, enforce single use, provision, then mint your session.
5. `POST /api/apps/entitlement` back to us when someone buys direct.
6. Tell us you are up. We activate the row and run a test purchase together.

Steps 1–4 need nothing from us. Step 6 is where we are involved.

---

## 7. Things we owe you

- The shared secret, over a channel that is not this file.
- Activation once your endpoints exist.
- A test purchase in Stripe test mode, both directions, before anything is sold.

## 8. What we still need from you

- Whether you bill through the same Stripe account as the store.
- Whether `user_access.source` is constrained.
- Your production URL confirmed as `https://book.greaterinside.com` — a
  per-commit preview URL is not one, and if your host has deployment protection
  enabled it returns a `401` that looks exactly like a wrong shared secret.
