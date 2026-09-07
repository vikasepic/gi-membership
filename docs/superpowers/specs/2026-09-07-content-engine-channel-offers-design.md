# Content Engine as three offers, and codes that buy time

**Date:** 7 September 2026
**Status:** approved in chat, awaiting implementation plan

## The problem

Content Engine is sold as one subscription that grants one channel. The store
wants to sell its two channels separately and together, and to run promotions
that give a longer free trial rather than money off.

Neither is possible today:

- **An offer grants a fixed channel set.** `grant_channels` exists and works,
  but there is one Content Engine offer, so there is one thing to buy.
- **A coupon cannot extend a trial.** Stripe coupons discount money. The trial
  comes from the price row and goes to Stripe as `trial_period_days`. There is
  no way to express "30 days free instead of 7".
- **A coupon cannot be limited to one billing interval.** Scoping is
  `products=<offer key>` metadata, which covers an offer's monthly and yearly
  prices together.

That last gap is not cosmetic. `duration: repeating, duration_in_months: 2` on
a **yearly** price discounts the whole annual invoice — the next one falls
twelve months later, outside the window. A "2 months free" code on the
$199/year plan gives away a free year. `DPBS` is configured exactly that way on
the live account today.

## What is being built

Three offers, all granting the Content Engine app, differing only in channels:

| Offer key | Channels | Monthly | Yearly |
|---|---|---|---|
| `content-engine-instagram` | `instagram` | $29, 7-day trial | $199 |
| `content-engine-linkedin` | `linkedin` | $29, 7-day trial | $199 |
| `content-engine` | `instagram`, `linkedin` | $58, 7-day trial | $398 |

The bundle is the exact sum of the two singles. That is deliberate and was
confirmed: it exists for convenience, not for a saving.

One person may hold several at once — buy Instagram today, add LinkedIn next
week — and each is its own Stripe subscription with its own trial and its own
cancellation.

## Design

### 1. The coupon carries the promotion

Two new optional metadata keys on a Stripe promotion code, read by
`resolveCoupon` alongside the existing `store` and `products`:

```
store      = grow                      (existing, required — default deny)
products   = content-engine-instagram  (existing, optional — which offers)
intervals  = month                     (NEW, optional — which billing periods)
trial_days = 30                        (NEW, optional — replaces the trial)
```

**`intervals`** is a comma-separated list of `day|week|month|year`. When
present, the price being bought must match one of them or the code is refused
with "That code can't be used on this purchase." A one-time purchase has no
interval and is refused by any code that names one.

**`trial_days`** replaces the price's own trial for this purchase. An integer
from 0 to 365; anything else is ignored rather than refused, so a typo in
Stripe cannot break a code that also carries a discount. It applies only to a
recurring purchase — on a one-time charge there is no trial to replace and it
is ignored.

This is interval-agnostic on purpose. The same mechanism gives Ajit his yearly
promotion — `trial_days=30, intervals=year` means 30 days free and then $199 —
and **that is the only mechanism that does.** A 100%-off-for-one-month coupon
on a yearly price does not give a free month; it gives a free year.

**Stripe requires a discount on every coupon**, so a code that only extends a
trial must still carry one. Use a nominal `percent_off` (0.01% is two cents on
$199 and invisible on a receipt), or give the code a real discount as well —
the two are independent.

**And the zero-discount guard has to admit it.** `resolveCoupon` currently
refuses any code whose computed discount is zero — "This order is already at
the minimum charge." A nominal 0.01% on a $29 price is 0.29 cents, which rounds
to zero, so a trial-only code would be refused outright. The guard becomes
`discount <= 0 && trialDays === null`. Without that change the mechanism above
cannot be expressed at all, which was a real defect in the first draft of this
spec, found while writing the plan.

**Scope gains the interval.** `CouponScope` becomes:

```ts
export type CouponScope = {
  /** The product's slug, or the offer's key. */
  item: string;
  /** The billing interval being bought; null for a one-time purchase. */
  interval: "day" | "week" | "month" | "year" | null;
};
```

Required rather than optional, for the reason the existing comment gives about
`item`: an optional field is one every future call site can forget, and
forgetting it is the bug this exists to prevent.

`AppliedCoupon` gains `trialDays: number | null`.

### 2. The trial override reaches Stripe

Both subscription-creation sites pass the override ahead of the price's own
value:

```ts
trial_period_days: coupon?.trialDays ?? offer.trialDays ?? undefined
```

- `lib/checkout.ts` ~696 — the offer path. `offerAtPrice` has already
  re-pointed the offer at the chosen price, so `offer.trialDays` is that
  price's trial.
- `lib/checkout.ts` ~942 — the product path, using `price.trialDays`.

The discount continues to be handed to Stripe as `discounts: [{ promotion_code }]`
and is not computed here. Stripe applies a coupon's duration to invoices, and
on a trial the first invoice is the first real one — the behaviour a buyer
expects, and the one this cannot get wrong by re-implementing.

**The checkout must say what the code did.** When a coupon changes the trial,
the summary says "30 days free, then $29/month" rather than the price's own
"7 days free". A promotion the buyer cannot see is a promotion they do not
trust.

**Switching price re-validates the code.** The interval is part of the scope,
so a monthly-only code applied and then followed by a switch to yearly is
dropped, with a message saying why. It must not silently persist and it must
not silently apply.

### 3. Trials are recorded per channel

`grantKeyOf` returns one key per offer today — `app:<appId>:<entitlementKey>` —
so all three offers would share a single trial.

It becomes `grantKeysOf(offer): string[]`, one key per channel:

```
app:<appId>:<entitlementKey>:ch:instagram
app:<appId>:<entitlementKey>:ch:linkedin
```

An offer with no channels keeps today's single key unchanged, so products and
the Funnel App are unaffected.

- `hasHadTrial` is true when **any** of the offer's keys is already recorded.
- Recording a trial writes **one row per key**.

The result: Instagram and LinkedIn can each be trialled once, monthly and
yearly of the same channel still share one trial, and the bundle is refused a
trial once either channel has been used. Maximum free access is 14 days rather
than the 21 that per-offer keying would allow.

**This deliberately reverses part of an earlier decision.** The current key is
app-wide specifically so monthly and yearly of one thing cannot both be
trialled. That property is kept — the channel is what splits, not the price.

### 4. One entitlement per person per app

`pushOwnershipStateToApps` sends one message per ownership row. Two
subscriptions granting the same app send two messages carrying the same
`entitlementKey` and different channel lists, and the second almost certainly
overwrites the first in the receiving app.

It changes to group rows by `(user, app)` and send **one** message:

- `channels` — the union across rows whose status is `active` or `trialing`
- `status` — `trialing` if any row is trialing, else `active` if any is active,
  else `past_due` if any is, else `canceled`
- `hasAccess` — false only when the status is `canceled`

Cancelling Instagram while LinkedIn continues therefore sends
`channels: ["linkedin"], status: "active"`, and the app must replace rather
than merge. That requirement is written up for the Content Engine developer in
`docs/content-engine-entitlement-contract.md`.

Apps whose offers grant no channels are unaffected: the union is empty, the
field is omitted exactly as today, and grouping a single row changes nothing.

### 5. The pages

**No new work.** `/o/<key>` already renders `livePrices(offer.prices)`, and
`/checkout/offer` already accepts `?price=` and shows every live price — the
Funnel App has sold monthly and yearly this way since August. The three offers
get their prices and their pages follow.

The two new offers need their own page sections, because `/o/<key>` returns
404 for an offer that has none. They are copied from the Instagram offer's
eleven sections and edited, using the existing copy-page tool rather than
built from scratch.

### 6. The offer rows themselves

Created through the admin, not a migration. `content-engine-instagram` already
exists with `grant_channels = {instagram}` and its monthly price; it needs its
yearly price added. The other two are new. Migrations are for schema — seeding
catalogue rows through them puts product decisions somewhere nobody looks for
them, and the admin path exercises the validation that a direct insert skips.

## What this does not do

- **No proof that a trial converts.** This store has created two subscriptions
  ever and both are still trialing; nothing has reached a first real charge.
  The trial-to-charge path is unverified for any card in any country. Deferred
  by agreement, and it is the largest risk here — see below.
- **No Indian card support for trials.** `setupIntents.create` is called with
  `usage: "off_session"` and no mandate options. Indian cards refuse
  off-session charges without an RBI e-mandate, which is what broke the order
  bump in August. A longer trial does not change the mechanism, but it does
  mean a failure surfaces 30 days later instead of 7. Out of scope; recorded.
- **No bundle discount.** Confirmed as intended.
- **No coupon admin.** Codes stay in Stripe, as they are today.
- **No migration of existing subscribers.** There is one live Content Engine
  ownership row and it is `canceled`; nothing needs moving.

## Risks

**The trial-to-charge path is unproven.** Everything here assumes a trial ends
and Stripe charges the saved card. That has never happened on this store. The
verification is cheap — a test-mode purchase, then read the resulting
subscription's invoices — and it should happen before a promotion depends on
it. `sub_1UAVVM…` reaches `trial_end` on 7 September 2026 and will answer it
for free.

**A duration-based coupon on a yearly price gives away a year.** `intervals`
makes this preventable but does not make it impossible: a code created without
that metadata still applies to every interval. The safest habit is to set
`intervals` on every recurring code, and the implementation should say so where
an admin will read it.

## Testing

- `intervals` — a code naming `month` is refused on a yearly price, accepted on
  a monthly one, and refused on a one-time purchase
- `trial_days` — replaces the price's trial; out-of-range and non-numeric
  values are ignored rather than refused; ignored entirely on a one-time charge
- A code with both a discount and `trial_days` applies both
- `grantKeysOf` — one key per channel; the no-channel offer keeps today's key
  exactly; monthly and yearly of one channel produce the same keys
- `hasHadTrial` — true when any one of an offer's channels has been trialled;
  the bundle is refused after either single has been used
- The entitlement union — two active rows send one message carrying both
  channels; cancelling one sends the remaining channel with an active status;
  cancelling both sends `hasAccess: false`; a single-row user is unchanged
- The checkout summary states the coupon's trial, not the price's
- Switching from monthly to yearly drops a monthly-only code and says so

## Open questions

None blocking. Whether `DPV` — 100% off, whole catalogue, `store=grow`, live
right now — should stay active is the owner's call and is not a dependency for
this work.
