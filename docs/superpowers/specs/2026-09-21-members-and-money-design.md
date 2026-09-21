# Members and Money: design

Status: proposed, 21 Sep 2026. Prototype: the "Members and Money" artifact.

## Why

The admin has two lists, Members and Orders, and neither answers the questions an
owner asks about a business that sells trials and subscriptions: who is on a trial
and when does it end, who finished a trial and paid, who renewed, how much has one
person paid us in total, what came in this week. Renewals are written as orders but
never shown; subscriptions store a Stripe id and a status and no dates; "Spent"
counts first orders only; the tiles at the top are fixed to the whole store.

## What it becomes

One ledger, three views, one person page.

- **Ledger.** Every money movement or promise is a row with a kind: first
  purchase, renewal, add-on (bump), upsell, trial started, refund, cancellation,
  dispute. Orders already hold all but cancellation and dispute; those become rows
  too. This is the single source every screen sums from, so a total on one page
  can never disagree with another.
- **Subscriptions.** A new table, one row per Stripe subscription: offer, user,
  status, trial end, current period end, cancel at period end, cancelled at,
  amount and interval, paid invoice count, paid total, first and last paid at.
  Written by the Stripe webhook on subscription and invoice events, backfilled
  once from Stripe for every live subscription, reconciled nightly. Ownership
  stays what it is (access); this is billing.
- **Members.** Who they are, where they are in their journey, what they hold,
  the next thing that will happen to them, and what they have paid in total.
- **Transactions** (replaces Orders). The ledger, filtered by time, kind, product
  or offer and source, with totals that follow the filter and a breakdown by
  product and by source beside the list.
- **Person.** One page per member: total paid, recurring amount, next event, the
  full money timeline, every subscription with its dates and a cancel-at-period-end
  action, holds, and the grant, refund and Stripe links.
- **Trial conversion.** A cohort table by trial start week: started, converted,
  cancelled or lapsed, still on trial, rate, paid so far.

## Definitions

- **Total paid**: the sum of every paid ledger row for the person minus refunds,
  across orders, add-ons, upsells and subscription renewals. Live mode only.
  Reconciled against Stripe's charges for the customer nightly; a mismatch is an
  admin error, not a silent correction.
- **Journey** (one per person, the strongest current state): paying, on trial,
  trial cancelled (ended or cancelled without a payment), cancelling (paying but
  cancel at period end), lapsed (paid before, nothing active), one-off buyer
  (owns something, nothing recurring), no access.
- **Converted**: any subscription that had a trial and has at least one paid
  invoice. A filter, not a journey state, so a converted member who later
  cancels still shows as converted for the month they converted.
- **Next event**: the earliest of trial end, next renewal, or cancellation date
  across the person's subscriptions.
- **Tiles follow the filter.** Every tile is computed from the rows the filter
  leaves, on both screens.

## Members screen

Tiles: Members · Paying (count, recurring per month) · On trial (count, ending
this week) · Converted this month · Cancelled this month · Collected (net, all
time, from these people).

Filters: journey chips with counts; product or offer; next event within 7 days;
joined date range; search. Sort: newest, next event, total paid, last payment.

Columns: Member (name, email) · Joined (date, source) · Journey (pill, what they
hold) · Next event (what, when, relative) · Payments (count, refunds) · Total
paid · Last payment. Row opens the person page. CSV export of the filtered list.

## Transactions screen

Tiles: Gross · Refunds · Net · Renewals (count, amount) · New customers · Trials
started. Range presets: today, 7 days, 30 days, this month, all time, custom.
Filters: kind chips (multi), product or offer, source, live only. Rows grouped
by day: time · person · kind and what · source · amount. Beside the list: net by
product or offer, net by source. CSV export.

## Data work

1. Migration: `subscriptions` table; `orders.kind` extended with `cancel` and
   `dispute` rows (zero amount) so the ledger is one table. Indexes on
   (user_id, created_at) and (kind, created_at).
2. Webhook: on `customer.subscription.created|updated|deleted` upsert the
   subscription row; on `invoice.payment_succeeded` bump paid count, total and
   last paid at (the renewal order already exists); on `charge.refunded` and
   `charge.dispute.created` write the ledger row.
3. Backfill: one script, run by hand against production, reading every live
   subscription from Stripe into the table, and every paid invoice since the
   store opened into renewal rows where one is missing.
4. Read models: `memberSummary(userId)` and `ledger(filter)` in one lib file,
   each covered by an integration test against the local store.
5. Nightly reconcile against Stripe (charges per customer), writing an admin
   error on drift.

## Phases

1. Data: migration, webhook, backfill, read models. Verify the first real trial
   conversion writes a renewal row.
2. Members screen and person page.
3. Transactions screen with breakdowns and CSV.
4. Trial conversion cohort.

## Not in this design

Email or WhatsApp nudges before a trial ends; forecasting; per-campaign ROAS
(Traffic owns that); editing a subscription's price.
