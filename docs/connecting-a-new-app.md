# Connecting a new app — the runbook

> This is for an app that runs **elsewhere** and is reached through the HTTP
> bridge. An app that runs inside this codebase is a built-in app: see
> [`builtin-apps.md`](./builtin-apps.md). Both kinds share the `apps` table,
> told apart by `apps.kind`.

The repeatable sequence for wiring a new connected app to the store. Followed
for Content Engine and the Funnel App; follow it again rather than reinventing
the order.

The order matters in one specific way: **the app row is created early and the
offer is created late.** Everything before step 6 is reversible and invisible to
customers. Everything from step 6 can take money.

---

## 1. Register the app — early, inactive

Insert a row in `apps` **before the external team writes any code**:

| Column | Value |
|---|---|
| `key` | stable slug, e.g. `funnel` |
| `name` | display name |
| `base_url` | `https://REPLACE-ME.example.com` until they have one |
| `provision_endpoint` | `/api/store/provision` |
| `handoff_endpoint` | `/auth/store-handoff` |
| `shared_secret` | `openssl rand -hex 32` |
| `entitlement_mapping` | `{"<offer grant key>": "<app entitlement key>"}` |
| `active` | **`false`** |

Two things depend on doing this first:

- **The secret becomes real.** They can set it in their environment on day one,
  and can test their own endpoints against it without us.
- **`active: false` means the store cannot call them.** An offer pointing at
  endpoints that 404 fails silently on every purchase — the customer is charged
  and provisioning quietly does nothing. Inactive is the safe default until
  their endpoints exist.

Never print the secret in a terminal, a commit, or a chat transcript. Generate
it straight into the credentials file and the database.

## 2. Write the credentials file — outside every git repo

`~/Documents/Projects/<APP>-CREDENTIALS.md`, `chmod 600`.

Holds the shared secret, the registered values, the store endpoints they call,
and blanks for their own infrastructure. Verify afterwards that the secret
matches the database row and appears nowhere in the repo.

## 3. Write the app brief

`docs/<app>-brief.md`. The generic guide is vendor-neutral, which is its value
and its limit: it cannot know their stack. The brief carries what the guide
cannot:

- Their registered values, and what is still outstanding on our side.
- **The question that sizes the work**: do they bill through the same Stripe
  account as the store? Same account means their webhook already receives our
  subscriptions and will fight us over them.
- Platform specifics that cost a day if met by surprise. For the Funnel App
  that was nine Vercel and Supabase facts; for Content Engine it was two
  conflicts in their existing billing code.

Anything true of every app belongs in `app-integration-guide.md` instead. Keep
that file vendor-neutral — the moment it mentions Vercel it stops being the
document you can hand to anyone.

## 4. Assemble the handover pack

`~/Documents/Projects/<app>-handover/`, zipped:

| File | |
|---|---|
| `START-HERE.md` | The prompt to paste into their Claude, plus the done-checklist |
| `app-integration-guide.md` | The protocol, copied |
| `<app>-brief.md` | Their specifics, copied |
| `test-vector.json` | A known-good handoff token, dummy secret |
| `.env.example` | Every variable, their app id filled in |

**The shared secret is never in the pack.** A zip goes through Slack and email
and usually ends up committed. Send it over a channel that is not a file.

The test vector matters more than it looks: the HMAC covers the base64url
string, not the decoded JSON, and getting that wrong produces a rejection
indistinguishable from a wrong secret. A vector turns a day of confusion into a
passing assertion. Generate it from `signHandoffToken`, never from a
re-implementation, and check it in — `lib/handoff-vector.test.ts` makes an
algorithm change a red build rather than a silent break of every live
integration.

## 5. They build and self-test

They need nothing from us here. The guide's §8 matrix plus the vector covers
their whole side, and the vector is what lets them verify signature handling
offline.

**They cannot test their secret against the store yet, and the brief must say
so.** `appForSecret` filters on `active = true`, so an inactive app is refused
inbound as well as outbound — `POST /api/apps/entitlement` answers `401` until
step 6. That 401 is indistinguishable from a wrong secret, so a brief that
invites the call without the caveat sends the team hunting a secret that was
correct all along.

Verify the secret against the `apps` row yourself and tell them it is correct.
That removes their need for the check.

## 6. Point the row at them, and activate

When they send a **production** base URL — not a per-commit preview URL — update
`base_url` and set `active = true`.

Ask whether their host has deployment protection enabled. Vercel's returns a
401 that looks exactly like a wrong shared secret.

## 7. Create the offer — last

Only now. An offer is what takes money, and until step 6 the grant it promises
cannot be delivered.

| Column | Note |
|---|---|
| `grant_type` | `subscription` for app access |
| `grant_app_id` | the `apps.id` from step 1 |
| `grant_entitlement_key` | must match a key in `entitlement_mapping` |
| `billing_type`, `interval`, `trial_days`, `price_cents` | business decisions — ask, do not assume |
| `active` | `false` until a test purchase has passed |

Then attach it: a product's `bump_offer_id` or `upsell_offer_id`, or leave it
standing for the library.

## 8. Test purchase, both directions

In Stripe test mode:

1. Buy. They should see `status: "trialing"` within seconds.
2. Open the app from the library — handoff signs the user in with no prompt.
3. Cancel. They should see `status: "canceled"` and revoke.
4. If they sell directly, have them report one sale and confirm the store stops
   offering it to that customer.

Then backfill any existing subscribers of theirs through
`POST /api/apps/entitlement`. Content Engine moved 13 in one pass.

---

## Retries — closed, and what to tell them

`notifyAppEntitlement` queues a failed push through `recordError`
(`lib/apps.ts` → `queueRetry`) onto the `app_entitlement` runner in
`lib/retry.ts`, which retries with backoff. This used to be an open gap and
every brief asked the app to expire access in windows to cover it. **Stop
asking for that** — it is work we no longer need to push onto them.

Two things a brief should still say:

- **`occurredAt` is stamped when the entitlement changed**, by the caller, and
  the same value is carried into the retry queue. It is stable across retries of
  one message, so an app can safely ignore anything older than the last message
  it applied. It has to: a replayed old message would otherwise undo newer state.
- **Answer `2xx` even when ignoring a message**, or the store keeps retrying it.

The reason a missed message mattered asymmetrically is still worth knowing: a
missed **grant** self-heals, because the handoff re-provisions on the next
sign-in. A missed **revoke** never does — nothing brings that person back.
