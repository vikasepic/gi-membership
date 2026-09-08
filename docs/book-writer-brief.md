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
| App id | `4fdef120-149d-462a-84df-7d64ed725128` — also in your `.env.example` |

**Until we flip you active, the store cannot call you and you cannot call the
store.** `POST /api/apps/entitlement` answers `401` for an inactive app, and
that `401` is indistinguishable from a wrong secret. Do not go hunting a secret
that is correct — we have verified it against the database row ourselves. Tell
us when your endpoints are up and we will activate.

---

## 2. Yes, it is the same Stripe account — and it does not matter

Confirmed: `book.greaterinside.com` bills through the same Stripe account as
the store. Normally that is the answer that makes an integration expensive.
Here it costs nothing, for a reason worth knowing:

**The store does not use Stripe Checkout Sessions.** It creates PaymentIntents
and SetupIntents directly against the Payment Element. So it never emits
`checkout.session.completed` — the only event your webhook subscribes to.
**Store purchases are invisible to your webhook.** Not filtered out: never
delivered.

Your `ignored_unrelated_product` branch is therefore not load-bearing for this
integration. Keep it anyway — it is what protects you the day someone adds a
Checkout Session somewhere on this account.

Two things the shared account does give you:

- **`stripeCustomerId` resolves.** The `cus_…` we send is a real customer in
  your account, so you can look it up, attach it, or reconcile against it.
  Store it if it is useful to you.
- **`stripeSubscriptionId` will be null** for Book Writer, because the offer is
  a one-time $47 payment. There is no subscription. Do not require the field.

If you ever subscribe to more events, note that store-created objects carry
`metadata.store_created = "true"` — filter on that rather than on product ids.

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

### 4.1 Revocation — rarer than you would expect, still required

Every write in your reference sets `has_access: true`. Nothing in your flow
ever sets it false, because a $47 one-time purchase never ends.

The store offer is **also** a one-time $47 purchase, so there is no
subscription to lapse and no renewal to fail. In practice you will receive
`canceled` only when an admin revokes access by hand on our members screen.

Build it anyway. It is one line:

```js
has_access: payload.hasAccess
```

Writing the field we send, rather than branching on `status`, also gets
`past_due` right for free — it arrives with `hasAccess: true` on purpose,
because Stripe retries a failed card for days and often succeeds. You will not
see `past_due` on this offer, but you will if Book Writer is ever sold on a
subscription later, and the line does not change.

What you must not do is treat the endpoint as grant-only. A revoke that lands
nowhere leaves you serving someone whose access we removed, and nothing will
ever come along to correct it.

### 4.2 `user_access.source` needs a fourth value

Today it is `greater_inside | mindvalley | sahara`, chosen by your product-id
classifier. A store-provisioned buyer came through none of those.

Add **`store`**. It is a **CHECK constraint**, not a plain column — we were told
otherwise and were wrong, and you found it:

```
source = ANY (ARRAY['greater_inside','mindvalley','sahara','complimentary','store'])
```

You have already added `store` to it. Recorded here because the failure it would
have caused is the expensive kind: the upsert rejects, the buyer is charged, and
no access is granted.

Do **not** reuse `greater_inside`. Your affiliate tracker resolves its
destination from `source`, and a store sale is not a `greater_inside` sale — it
would report the same revenue to the tracker twice, once by us and once by you.

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
| **Non-Books product event on this webhook** | Unchanged. We share the Stripe account but never emit `checkout.session.completed`, so store traffic does not arrive here at all — see §2. Keep the branch anyway. |

One new one: **a store buyer whose `auth.users` row already exists from a direct
purchase.** `generate_link` is idempotent and the `user_access` upsert is keyed
on `user_id`, so provisioning twice is safe. What is not safe is the reverse:
one person can now hold access from a direct $47 payment *and* from a store
purchase, and `user_access` has one row and one flag to express both.

If we ever revoke, we send `hasAccess: false` for the store's grant — we have
no idea they also paid you directly. **Writing that straight through would take
away something they bought from you.** Both purchases being one-time makes this
rare, but decide it before it happens: either keep a per-source record of who
granted what, or treat a direct payment as a floor that a store revoke cannot
go under. Tell us which and we will match it on our side.

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

- A shout when steps 1-5 are done, so we can activate and test together.

Answered already, recorded here so nobody re-asks: same Stripe account (§2),
`user_access.source` is plain text (§4.2), the store offer is a one-time $47
payment (§9), and the base URL is `https://book.greaterinside.com` — registered.

**Your routing is already clear for this.** We probed it before registering:

```
GET /                      200
GET /login                 200
GET /auth/store-handoff    404
GET /api/store/provision   404
```

Both endpoints answer a plain `404`, not a `307` to `/login`. That matters more
than it looks: the store follows no redirects, precisely because a login page's
`200` would read as "delivered" and a failed provision would look like a
successful one. Whatever sends the root on to Stripe runs in the browser, not in
middleware, so it will not stand in front of what you build. Keep it that way —
if these two paths ever start redirecting, our calls silently stop arriving.

---

## 9. The offer, for reference

| | |
|---|---|
| Price | **$47 USD, one-time** |
| Billing | one-off payment — no interval, no trial, no renewal |
| Grants | `book-writer`, no channels |
| `stripeSubscriptionId` we send | always `null` |
| `status` we send | `active` on purchase |

It matches your own direct price, so a buyer pays the same either way.

Because it is one-time, ownership does not expire. Once we have told you a
buyer has access, that stays true until somebody revokes it deliberately.
