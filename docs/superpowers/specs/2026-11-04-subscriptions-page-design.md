# Subscriptions page: Trials and Renewals become one

Asked for 4 Nov 2026 by the owner: "having both these 2 separately doesn't
make sense... have 1 as subscription and then all in 1 page with filters."

## Why

Trials (/admin/trials) and Renewals (/admin/renewals) are two views over the
same subscription rows, and each answers half of one question: how is the
subscription business doing. What the owner opens them to find out, in their
words: how many subscriptions are running, what revenue came in, how much
will come in over dates they pick, how many cancelled, how many are on trial,
how many converted.

## What the owner decided

- **One page, "Subscriptions"**, replacing both sidebar items.
- **Subscriptions only.** One-time purchases are not on this page.
- **One date range drives the page** (layout A of three shown, 4 Nov). The
  past part of the range shows money **collected**; the part from today on
  shows money **expected** (the projection). A range wholly in the past shows
  only Collected, wholly in the future only Expected; spanning today, both,
  side by side.
- **Filters** reshape everything: date range, offer, state.
- **Keep the "By the week they started" trials table** from today's Trials
  page.
- **The list follows the date range** (owner, 4 Nov, my recommendation
  accepted): it shows every subscription where something happened inside
  the range: money collected, a charge expected, it started, or it ended
  (`ended_at`), or a running trial ends (`trialEnd`). Last month shows who
  paid, joined and left last month; the next 30 days shows who is due to
  pay, which is today's Renewals page. The chip counts are counts of this
  list, so "All" never means every subscription ever.
- **Each row that began as a trial says what became of it** (owner, 4 Nov,
  my recommendation accepted), from `trialOutcomeOf` / `outcomeAt`:
  "trial, converted 12 Oct", "trial, cancelled 3 Oct", "trial, free access",
  "trial, ends in 2 days". This replaces the Trials page's Converted / Free
  access / Cancelled / Ending views and its "What happened" column.

## What the page shows (my calls, from the playback the owner said yes to)

Top to bottom:

1. **Date range** with presets: Last 30 days, This month, Next 30 days, and a
   custom from/to. Default: last 30 days through next 30 days, so both
   numbers show on arrival (my call). An offer picker beside it ("All offers"
   default, every Grow offer and product that has subscriptions).
2. **Numbers:**
   - **Collected** (range start to today): subscription money actually
     charged in the range.
   - **Expected** (today to range end): money due in the range.
   - **Running now**: subscriptions that still give access and have paid:
     `subView` states paying + cancelling + past due, the same set Members'
     MRR counts (lib/member-money.ts:241). Hint: "N paying, N cancelling,
     N past due". "Now" figures ignore the date range, labelled so (my call).
   - **On trial now**, with "N end this week".
   - **Trials converted in range**: count and rate (see Rules).
   - **Ended in range**, with "N set to cancel" beside it (see Rules).
3. **State chips**, each with its count. They narrow the list only, not the
   numbers above (my call; the numbers answer "how is the business", the chips
   answer "show me these people"). `subView`'s eight states map onto them
   (my call):
   - All
   - Active: `paying`
   - On trial: `on trial`
   - Free access: `free access`
   - Past due: `past due`
   - Cancelling: `cancelling`, and `trial cancelled` while the subscription
     is still trialing (a running trial set to cancel), as Renewals counts it
     (lib/renewals-view.ts:51)
   - Ended: `cancelled`, `trial ended`, and `trial cancelled` once it is no
     longer live
4. **The list**: one row per subscription with something in the range (see
   above). Person (links to `/admin/members/<id>`), offer, state with the
   trial outcome line when it began as a trial, next charge (Stripe's figure
   and date, with the coupon note as on Renewals), started, paid so far. Sort by
   next charge date (default) or amount, as Renewals has.
5. **By the week they started**: the existing trials table, unchanged,
   following the offer filter.

## Rules for the numbers

Reuse what exists; do not write a second rule for anything already decided.

- **States** come from `subView` (lib/member-money.ts) and trial outcomes
  from `trialOutcomeOf` (lib/trials-view.ts), including "free access" (an
  active subscription after a trial with nothing paid: a 100% coupon, not a
  failed payment, 30 Sep).
- **Which subscriptions**: Grow's own, live mode only, as both pages do now
  (`livemode`, and an offer or product id; a connected app's own signup has
  neither and is not this store's money).
- **Days are UTC**, as Traffic's ranges are (lib/traffic-funnel.ts:342-364,
  `rangeOf`) and as `fmtDate` prints (components/admin/money-ui.tsx:69).
- **Collected** = the amounts of `order_items` that belong to one of those
  subscriptions, on `paid` orders, by the order's `created_at`, inside the
  range and not after now. Refunded orders are out (their status is
  `refunded`). On production 4 Nov: 72 paid renewal lines carry
  `stripe_subscription_id`, and the first charges of subscription bumps and
  OTOs (163 paid lines) do too.
  Test-mode orders are out too, even on a live subscription.
  **A recurring product's first charge is the renewal line, not the checkout
  line** (corrected after the final review, 4 Nov). The checkout writes a
  `product` line before the subscription exists, so it carries no id
  (lib/checkout.ts:560-568). Stripe's first invoice then finds no order line
  with the id, falls back to ownership (`fromOrder: false`, lib/renewals.ts),
  and records a `renewal` line for that same charge. So only lines carrying
  the subscription's id are counted; counting the checkout line as well
  counted the first charge twice. (This document first said the reverse.)
- **Expected** (today to range end): money due in the range.
   - **Running now**: subscriptions that still give access and have paid:
     `subView` states paying + cancelling + past due, the same set Members'
     MRR counts (lib/member-money.ts:241). Hint: "N paying, N cancelling,
     N past due". "Now" figures ignore the date range, labelled so (my call).
   - **On trial now**, with "N end this week".
   - **Trials converted in range**: count and rate (see Rules).
   - **Ended in range**, with "N set to cancel" beside it (see Rules).
3. **State chips**, each with its count. They narrow the list only, not the
   numbers above (my call; the numbers answer "how is the business", the chips
   answer "show me these people"). `subView`'s eight states map onto them
   (my call):
   - All
   - Active: `paying`
   - On trial: `on trial`
   - Free access: `free access`
   - Past due: `past due`
   - Cancelling: `cancelling`, and `trial cancelled` while the subscription
     is still trialing (a running trial set to cancel), as Renewals counts it
     (lib/renewals-view.ts:51)
   - Ended: `cancelled`, `trial ended`, and `trial cancelled` once it is no
     longer live
4. **The list**: one row per subscription with something in the range (see
   above). Person (links to `/admin/members/<id>`), offer, state with the
   trial outcome line when it began as a trial, next charge (Stripe's figure
   and date, with the coupon note as on Renewals), started, paid so far. Sort by
   next charge date (default) or amount, as Renewals has.
5. **By the week they started**: the existing trials table, unchanged,
   following the offer filter.

## Rules for the numbers

Reuse what exists; do not write a second rule for anything already decided.

- **States** come from `subView` (lib/member-money.ts) and trial outcomes
  from `trialOutcomeOf` (lib/trials-view.ts), including "free access" (an
  active subscription after a trial with nothing paid: a 100% coupon, not a
  failed payment, 30 Sep).
- **Which subscriptions**: Grow's own, live mode only, as both pages do now
  (`livemode`, and an offer or product id; a connected app's own signup has
  neither and is not this store's money).
- **Days are UTC**, as Traffic's ranges are (lib/traffic-funnel.ts:342-364,
  `rangeOf`) and as `fmtDate` prints (components/admin/money-ui.tsx:69).
- **Collected** = the amounts of `order_items` that belong to one of those
  subscriptions, on `paid` orders, by the order's `created_at`, inside the
  range and not after now. Refunded orders are out (their status is
  `refunded`). On production 4 Nov: 72 paid renewal lines carry
  `stripe_subscription_id`, and the first charges of subscription bumps and
  OTOs (163 paid lines) do too.
  **A recurring product's first charge has no subscription id on its line**
  (checked 4 Nov): the base product line is written when the SetupIntent is
  created, before the subscription exists (lib/checkout.ts:560-568), and
  `recordRenewal` skips the `subscription_create` invoice because that origin
  order exists (lib/renewals.ts:105). So that `product` line is the only
  record of the first charge. Attribute it by the order's `userId` + the
  line's `productId` to the matching Grow subscription row (same user, same
  product). After a trial, the first real charge arrives as
  `subscription_cycle` with a `renewal` line that carries the id
  (lib/renewals.ts:172-181), so nothing special is needed there.
- **Expected** = for each subscription whose next charge falls between now
  and the range end: Stripe's preview amount (`next_charge_cents`, 0097), so a
  free month counts $0. Past due counts (still owed while Stripe retries), as
  Renewals does. Cancelling and cancelled count nothing. When the range runs
  past one billing period, each later charge in the range counts at the
  subscription's list amount (`amount_cents`), assuming nobody cancels and no
  coupon changes. A payment plan stops after its last instalment
  (`installments`, `paid_invoices`). A next charge Stripe has not previewed
  yet is "unknown" and counted as such, never filled from the list price,
  as Renewals does now (`renewalTotals.unknown`). Say on the page, in one
  short line, that later charges are at list price.
  Past due is counted the way Renewals counts it today: Stripe's preview of
  the next invoice at `currentPeriodEnd` (lib/subscriptions.ts:255-258). The
  open, overdue invoice's own amount is not stored, and fetching it is out of
  scope (my call; the amounts usually match).
- **Converted in range**: the existing trial rules, unchanged (my call, per
  "do not write a second rule"). A trial counts in the range when its
  `outcomeAt` (lib/trials-view.ts:85: first payment for converted, the
  cancel date for cancelled, the trial end otherwise) falls inside it. The
  rate is converted / (converted + lost), the denominator Trials uses today
  (app/admin/trials/page.tsx:37-38); free access is shown beside it as its
  own number, "neither won nor lost" (lib/trials-view.ts:146). A running trial
  already set to cancel is lost on the day the cancel was asked for, as now.
- **Ended in range**: subscriptions that had paid at least once and whose
  access ended (`ended_at`) inside the range (my call). Not `canceled_at`:
  Stripe sets that on the day a period-end cancellation is *asked for*, so
  subscriptions still running would be counted twice, once here and once as
  "set to cancel". Never-paid trials are left out because the conversion
  number already counts them as lost. "Set to cancel" = the Cancelling chip
  count today, with the earliest date it ends.

## Navigation

- Sidebar: one "Subscriptions" item where Trials and Renewals were
  (components/admin/sidebar.tsx). Route `/admin/subscriptions`.
- `/admin/trials` redirects to `/admin/subscriptions?state=trial`, and
  `/admin/renewals` to `/admin/subscriptions` with the range set to the next
  30 days and all states, which lists what the Renewals page listed:
  renewals, trials converting, past due and cancellations in those days. A
  relative `Location`, per AGENTS.md.
- Every URL value (range, offer, state, sort) is a whitelist: unknown values
  pick the default. Dates must parse as `YYYY-MM-DD`; a from after to swaps
  them (my call).

## How it is built

- Server page over `loadMoneyData` (lib/money-data.ts); the derivations are
  pure functions over `MoneyData`, as Members, Trials and Renewals already
  are, so they are tested without a database. `lib/renewals-view.ts` and
  `lib/trials-view.ts` hold most of the logic and should be folded into one
  `lib/subscriptions-view.ts` (or reused from it) rather than copied.
- Visual language: the existing money screens (`Tile`, `Chip`, `Th`,
  `Empty`, `fmtDate` in components/admin/money-ui.tsx). No new chart.
- `loadMoneyData` must read orders and items through `allRows` (it already
  does; keep it).

## Not in scope

- One-time purchases, revenue from connected apps' own billing.
- Charts.
- Actions on a subscription from this list (cancel, extend trial): they stay
  on the member page.
- Changing Members or Transactions.

## Tests

- Pure tests over `MoneyData` fixtures:
  - Collected: a paid renewal inside the range counts, one outside does
    not, a refunded one does not, a one-time line does not, a test-mode
    order does not.
  - Expected: Stripe's figure for the first charge, list price for later
    ones in a 90-day range, a plan stops after its last instalment, an
    unknown figure counts as unknown, a cancelling subscription counts
    nothing.
  - A range wholly in the past has no Expected; wholly in the future, no
    Collected.
  - Converted and cancelled counts respect the range edges.
  - The URL filter whitelists everything; a swapped range is swapped back.
  - The list keeps a subscription that paid, started, ended or is due in the
    range, and drops one with nothing in it; chip counts match the list.
  - The trial outcome line for converted, cancelled, free access and a
    running trial.
- The redirects from the two old routes.
- The existing tests move to the new view, not deleted:
  lib/renewals-view.test.ts, lib/trial-outcome.test.ts,
  lib/trials-filter.test.ts, lib/free-access.test.ts, and
  app/admin/money-pages.integration.test.tsx (it opens the old routes).
  `trialOutcomeOf` is also imported by lib/ledger.ts; if trials-view.ts is
  folded in, that import follows it.

## Shipping order

No migration. Full suite (CI-style), then the 60-second notice and push when
the owner says push.
