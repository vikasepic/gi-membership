# Content Engine: per-channel access

**Hand this whole file to whoever is changing the Content Engine app.** It is
written to be read cold, in a session that knows nothing about the store.

---

## What changed on the store side, and why

Until now the store told Content Engine one thing about a purchase:

```json
{ "entitlementKey": "content-engine" }
```

One key, one level, so every offer that granted Content Engine granted the
same thing. But the store sells per channel: an Instagram plan, a LinkedIn
plan, and a plan with both. That distinction existed in the sales copy and
nowhere in the data, so the app had no way to know which one somebody bought.

An offer now carries a set of channels. The store sends it on **every**
provision call, alongside the key it already sent.

## The only change to the request

`POST {baseUrl}/api/store/provision`, header `x-store-secret: <shared secret>` —
both unchanged. One new field in the body:

```json
{
  "email": "buyer@example.com",
  "fullName": "Jane Doe",
  "entitlementKey": "content-engine",
  "channels": ["instagram", "linkedin"],
  "status": "active",
  "hasAccess": true,
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_..."
}
```

| Field | Type | Notes |
|---|---|---|
| `channels` | `string[]` | **New.** The channels this purchase unlocks. |

### The rules the store guarantees

1. **Values are exactly `"instagram"` and/or `"linkedin"`.** Lowercase, no
   other value is possible — a database CHECK constraint refuses anything else
   before it can be saved, and the admin picks from tickboxes rather than
   typing.
2. **Order is stable**: always `instagram` before `linkedin`, whatever order
   they were ticked in. Two offers selling the same thing send the same array.
3. **No duplicates.**
4. **The field is omitted entirely when there is nothing to say** — an offer
   that grants a course rather than an app sends no `channels` key at all.
   Treat *absent* as "this call is not about channels", not as "revoke
   everything".
5. **`entitlementKey` still arrives, unchanged.** Nothing about it moved.
6. **It arrives on every path**, not just a first purchase: a new sale, an
   admin granting access by hand, a cancellation, the retry sweep after the app
   was unreachable, and the backfill that replays what everybody already owns.

### What the app has to do

- **Read `channels` when present** and grant exactly those, revoking any
  channel not in the list. The array is the complete truth for that account,
  not a delta — somebody downgrading from both to Instagram alone sends
  `["instagram"]`, and LinkedIn must go away.
- **Fall back when it is absent.** Old queued retries and any call about a
  non-app grant will not carry it. Keep whatever the account already has.
- **Keep honouring `status`.** `"canceled"` still means remove access
  regardless of what `channels` says — a cancellation sends the channels the
  offer granted, and that is context, not an instruction to grant them.
- **Stay idempotent.** The store retries. The same body may arrive more than
  once and must land on the same state.

### Backfill on our side

Every offer that grants an app has been set to `["instagram"]` — that is what
they all sold. Once the app can read `channels`, the store can replay every
existing owner through the backfill so their access is restated explicitly.

## Testing it

The store will send this whether or not the app reads it, so **you can ship
your side whenever it is ready — nothing breaks in the meantime.** An app that
ignores `channels` behaves exactly as it does today.

To check by hand:

```bash
# Both channels
curl -X POST https://app.greaterinside.com/api/store/provision \
  -H 'content-type: application/json' \
  -H 'x-store-secret: <shared secret>' \
  -d '{"email":"test@example.com","entitlementKey":"content-engine","channels":["instagram","linkedin"],"status":"active","hasAccess":true,"stripeCustomerId":null,"stripeSubscriptionId":null}'

# Downgrade to Instagram only — LinkedIn must be revoked
curl -X POST https://app.greaterinside.com/api/store/provision \
  -H 'content-type: application/json' \
  -H 'x-store-secret: <shared secret>' \
  -d '{"email":"test@example.com","entitlementKey":"content-engine","channels":["instagram"],"status":"active","hasAccess":true,"stripeCustomerId":null,"stripeSubscriptionId":null}'

# Cancellation — access goes regardless of channels
curl -X POST https://app.greaterinside.com/api/store/provision \
  -H 'content-type: application/json' \
  -H 'x-store-secret: <shared secret>' \
  -d '{"email":"test@example.com","entitlementKey":"content-engine","channels":["instagram"],"status":"canceled","hasAccess":false,"stripeCustomerId":null,"stripeSubscriptionId":null}'
```

## Adding a third channel later

Three edits in the store and one conversation, in this order:

1. `lib/app-channels.ts` — add it to `APP_CHANNELS`.
2. A migration widening the `offers_grant_channels_known` CHECK.
3. Tell the app.

Doing (1) alone produces a tickbox that saves and a database that refuses it,
which is why `lib/app-channels.test.ts` asserts the list and the CHECK agree.

## Where this lives in the store

| | |
|---|---|
| The list of channels | `lib/app-channels.ts` |
| Column + CHECK + backfill | `supabase/migrations/0058_offer_grant_channels.sql` |
| What is sent to the app | `lib/apps.ts` → `notifyAppEntitlement` |
| Where an admin picks them | Offers → an offer → Access → "Channels in the app" |
| Tests | `lib/app-channels.test.ts` |
