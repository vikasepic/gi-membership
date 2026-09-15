# Payment plans

Approved in chat, 15 Sep 2026.

## The problem

A new offer (Digital Product Business System, $497 or 3 payments of $199)
needs a way to pay that charges a fixed number of instalments and then
stops. The store's prices are one-time or open-ended recurring; there is no
"three, then done".

## Decisions taken in chat

| Question | Answer |
|---|---|
| A missed instalment | Pause access until Stripe collects it, the way a subscription pauses today |
| Plan pricing | Each plan sets its own instalment price; 3 × $199 may total more than $497 |
| Trials | Allowed. "7 days free, then 3 monthly payments" is a valid plan |

## Approach

A plan is a subscription that Stripe stops after N paid invoices. The
recurring path already saves the card (SetupIntent), creates the
subscription, grants ownership, pauses on `past_due`, revokes on cancel, and
records each later invoice as revenue with its campaign. A plan adds one
thing on the way in (a schedule that ends the subscription after N
invoices) and one thing on the way out (a subscription that ended because
it was paid in full keeps ownership instead of revoking it).

Rejected: `cancel_at` (date arithmetic that a delayed retry can land on the
wrong side of; iterations count invoices, which is what we mean) and
charging instalments ourselves from a cron (off-session charges, which the
RBI mandate rules already forced the bump away from).

## Data

Migration `0085_payment_plans.sql`. Check `ls supabase/migrations | tail -1`
first; 0084 is the last today.

`offer_prices` and `product_prices` each gain:

```
installments integer
check (installments is null or (installments between 2 and 24 and billing_type = 'recurring'))
```

A plan is a recurring price with `installments` set. `interval` and
`interval_count` say how often; `trial_days` may be set. Every existing
price keeps `installments = null` and behaves exactly as before.

`ownership` gains nothing. A plan's row lives like a subscription's while
instalments are being paid (`stripe_subscription_id` set, status
`active` / `trialing` / `past_due`). When the plan is paid off, the row
keeps `status = 'active'` and `stripe_subscription_id` is set to null, so
from then on `ownershipFor`, `subscribedToApp`, the library, the reconciler
(`.not("stripe_subscription_id", "is", null)`) and the connected apps all
see a plain owner.

## Stripe

Both places that create a store subscription (`lib/checkout.ts`, the offer
path and the product path) call one helper after `subscriptions.create`
when `price.installments` is set:

```
scheduleInstalments(sub, price):
  schedule = subscriptionSchedules.create({ from_subscription: sub.id })
  phases =
    trial ? [ { items, trial: true, end_date: sub.trial_end },
              { items, iterations: price.installments } ]
          : [ { items, iterations: price.installments } ]
  subscriptionSchedules.update(schedule.id, { end_behavior: "cancel", phases })
```

`items` is the subscription's own price at quantity 1. A separate trial
phase, rather than a trial inside the billing phase, so the billing phase
counts exactly N invoices whatever the trial length. Idempotent on
`plan_${sub.id}` so the thank-you page and the webhook racing each other
make one schedule.

Subscription metadata gains `installments: "3"`. The rest (orderId, offer
or product, campaign) is unchanged.

Coupons apply as Stripe applies them to any subscription: for as long as
the coupon says, across instalments. The checkout says "off each payment"
when a coupon lands on a plan.

## The way out

`customer.subscription.deleted` in `app/api/webhooks/stripe/route.ts`:

```
if sub.metadata.installments:
  paid = invoices on this subscription with status paid and amount_paid > 0
  if paid.length >= Number(sub.metadata.installments): markPlanPaidOff(sub.id)
  else: syncSubscriptionOwnership(sub.id, "canceled")   (as today)
else: as today
```

`markPlanPaidOff(subId)` in `lib/subscription-sync.ts`: update ownership
rows with that subscription id to `status = 'active'`,
`stripe_subscription_id = null`, then `pushOwnershipStateToApps` for them
and the CRM lifecycle tags for "went active" if the row was not active.
Counting invoices rather than trusting the event is what stops a schedule
that Stripe ended early (after failed retries) from reading as paid off. A
second delivery of the event matches no rows and is a no-op.

The pure decision, `planOutcome(installments, paidInvoiceCount)`, lives in
`lib/payment-plans.ts` so it can be tested without Stripe.

`customer.subscription.updated` with status `canceled` is not treated as
paid off; only `deleted` is, because that is the event a completed schedule
emits.

## Refunds

`refundOrder` already refunds the first charge and cancels the order's
subscription. When the subscription has a `schedule`, cancel the schedule
(`subscriptionSchedules.cancel`), which cancels the subscription with it;
Stripe refuses to cancel a scheduled subscription directly. Verified in
test mode by the integration test below. Refunding a later instalment
stays a Stripe dashboard action, as renewals are today.

## Copy

In `lib/offer-prices.ts` (used by the sales page, the checkout, the OTO and
the admin summary):

| | one-time | recurring | plan |
|---|---|---|---|
| `priceLabel` | `$497` | `$29/month` | `3 × $199` |
| `priceTerms` | null | `then $29 every month, cancel any time` | `3 monthly payments of $199, then it's yours` |
| with trial | | `7 days free, then …` | `7 days free, then 3 monthly payments of $199, then it's yours` |
| `priceSummary` | `$497, one-time` | `$29/month, then …` | `3 × $199 monthly ($597 total)` |
| `chargeNowCents` | price | 0 with trial, else price | 0 with trial, else the instalment |

"monthly" comes from the interval: `every 2 months` reads
`3 payments of $199 every 2 months`. `savingAgainst` returns null when
either price is a plan; a plan is a way to spread cost, not a discount, and
a badge that compared per-day cost would call it one.

`membershipTerms` in `lib/offer-terms.ts` (membership cards and tiles) says
the same plan sentence. `immediateChargeCents` is unchanged: plans sit on
the price rows, and the offer-level columns keep mirroring the default
price as they do now.

## Checkout

No new path. A plan price goes through the recurring branch: SetupIntent,
subscription, schedule. Due today shows the instalment (or $0 through a
trial), the terms line shows the plan sentence, and the Purchase event to
Meta and GA4 fires for the instalment amount on the first paid invoice,
with instalments 2 and 3 arriving through `recordRenewal` as they do for a
subscription.

A plan price is offered wherever a recurring price is offered today: the
main checkout, a bump, an upsell. The pickers list it with its summary.

## Admin

`components/admin/offer-price-fields.tsx` (shared by offers and products):
the **Bills** dropdown gains "In instalments". Choosing it sets
`billingType: "recurring"`, `installments: 3`, `interval: "month"`, and
shows **How many** (2 to 24) beside the existing **Every** controls. The
trial field stays available. Switching back to Once or to a plain interval
clears `installments`.

`lib/prices-field.ts` validates: `installments` is null or an integer 2 to
24, and only with `billingType: "recurring"`. `lib/admin.ts` reads and
writes the column on both tables; the "may not reprice a row somebody is
on" rule covers `installments` too.

Orders: the first instalment is the order; later instalments show as
renewals on the same row with the campaign, as subscriptions do. The order
detail's price line uses `priceSummary`, so it reads "3 × $199 monthly".

## Library

Unchanged this round. A paid-off plan reads "Active" like any purchase; a
plan in dunning reads "Payment failed, update your card" like a
subscription. A "2 of 3 paid, next on 20 Oct" line and a pay-off-early
button are the obvious next step and are deliberately not here.

## Edge cases

- Ownership says owned after payoff, so the buyer cannot be re-sold it.
- A schedule ended early by Stripe (retries exhausted) is `canceled`, not
  paid off; the invoice count decides.
- A $0 trial invoice does not count as an instalment (`amount_paid > 0`).
- Duplicating an offer or product copies `installments` with the row.
- Existing subscriptions have no `installments` metadata and take the
  path they always took.

## Tests

Unit: `lib/offer-prices.test.ts` (label, terms with and without trial,
summary, chargeNow, savingAgainst null on a plan), `lib/prices-field` (the
2 to 24 rule, the recurring-only rule, the round trip), `lib/payment-plans.test.ts`
(`planOutcome`), the webhook branch with a fake Stripe (deleted event with
`installments: 3`: 3 paid invoices pays off, 2 cancels, a $0 invoice does
not count), `markPlanPaidOff` against the local database.

Integration, Stripe test mode, inside `describe.skipIf(!canRun)`: buy an
offer on a `3 × $1` monthly plan, assert the subscription has a schedule
with `end_behavior: cancel` and a billing phase of 3 iterations (and a
trial phase when `trial_days` is set), then refund the order and assert the
schedule and subscription are canceled.

## Deploy order

1. Apply `0085` to production, `notify pgrst, 'reload schema';`. Old code
   never reads the column.
2. Deploy.
3. Add the plan row to the new offer in the admin, preview, publish.
