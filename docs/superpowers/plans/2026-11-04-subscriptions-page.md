# Subscriptions Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace /admin/trials and /admin/renewals with one /admin/subscriptions page: a date range that splits into money collected (past) and expected (future), counts, offer and state filters, one list, and the weekly trials table.

**Architecture:** A new pure module `lib/subscriptions-view.ts` over `MoneyData` (lib/money-data.ts) holds every rule: the URL filter, one row per Grow subscription with its collected charges, the expected charges in a range, the totals, the list rule and the trial outcome line. It reuses `subView` (lib/member-money.ts) for states and `deriveTrials` / `trialsByWeek` / `trialsOf` (lib/trials-view.ts) for trials. The page is a server component over it; the two old routes become redirects; `lib/renewals-view.ts` is folded in and deleted.

**Tech Stack:** Next.js 16 server components, vitest (pure tests over `MoneyData` fixtures, as lib/renewals-view.test.ts does).

**Spec:** docs/superpowers/specs/2026-11-04-subscriptions-page-design.md

## Global Constraints

- Subscriptions only: Grow's own (`offerId` or `productId` set) and `livemode`. Connected apps' own signups and one-time sales are out.
- Days are UTC. A range is whole days: `from` 00:00:00Z to the end of `to` (23:59:59.999Z).
- Every URL value is a whitelist; an unknown value picks the default. Dates must match `YYYY-MM-DD`; a `from` after `to` is swapped.
- Expected never fills an unknown Stripe preview from the list price; later charges in a long range use `amountCents`.
- Visual language: `Tile`, `Chip`, `Pill`, `Th`, `Empty`, `fmtDate`, `Soon` from components/admin/money-ui.tsx. No chart.
- Redirects use `redirect()` with a relative path (AGENTS.md: never `new URL(path, req.url)`).
- No migration. Prose in UI copy: no em dashes.

## Review Focus

1. A range wholly in the past must show no Expected tile figure, and wholly in the future no Collected. Test in Task 2.
2. A monthly subscription in a 90-day range: the first charge is Stripe's preview (a coupon month is $0), the next two are at list price. Test in Task 2.
3. A payment plan with 2 of 3 instalments paid expects one more charge only, however long the range. Test in Task 2.
4. A recurring product's first charge (a `product` line with no subscription id) still lands in Collected. Test in Task 1.
5. `/admin/renewals` and `/admin/trials` bookmarks land on the new page with the right filter. Test in Task 3.

---

### Task 1: Rows, collected charges and the URL filter

**Files:**
- Create: `lib/subscriptions-view.ts`
- Test: `lib/subscriptions-view.test.ts` (fixture helpers `sub()` and `data()` modelled on lib/renewals-view.test.ts; add `order()` and `item()` helpers for `OrderRowLite` / `ItemRow`)

**Interfaces:**
- Produces:

```ts
export type SubChip = "active" | "trial" | "free" | "past-due" | "cancelling" | "ended";
export const SUB_CHIPS: SubChip[];
export type SubFilter = { preset: "around" | "last-30" | "this-month" | "next-30" | "custom"; from: string; to: string; offer: string; state: "all" | SubChip; sort: "date" | "amount" };
export function subFilterFrom(sp: Record<string, string | string[] | undefined>, today: string): SubFilter;
export type Charge = { at: string; cents: number };
export type SubRow = {
  stripeSubscriptionId: string; userId: string | null; email: string; name: string | null;
  what: string; offerId: string | null; productId: string | null;
  state: SubView["state"]; chip: SubChip;
  startedAt: string; endedAt: string | null; cancelsAt: string | null; trialEnd: string | null;
  nextChargeAt: string | null; nextChargeCents: number | null; nextChargeNote: string | null;
  priceCents: number; currency: string; interval: string | null; intervalCount: number | null;
  installments: number | null; paidInvoices: number; paidTotalCents: number;
  charges: Charge[];
  trial: { outcome: TrialOutcome; at: string | null } | null;
};
export function deriveSubscriptions(d: MoneyData): SubRow[];
```

- [ ] **Step 1: Write the failing tests**

```ts
describe("subFilterFrom", () => {
  it("defaults to 30 days back through 30 days ahead", ...)
    // subFilterFrom({}, "2026-11-04") toEqual { preset: "around", from: "2026-10-05", to: "2026-12-04", offer: "", state: "all", sort: "date" }
  it("resolves the presets on the given day", ...)
    // last-30 -> 2026-10-06..2026-11-04; this-month -> 2026-11-01..2026-11-04; next-30 -> 2026-11-04..2026-12-03
  it("takes a custom range and swaps one given backwards", ...)
    // { from: "2026-12-01", to: "2026-11-01" } -> preset "custom", from "2026-11-01", to "2026-12-01"
  it("whitelists everything off the URL", ...)
    // { preset: "x", from: "1 Nov", state: "drop", sort: "y" } -> the defaults
});

describe("deriveSubscriptions", () => {
  it("keeps Grow's live subscriptions only", ...)
    // test-mode and no-offer-no-product rows are left out
  it("maps every subView state onto a chip", ...)
    // paying->active, on trial->trial, free access->free, past due->past-due, cancelling->cancelling,
    // trial cancelled while trialing->cancelling, trial cancelled after it ended->ended, trial ended->ended, cancelled->ended
  it("collects the paid lines that carry its subscription id", ...)
    // a paid renewal line and a paid oto line with stripeSubscriptionId -> charges [{at: order.createdAt, cents}]
  it("leaves out refunded orders and other subscriptions' lines", ...)
  it("collects a recurring product's first charge, which carries no subscription id", ...)
    // order (paid, userId u) + item kind "product", productId p, stripeSubscriptionId null; sub userId u productId p -> one charge
  it("does not give a one-off product line to a subscription for a different product", ...)
  it("records what became of a trial", ...)
    // a sub with trialEnd set -> trial { outcome: "converted", at: firstPaidAt }; one with none -> trial null
});
```

- [ ] **Step 2: Run, confirm they fail** — `npx vitest run lib/subscriptions-view.test.ts`; expected: cannot resolve `@/lib/subscriptions-view`.

- [ ] **Step 3: Implement.** States from `subView`; the trial from `trialOutcomeOf` and the same `outcomeAt` rule as lib/trials-view.ts:85 (extract that rule into an exported `trialOutcomeAt(s)` in lib/trials-view.ts and use it in both, so there is one). Product-line attribution: a paid order's `product` line with no subscription id goes to the Grow subscription with the same `userId` and `productId`; first match by `startedAt` when there are several. Rows sorted by `startedAt` descending. `subFilterFrom`'s `today` is a parameter, as `rangeOf` (lib/traffic-funnel.ts) takes it.

- [ ] **Step 4: Run, confirm they pass.** Same command; all PASS.

- [ ] **Step 5: Commit** — `git commit -m "Subscriptions view: one row per subscription, with the charges it collected"`

---

### Task 2: Expected charges, totals and the list rule

**Files:**
- Modify: `lib/subscriptions-view.ts`
- Test: `lib/subscriptions-view.test.ts`

**Interfaces:**
- Consumes: `SubRow`, `SubFilter`, `Charge` from Task 1.
- Produces:

```ts
export function expectedCharges(r: SubRow, now: Date, to: string): (Charge | { at: string; cents: null })[];
export type SubTotals = {
  collectedCents: number | null; expectedCents: number | null; unknown: number;
  running: { total: number; paying: number; cancelling: number; pastDue: number };
  onTrial: number; endingThisWeek: number;
  converted: number; lost: number; free: number; rate: number | null;
  ended: number; setToCancel: number; setToCancelFirst: string | null; currency: string;
};
export function subTotals(rows: SubRow[], f: SubFilter, now: Date): SubTotals;
export function inRange(r: SubRow, f: SubFilter, now: Date): boolean;
export function listRows(rows: SubRow[], f: SubFilter, now: Date): SubRow[];
export function chipCounts(rows: SubRow[], f: SubFilter, now: Date): Record<"all" | SubChip, number>;
export function trialNote(r: SubRow, now: Date): string | null;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe("expected charges", () => {
  it("the first is Stripe's figure, later ones in the range at list price", ...)
    // monthly, nextChargeAt now+10d, nextChargeCents 0, amountCents 5800, to = now+90d
    // -> cents [0, 5800, 5800]
  it("an unknown preview stays unknown", ...)               // nextChargeCents null -> first { cents: null }
  it("a payment plan stops after its last instalment", ...) // installments 3, paidInvoices 2 -> one charge
  it("a cancelling or ended subscription expects nothing", ...)
  it("past due is still owed, even with its date behind us", ...) // state past due, nextChargeAt now-2d -> one charge
  it("a trial's first charge comes at the trial end", ...)
});

describe("subTotals", () => {
  it("collected counts only charges between from and now", ...)
  it("a range wholly in the past has no expected; wholly in the future, no collected", ...)
    // expectedCents null / collectedCents null
  it("running is paying + cancelling + past due", ...)
  it("converted and lost follow trial outcome dates in the range; the rate leaves free access out", ...)
    // 2 converted, 1 cancelled, 1 free access in range -> converted 2, lost 1, free 1, rate 67
  it("ended counts access that ended in the range for subscriptions that paid", ...)
    // never-paid trial with endedAt in range is not counted
  it("set to cancel counts every cancelling subscription now, with the soonest date", ...)
});

describe("the list", () => {
  it("keeps a subscription that paid, started, ended or is due in the range", ...)
  it("drops one with nothing in the range", ...)
  it("the chip counts are counts of that list", ...)
  it("narrows by state and sorts by next charge date or amount, unknowns last", ...)
});

describe("trialNote", () => {
  it("says what became of a trial", ...)
    // "trial, converted 12 Oct 2026", "trial, cancelled 3 Oct 2026", "trial, free access", "trial, ends in 2 days"
  it("is null for a subscription that never had a trial", ...)
});
```

- [ ] **Step 2: Run, confirm they fail** (`expectedCharges` etc. not exported).

- [ ] **Step 3: Implement.** Expected: rows in state `paying`, `past due` or `on trial` with a `nextChargeAt`; a past-due date behind now is treated as now. Step forward by `interval` × `intervalCount` (day, week, month, year; month and year by calendar, UTC) while the date is ≤ end of `to`; count only dates ≥ now. Cap the number of charges at `installments - paidInvoices` when `installments` is set. Collected: `charges` with `at` in [from, min(end of to, now)]. `collectedCents` null when `from` is after today; `expectedCents` null when `to` is before today. Offer filter (`f.offer`, matching `offerId` or `productId`) applies to totals, list and chips; an id matching nothing is treated as no filter (as `trialsOf` does). Converted, lost and free come from rows' `trial` with `at` in range: converted = "converted", lost = "cancelled" | "ended unpaid", free = "free access"; rate = round(converted / (converted + lost) × 100), null when both are 0. `inRange`: any collected charge in range, any expected charge in range, `startedAt`, `endedAt`, `cancelsAt`, or (chip "trial") `trialEnd` in range. `trialNote` dates via `fmtDate`, the days via `relative` (both components/admin/money-ui.tsx; move `relative` and `fmtDate` into lib if importing a `.tsx` into lib is not already done elsewhere).

- [ ] **Step 4: Run, confirm they pass.**

- [ ] **Step 5: Commit** — `git commit -m "Subscriptions view: what is expected, the totals, and which rows a range lists"`

---

### Task 3: The page, the sidebar and the redirects

**Files:**
- Create: `app/admin/subscriptions/page.tsx`
- Modify: `app/admin/trials/page.tsx`, `app/admin/renewals/page.tsx` (each becomes a redirect)
- Modify: `components/admin/sidebar.tsx:74-76` (one item `{ href: "/admin/subscriptions", label: "Subscriptions", icon: ICON.members }`)
- Modify: `app/admin/money-pages.integration.test.tsx` (the two Trials tests become Subscriptions tests)

**Interfaces:**
- Consumes: everything Tasks 1-2 produce; `deriveTrials`, `trialsOf`, `trialsByWeek` from lib/trials-view.ts for the weekly table.

- [ ] **Step 1: Write the failing tests** in money-pages.integration.test.tsx:

```ts
it("Subscriptions renders even with nothing to show", ...)
  // html contains "Subscriptions", "Collected", "Expected", "Running now", "By the week they started"
it("Subscriptions survives an offer filter naming something that no longer exists", ...)
  // searchParams { offer: "no-such-offer", state: "ended" } -> renders, contains "Running now"
it("the old Trials and Renewals links land on Subscriptions", ...)
  // calling each old Page throws Next's redirect error whose digest contains
  // "/admin/subscriptions?state=trial" and "/admin/subscriptions?preset=next-30"
```

- [ ] **Step 2: Run, confirm they fail** — `npx vitest run app/admin/money-pages.integration.test.tsx`.

- [ ] **Step 3: Build the page**, top to bottom as the spec's "What the page shows": heading "Subscriptions" and one line of description; a GET form with preset chips (Around today, Last 30 days, This month, Next 30 days), from/to `<input type="date">`, offer `<select>` (whitelisted against offers that have a subscription row), Apply; tiles: Collected ("{from} to today"), Expected ("today to {to}", with "plus N not yet known" and the line "Later charges at list price, assuming nobody cancels"), Running now (hint "N paying, N cancelling, N past due"), On trial now ("N end this week"), Trials converted in range ("{rate}% · N free access"), Ended in range ("N set to cancel"); a tile whose figure is null is left out. State chips with `chipCounts`; the table with Person (link to `/admin/members/<id>`), Subscription (what, plus `trialNote` muted under it), State (`Pill`), Next charge (amount, note, `Soon`), Started, Paid so far; sort select. Then "By the week they started" exactly as app/admin/trials/page.tsx renders it today, fed by `trialsByWeek(trialsOf(deriveTrials(data), offer))`. Copy that table's markup across before turning trials/page.tsx into a redirect.

- [ ] **Step 4: Redirects and sidebar.** trials/page.tsx: `redirect("/admin/subscriptions?state=trial")`; renewals/page.tsx: `redirect("/admin/subscriptions?preset=next-30")`. Sidebar: replace the two entries with the one above.

- [ ] **Step 5: Run the tests and typecheck** — the file above, then `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v '^tmp-'` (expected: no output).

- [ ] **Step 6: Verify in the browser** with the headless-Chrome admin script pattern (scratchpad access-seed.mjs / access-shot.mjs from the Access tab work): screenshot the default view, a past range (no Expected tile), and Next 30 days; check the tiles against a hand sum of the same rows. Clean up the seeded rows.

- [ ] **Step 7: Commit** — `git commit -m "Subscriptions: Trials and Renewals on one page"`

---

### Task 4: Fold in the old views

**Files:**
- Delete: `lib/renewals-view.ts`, `lib/renewals-view.test.ts` (after porting)
- Modify: `lib/trials-view.ts` (remove `trialsFor`, `TrialView`, `trialThings` if nothing else imports them after Task 3)
- Modify: `lib/trials-filter.test.ts` (drop the cases for removed functions; keep `trialsOf`'s)

- [ ] **Step 1: Port.** For each `it` in lib/renewals-view.test.ts whose behaviour still exists (Stripe's figure with its note, the past-due rule, apps and test mode left out, the URL whitelist), make sure lib/subscriptions-view.test.ts has an equivalent; add any missing one and watch it pass against the Task 2 code.
- [ ] **Step 2: Delete and prune.** `grep -rn "renewals-view\|trialsFor\|trialThings\|TrialView" lib app components` must print nothing afterwards.
- [ ] **Step 3: Full suite, CI-style.** Move `.env.local` to the scratchpad, `npx vitest run --exclude 'tmp-*/**'; echo "exit $?"`, move it back. Expected: `exit 0`. Then the same with `.env.local` in place (runs the integration test of Task 3). Expected: `exit 0`.
- [ ] **Step 4: Commit** — `git commit -m "Renewals view folded into Subscriptions"`, plus the spec and this plan.

Shipping (notice, push) waits for the owner's word, as always.
