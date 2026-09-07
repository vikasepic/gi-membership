# One access record per thing bought, not per app

**Date:** 7 September 2026
**Status:** approved in chat, awaiting implementation plan
**Follows:** `2026-09-07-content-engine-channel-offers-design.md`, whose central
promise the database currently forbids.

## The problem

The channel-offers design says each of the three Content Engine offers is "its
own Stripe subscription with its own trial and its own cancellation". It is
not, and cannot be:

```
ownership_user_app_uq :: UNIQUE (store_id, user_id, app_id) WHERE app_id IS NOT NULL
```

One access record per person per app, enforced by the database. When a second
offer grants the same app, `grantOfferOwnership` catches the `23505` and
**updates the existing row in place** (`lib/checkout.ts:1338`), overwriting
`offer_id`, `source`, `stripe_subscription_id` and `status`.

So buying LinkedIn after Instagram does not add a record. It overwrites the
Instagram one, and three things follow, all silent:

1. **The Instagram subscription is orphaned.** Nothing references `sub_A` any
   more.
2. **Cancelling it does nothing.** `syncSubscriptionOwnership` finds its row by
   `stripe_subscription_id` (`lib/subscription-sync.ts:58`). For an orphaned
   subscription that matches zero rows and no-ops, so the customer keeps being
   charged with no record and no way for a cancellation to take effect.
3. **The app is told to revoke the first channel.** `grantOfferOwnership` calls
   `notifyAppEntitlement` directly (`lib/checkout.ts:1373`) with that one
   offer's `grantChannels`, so at the moment of purchase Content Engine hears
   `channels: ["linkedin"]` and Instagram goes dark.

`unionEntitlement`, built for exactly this, never runs: its multi-row path is
unreachable while the index stands.

The revive exists for a real reason — a returning subscriber's old row is
`canceled`, and swallowing the conflict would leave them paid up with no
access. That reason survives; it just has to be keyed on the offer.

## Design

### The key becomes the thing bought

```sql
drop index ownership_user_app_uq;

create unique index ownership_user_app_offer_uq
  on ownership (store_id, user_id, app_id, offer_id)
  nulls not distinct
  where app_id is not null;
```

**`nulls not distinct` is required, not decoration.** Postgres treats NULLs as
distinct in a unique index by default, so without it every app-originated row —
`source = 'app'`, inserted by the app-sync bridge with no `offer_id` — could
duplicate without limit. One such row exists in production today, so this is a
live case, not a hypothetical. Postgres 15.8 supports the clause; it was added
in 15.

Product grants are untouched: `ownership_user_product_uq` keeps its own shape.

### The revive keys on the offer

`grantOfferOwnership`'s `23505` branch adds `.eq("offer_id", offer.id)` to its
update. A returning subscriber to the same offer still has their row revived;
a buyer of a *different* offer now inserts a second row instead of trampling
the first.

### The app hears the union at purchase, not one offer's channels

`grantOfferOwnership` currently builds a `notifyAppEntitlement` call by hand
from the offer it just granted. It moves to a new function in `lib/app-sync.ts`:

```ts
export async function pushAppEntitlement(
  storeId: string,
  userId: string,
  appId: string,
  ctx: { email: string; fullName?: string | null; stripeCustomerId: string | null },
): Promise<void>
```

It loads every ownership row for that (store, user, app), resolves each row's
offer channels, runs them through the existing `unionEntitlement`, and sends
one message. Best-effort, exactly as the current call is: an app being down
must never break a purchase.

This is the same shape `pushOwnershipStateToApps` already produces, so the two
paths finally agree — today one sends a union and the other sends one offer's
channels, and whichever ran last won.

### Three readers assume one row

- **`subscribedToApp`** (`lib/library.ts:117`) uses `.maybeSingle()` on
  `(user_id, app_id)`. With two rows PostgREST returns an error and the
  function reports "not subscribed" — so the library would offer someone a
  standing offer for something they already pay for. Becomes `.limit(1)`.
  It should also only count LIVE rows: a person whose only row is `canceled`
  is not subscribed, and today's version returns true for them.
- **The app-originated update** (`lib/app-sync.ts:288`) matches
  `(store_id, user_id, app_id)` and would now update *every* channel row when
  an app reports one subscription's status. It must match the row it means:
  by `stripe_subscription_id` when the caller has one, falling back to the
  offer-less row it created.
- **`app-backfill`** (`lib/app-backfill.ts:45`) selects by `app_id` to resend
  in bulk. Correct as-is — more rows simply means more to resend, and
  `pushOwnershipStateToApps` groups them.

### What stays exactly as it is

`syncSubscriptionOwnership` matching on `stripe_subscription_id` becomes
*correct* rather than needing a change: once a row exists per offer, each
subscription has its own row to find. That is the fix for consequence 2 above,
and it costs no code.

## What this does not do

- **No change to product ownership.** `ownership_user_product_uq` is untouched.
- **No backfill.** Three app-ownership rows exist and none is a duplicate under
  the new key; the index builds without conflict.
- **No proration, no upgrade path.** Someone holding Instagram and LinkedIn
  separately pays $58 and holds two subscriptions rather than being moved to
  the bundle. That was the explicit choice.

## Risks

**This index governs every app entitlement, not just Content Engine.** The
Funnel App is subject to it too. The mitigation is that its offers grant no
channels and it has one offer per app today, so its rows are unchanged in shape
and count — but the migration is the one step in this work that could affect a
paying customer of a different product, and it should be applied when someone
can watch.

**The revive branch is load-bearing and easy to get subtly wrong.** Adding
`.eq("offer_id", …)` to a revive that previously matched more broadly means a
returning subscriber whose row somehow lost its `offer_id` would get a second
row rather than a revival. That is the safer failure — two rows grant access,
one stale row does not — but it should be understood rather than discovered.

## Testing

- The index rejects a second row for the same (store, user, app, offer) and
  admits one for a different offer
- Two app-originated rows with NULL `offer_id` are still rejected — the
  `nulls not distinct` clause is doing its job
- `grantOfferOwnership` inserts a second row for a different offer and revives
  rather than duplicates for the same one
- `pushAppEntitlement` sends one message carrying both channels when two live
  rows exist, and drops a cancelled row's channels
- `subscribedToApp` is true with two live rows, false when every row is
  cancelled, and does not throw
- An app-originated status update touches only the row it names

## Open questions

None blocking.
