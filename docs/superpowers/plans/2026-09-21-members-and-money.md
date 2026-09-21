# Members and Money implementation plan

> Executed inline. Spec: docs/superpowers/specs/2026-09-21-members-and-money-design.md

**Goal:** one ledger, a subscriptions table synced from Stripe, and four admin
screens (Members, Person, Transactions, Trials) whose tiles follow the filter.

## Global constraints

- Migration 0086 applied to production by hand before the image that reads it.
- Every money figure is live mode only. Total paid = paid orders (incl. renewals) − refunds.
- Journey states: paying · on trial · trial cancelled · cancelling · lapsed · one-off buyer · no access.
- No new dependency. Pure derivations in lib with unit tests; fetchers thin.

## Tasks

1. **Migration 0086_subscriptions.sql** — table, indexes, comments, reload schema.
2. **lib/subscriptions.ts** — `subscriptionRowFrom(sub, invoices, link)` (pure),
   `syncSubscription(id)`, `backfillSubscriptions()`, `listSubscriptions()`.
   Webhook: created/updated/deleted and invoice.payment_succeeded/failed call
   `syncSubscription`, never throwing. Cron route `/api/cron/sync-subscriptions`.
3. **lib/member-money.ts** — `deriveMembers(rows)` (pure) + `loadMembers()`;
   journey, next event, totals, MRR; filter/sort/tiles helpers; tests.
4. **lib/ledger.ts** — `deriveLedger(orders, items, subscriptions)` (pure) +
   `loadLedger()`; kinds; range/kind/offer/source filters; totals; breakdowns; tests.
5. **Screens** — /admin/members (rewrite), /admin/members/[id] (new),
   /admin/orders (rewrite as Transactions), /admin/trials (new), sidebar.
6. **Docs, deploy, backfill** — DATABASE.md, lessons; apply 0086; deploy;
   run backfill; verify against Stripe for two people.
