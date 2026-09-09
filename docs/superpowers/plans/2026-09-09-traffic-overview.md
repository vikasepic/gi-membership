# Traffic Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked funnel cards at `/admin/traffic` with one sortable table over every page — offers included as first-class funnels — plus date presets and a drill-in page.

**Architecture:** Four counting changes make an offer's funnel real (a hit on the offer checkout, an upsell view filed under its host offer, `orders.host_offer_id` so "Bought" is countable, and `buildFunnels` taking owners rather than products). The range model moves from a day count to an explicit inclusive day pair so month presets are expressible. The screen then becomes a table plus `/admin/traffic/[key]` for one funnel.

**Tech Stack:** Next.js 16 App Router (server components, `force-dynamic`), Supabase/PostgREST via `createServiceClient`, vitest (jsdom for components), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-09-traffic-overview-design.md`

## Global Constraints

- **Every window is UTC-calendar-bounded and inclusive of both ends.** `page_counts.day` is written from `toISOString()`, so the order query must be bounded by the same UTC midnights as the three view steps.
- **`today` is read once per request and passed in.** A request crossing UTC midnight between two reads builds a chart a day shorter than the totals beside it. Never call `todayUtc()` inside a reader.
- **Values off the URL are whitelisted, never parsed.** An unrecognised value selects the default; it never reaches a query and never renders nothing.
- **Everything in `lib/traffic.ts` swallows its own errors** and returns an empty result. It runs on pages that take money. The one exception is `bumpPageCountOrThrow`, which is not touched by this plan.
- **Counting calls are fire-and-forget** (`void recordPageHit(...)`), never awaited, and must never put a query in front of a page.
- **No custom start/end dates and no period-over-period comparison.** Presets only.
- **`Bought` cannot follow the source filter** — orders carry no source. With a source selected it shows an em dash.
- The migration for this plan is **`0077_orders_host_offer.sql`**. 0074–0076 are taken.
- Run the full suite with `npx vitest run`; typecheck with `npx tsc --noEmit`; lint with `npx eslint .` (0 errors required, warnings pre-exist).

---

## File Structure

**Created**
- `supabase/migrations/0077_orders_host_offer.sql` — the column that makes an offer's "Bought" countable.
- `app/admin/traffic/[key]/page.tsx` — one funnel, full width, at its own URL.
- `components/admin/traffic-overview.tsx` — the table: sortable headers, filter row, one row per page.
- `lib/traffic-overview.ts` — pure shaping for the table (rows, sorting, filtering, biggest drop). No `server-only`, so the component test can import it.
- `lib/traffic-overview.test.ts`, `components/admin/traffic-overview.test.tsx`, `lib/traffic-range.test.ts`, `lib/traffic-owners.test.ts`.

**Modified**
- `lib/traffic-funnel.ts` — `Preset`/`rangeOf`/`daysInRange`, `FunnelOwner`, `buildFunnels`, `Funnel` rename.
- `lib/traffic.ts` — `DayRange` signatures, `windowStart` deleted, `paidByOffer`, `recordOtoPageHit` fallback, `offerKeys`.
- `lib/offer-checkout.ts` — write `host_offer_id` on the order insert.
- `app/(store)/checkout/offer/page.tsx` — record the hit.
- `app/admin/traffic/page.tsx` — rewritten around the table.
- `components/admin/traffic-funnel.tsx` — `RangeTabs` → `PresetTabs`; `OtherPages` deleted.
- `lib/traffic-funnel.test.ts`, `lib/traffic-wiring.test.ts`, `lib/traffic.integration.test.ts` — updated for the above.

---

## Task 1: The range becomes a day pair, with seven presets

Spec §4. Pure refactor plus five new presets; the page keeps its current layout and numbers.

**Files:**
- Modify: `lib/traffic-funnel.ts` (replace `RANGES`/`Range`/`rangeFrom`/`daysInRange` at the end of the file)
- Modify: `lib/traffic.ts` (delete `windowStart`; change `pageCountsSince`, `paidByProduct`, `consentedVisitorCount`)
- Modify: `components/admin/traffic-funnel.tsx` (`RangeTabs` → `PresetTabs`)
- Modify: `app/admin/traffic/page.tsx` (wire the new names)
- Test: `lib/traffic-range.test.ts` (create)

**Interfaces:**
- Produces:
  - `export type Preset = "today" | "yesterday" | "7" | "30" | "90" | "this-month" | "last-month"`
  - `export type DayRange = { start: string; end: string }` — inclusive, `"YYYY-MM-DD"`
  - `export const PRESETS: readonly { key: Preset; label: string }[]`
  - `export function presetFrom(params: Record<string, string | string[] | undefined>): Preset`
  - `export function rangeOf(preset: Preset, today: string): DayRange`
  - `export function daysInRange(range: DayRange): string[]`
  - `pageCountsSince(range: DayRange): Promise<CountRow[]>`
  - `paidByProduct(range: DayRange): Promise<BoughtRow[]>`
  - `consentedVisitorCount(range: DayRange): Promise<number>`

- [ ] **Step 1: Write the failing test**

Create `lib/traffic-range.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { presetFrom, rangeOf, daysInRange, PRESETS } from "@/lib/traffic-funnel";

// A Thursday, mid-month, so month boundaries are not accidentally today.
const TODAY = "2026-09-17";

describe("reading the preset off the URL", () => {
  it("defaults to 30 days when nothing is asked for", () => {
    expect(presetFrom({})).toBe("30");
  });

  it("takes a preset it knows", () => {
    for (const p of PRESETS) expect(presetFrom({ preset: p.key })).toBe(p.key);
  });

  it("falls back rather than reaching a query with an unknown value", () => {
    // It selects a window that becomes a date bound. An unbounded value here
    // would be a request for the whole table.
    expect(presetFrom({ preset: "all-time" })).toBe("30");
    expect(presetFrom({ preset: "999" })).toBe("30");
    expect(presetFrom({ preset: "" })).toBe("30");
    expect(presetFrom({ preset: "constructor" })).toBe("30");
    expect(presetFrom({ preset: ["7", "90"] })).toBe("7");
  });
});

describe("what each preset covers", () => {
  it("today is one day, both ends the same", () => {
    expect(rangeOf("today", TODAY)).toEqual({ start: "2026-09-17", end: "2026-09-17" });
  });

  it("yesterday is one day, and does not include today", () => {
    expect(rangeOf("yesterday", TODAY)).toEqual({ start: "2026-09-16", end: "2026-09-16" });
  });

  it("N days counts back INCLUDING today, so 7 days ends today and starts six back", () => {
    expect(rangeOf("7", TODAY)).toEqual({ start: "2026-09-11", end: "2026-09-17" });
    expect(rangeOf("30", TODAY)).toEqual({ start: "2026-08-19", end: "2026-09-17" });
    expect(rangeOf("90", TODAY)).toEqual({ start: "2026-06-20", end: "2026-09-17" });
  });

  it("this month runs from the 1st to today, not to the month's end", () => {
    expect(rangeOf("this-month", TODAY)).toEqual({ start: "2026-09-01", end: "2026-09-17" });
  });

  it("last month is the whole of it", () => {
    expect(rangeOf("last-month", TODAY)).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("crosses a year boundary", () => {
    expect(rangeOf("last-month", "2026-01-09")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(rangeOf("this-month", "2026-01-01")).toEqual({ start: "2026-01-01", end: "2026-01-01" });
  });

  it("gets February right in a leap year and out of one", () => {
    expect(rangeOf("last-month", "2028-03-05")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(rangeOf("last-month", "2026-03-05")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("is computed in UTC, not in whatever zone the server sits in", () => {
    // The store's counts are keyed on UTC days. A range built in local time
    // silently shifts every window by a day for half the world.
    expect(rangeOf("today", "2026-01-01")).toEqual({ start: "2026-01-01", end: "2026-01-01" });
  });
});

describe("the days a range contains", () => {
  it("includes both ends", () => {
    expect(daysInRange({ start: "2026-09-15", end: "2026-09-17" })).toEqual([
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ]);
  });

  it("is one day when the ends are the same", () => {
    expect(daysInRange({ start: "2026-09-17", end: "2026-09-17" })).toEqual(["2026-09-17"]);
  });

  it("has as many days as a preset claims", () => {
    expect(daysInRange(rangeOf("7", TODAY))).toHaveLength(7);
    expect(daysInRange(rangeOf("30", TODAY))).toHaveLength(30);
    expect(daysInRange(rangeOf("90", TODAY))).toHaveLength(90);
    expect(daysInRange(rangeOf("last-month", TODAY))).toHaveLength(31);
  });

  it("returns nothing for a backwards range rather than looping forever", () => {
    expect(daysInRange({ start: "2026-09-17", end: "2026-09-15" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/traffic-range.test.ts`
Expected: FAIL — `presetFrom`, `rangeOf`, `PRESETS` are not exported; `daysInRange` has a different signature.

- [ ] **Step 3: Replace the range model in `lib/traffic-funnel.ts`**

Delete the existing `daysInRange`, `RANGES`, `Range` and `rangeFrom` (currently the last ~45 lines of the file, from `/** Every ISO date in the window, oldest first, ending on `today`. */` to the end of `rangeFrom`). Keep `sparklinePath` where it is. Add in their place:

```ts
/**
 * A window, as two inclusive UTC calendar days.
 *
 * It used to be a day count. "Last month" is not a count of days back, and
 * neither is "this month", so the count could not express them — every reader
 * takes the pair now. Inclusive at both ends: `page_counts.day` is a date, and
 * a half-open range on dates reads as an off-by-one to everybody who maintains
 * it later.
 */
export type DayRange = { start: string; end: string };

const DAY_MS = 86_400_000;

/** UTC midnight of an ISO date, as epoch ms. */
function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** An epoch ms back to an ISO date. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
] as const;

export type Preset = (typeof PRESETS)[number]["key"];

const DEFAULT_PRESET: Preset = "30";

/**
 * The preset off the URL, refusing anything not on the list.
 *
 * A whitelist rather than a parse: the value becomes a date bound on a query,
 * and an unbounded one here would be a request for the whole table.
 */
export function presetFrom(params: Record<string, string | string[] | undefined>): Preset {
  const raw = params.preset;
  const one = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return PRESETS.some((p) => p.key === one) ? (one as Preset) : DEFAULT_PRESET;
}

/**
 * What a preset covers, on a given UTC day.
 *
 * `today` is a parameter rather than a clock read for the reason every reader
 * in lib/traffic.ts gives: one page render resolves a range once and hands the
 * same pair to four queries and a chart, and a request that crosses UTC
 * midnight between two clock reads gets a chart a day short of its own totals.
 */
export function rangeOf(preset: Preset, today: string): DayRange {
  const end = dayMs(today);
  const back = (n: number) => isoDay(end - n * DAY_MS);
  const firstOfMonth = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;

  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday":
      return { start: back(1), end: back(1) };
    case "7":
    case "30":
    case "90":
      // Counting back INCLUDES today, so "7 days" is six days back plus today.
      return { start: back(Number(preset) - 1), end: today };
    case "this-month":
      return { start: firstOfMonth(new Date(end)), end: today };
    case "last-month": {
      const firstThis = dayMs(firstOfMonth(new Date(end)));
      const lastPrev = firstThis - DAY_MS;
      return { start: firstOfMonth(new Date(lastPrev)), end: isoDay(lastPrev) };
    }
  }
}

/** Every ISO day in the window, oldest first, both ends included. */
export function daysInRange(range: DayRange): string[] {
  const start = dayMs(range.start);
  const end = dayMs(range.end);
  if (end < start) return [];
  const n = Math.round((end - start) / DAY_MS) + 1;
  return Array.from({ length: n }, (_, i) => isoDay(start + i * DAY_MS));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/traffic-range.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Change the three readers in `lib/traffic.ts`**

Delete `windowStart` entirely (it has no callers once these three change). Replace the import line's `daysInRange` usage if present. Change the three signatures — the bodies keep every existing comment:

```ts
export async function consentedVisitorCount(range: DayRange): Promise<number> {
  try {
    const since = `${range.start}T00:00:00.000Z`;
    const db = createServiceClient();
    const { count } = await db
      .from("visitors")
      .select("id", { count: "exact", head: true })
      .eq("store_id", await getStoreId())
      .gte("first_seen_at", since)
      .lt("first_seen_at", endExclusive(range));
    return count ?? 0;
  } catch {
    return 0;
  }
}
```

```ts
export async function pageCountsSince(range: DayRange): Promise<CountRow[]> {
  try {
    const db = createServiceClient();
    const store = await getStoreId();
    return await allRows<CountRow>((from, to) =>
      db
        .from("page_counts")
        .select("day, path, source, product, hits")
        .eq("store_id", store)
        .gte("day", range.start)
        .lte("day", range.end)
        // `day` alone is not a total order, and an offset-paged read over a
        // partial order can repeat one row and skip another. The rest of the
        // primary key makes it total.
        .order("day", { ascending: true })
        .order("path", { ascending: true })
        .order("source", { ascending: true })
        .order("product", { ascending: true })
        .range(from, to),
    );
  } catch {
    return [];
  }
}
```

In `paidByProduct`, change the signature to `(range: DayRange)` and replace the `since` line and the `.gte` with:

```ts
    // UTC midnight of the window's first day, and the midnight AFTER its last,
    // not a rolling `days * 24h`: `page_counts.day` is written from
    // `toISOString()`, so the three view steps are bounded by UTC midnights and
    // this step has to be too. A rolling cutoff would leave the last step
    // counting a different span from the three above it, by however many hours
    // into the day it is now.
    const since = `${range.start}T00:00:00.000Z`;
```

and on the query builder:

```ts
        .gte("created_at", since)
        .lt("created_at", endExclusive(range))
```

Add this helper to `lib/traffic.ts`, just below the imports:

```ts
/**
 * UTC midnight AFTER a window's last day.
 *
 * `page_counts.day` is a date and its window is inclusive; `orders.created_at`
 * is a timestamp, so the same window is `>= start` and `< the day after end`.
 * Written once because getting it wrong drops or adds a whole day of orders
 * against view counts that did not move, and nothing on screen would say so.
 */
function endExclusive(range: DayRange): string {
  return `${new Date(Date.parse(`${range.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;
}
```

Import `DayRange` at the top of `lib/traffic.ts`:

```ts
import type { DayRange } from "@/lib/traffic-funnel";
```

- [ ] **Step 6: Rename `RangeTabs` to `PresetTabs` in `components/admin/traffic-funnel.tsx`**

Replace the whole `RangeTabs` function and its `Range`/`RANGES` import with:

```ts
export function PresetTabs({ preset }: { preset: Preset }) {
  return (
    <nav aria-label="Date range" className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Link
          key={p.key}
          href={p.key === "30" ? "/admin/traffic" : `/admin/traffic?preset=${p.key}`}
          aria-current={p.key === preset ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            p.key === preset
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-muted hover:border-fg hover:text-fg"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
```

Update that file's import from `@/lib/traffic-funnel` to bring in `PRESETS` and `type Preset` instead of `Range`.

- [ ] **Step 7: Wire `app/admin/traffic/page.tsx`**

Replace the top of the component:

```ts
  const preset = presetFrom(await searchParams);
  // One clock read for the whole request. Reading it again after the awaits
  // lets a request that crosses UTC midnight build a chart one day short of
  // the totals beside it — the disagreement b481969 closed.
  const today = todayUtc();
  const range = rangeOf(preset, today);
  const [counts, bought, names, consented] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    consentedVisitorCount(range),
  ]);
  const days = daysInRange(range);
  const view = buildFunnels(counts, bought, names, days);
```

and change `<RangeTabs range={range} />` to `<PresetTabs preset={preset} />`. Update the imports accordingly.

- [ ] **Step 8: Run typecheck and the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc silent; all tests pass. If `lib/traffic-funnel.test.ts` or `lib/traffic.integration.test.ts` reference `rangeFrom`, `Range` or the old `daysInRange(days, today)`, update those call sites to the new shapes — the assertions themselves stay.

- [ ] **Step 9: Commit**

```bash
git add lib/traffic-funnel.ts lib/traffic.ts lib/traffic-range.test.ts lib/traffic-funnel.test.ts lib/traffic.integration.test.ts components/admin/traffic-funnel.tsx app/admin/traffic/page.tsx
git commit -m "Take a window as two days, so a month is expressible

A day count cannot say \"last month\", and the traffic page needs to.
Every reader takes an inclusive UTC day pair now and windowStart is gone.
Seven presets replace three.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `orders.host_offer_id`, so an offer's sales can be counted

Spec §1c. Migration, the write, and the reader.

**Files:**
- Create: `supabase/migrations/0077_orders_host_offer.sql`
- Modify: `lib/offer-checkout.ts` (the `orders` insert — search for `stripe_payment_intent_id: pi.id` inside `startOfferCheckout`)
- Modify: `lib/traffic.ts` (add `paidByOffer`)
- Test: `lib/traffic.integration.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `DayRange`, `endExclusive`, `allRows`, `chunks` from Task 1 / existing `lib/traffic.ts`.
- Produces: `export async function paidByOffer(range: DayRange): Promise<BoughtRow[]>` — `BoughtRow.product` holds the **offer key**.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0077_orders_host_offer.sql`:

```sql
-- Which offer an order was FOR.
--
-- An offer sold on its own page and an offer taken as an upsell are written
-- with the same order_items kind ('oto'), so "how many people bought this
-- offer from its own checkout" could not be asked. The traffic page's fourth
-- funnel step needs exactly that question answered.
--
-- A column rather than a new order_items kind: retyping that line would mean
-- auditing every reader of `kind` — receipts, revenue, the ledger, the CRM
-- sync — and a missed one changes what a buyer is shown or what a number
-- means. This is additive and nothing existing reads it.
--
-- ON DELETE SET NULL matches order_items.offer_id: a deleted offer must not
-- take paid orders with it.
alter table orders add column if not exists host_offer_id uuid
  references offers(id) on delete set null;

comment on column orders.host_offer_id is
  'The offer this order was opened for, when it came from an offer checkout. Null for a product order. Written forward only — orders before this column are null.';

create index if not exists orders_host_offer_id_idx
  on orders (host_offer_id) where host_offer_id is not null;
```

- [ ] **Step 2: Apply it locally and confirm the column**

```bash
supabase migration up
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAc \
  "select column_name, is_nullable from information_schema.columns where table_name='orders' and column_name='host_offer_id';"
```

Expected: `host_offer_id|YES`.

- [ ] **Step 3: Write the failing test**

`lib/traffic.integration.test.ts` has no fixture helpers — it only clears
`page_counts` in a `beforeEach`. So this block builds and removes its own rows.
Append it to the file, at top level (a second `describe`, not inside the
existing one), reusing that file's `canRun` constant:

```ts
describe.skipIf(!canRun)("what an offer sold (integration)", () => {
  const KEY = `zz-paidbyoffer-${Date.now()}`;
  const made: { orders: string[]; offerId: string; userId: string } = {
    orders: [],
    offerId: "",
    userId: "",
  };

  beforeAll(async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    const { data: offer, error: offerErr } = await db
      .from("offers")
      .insert({
        store_id: storeId,
        key: KEY,
        name: "Paid-by-offer fixture",
        grant_type: "product",
        billing_type: "one_time",
        price_cents: 1000,
        headline: "Fixture",
      })
      .select("id")
      .single();
    if (offerErr) throw new Error(`offer fixture: ${offerErr.message}`);
    made.offerId = offer!.id as string;

    made.userId = randomUUID();
    const { error: userErr } = await db
      .from("users")
      .insert({ id: made.userId, store_id: storeId, email: `${KEY}@example.com`, username: KEY });
    if (userErr) throw new Error(`user fixture: ${userErr.message}`);

    const order = async (created: string, livemode: boolean, host: string | null) => {
      const { data, error } = await db
        .from("orders")
        .insert({
          store_id: storeId,
          user_id: made.userId,
          email: `${KEY}@example.com`,
          status: "paid",
          currency: "usd",
          subtotal_cents: 1000,
          total_cents: 1000,
          livemode,
          host_offer_id: host,
          created_at: created,
        })
        .select("id")
        .single();
      if (error) throw new Error(`order fixture: ${error.message}`);
      made.orders.push(data!.id as string);
    };

    // The window under test is 2026-05-10 .. 2026-05-12, inclusive.
    await order("2026-05-10T00:00:00.000Z", true, made.offerId); // first midnight — counts
    await order("2026-05-12T23:59:59.000Z", true, made.offerId); // last day, late — counts
    await order("2026-05-09T23:59:59.000Z", true, made.offerId); // a second early — out
    await order("2026-05-13T00:00:00.000Z", true, made.offerId); // next midnight — out
    await order("2026-05-11T00:00:00.000Z", false, made.offerId); // test mode — out
    await order("2026-05-11T00:00:00.000Z", true, null); // a product order — out
  });

  afterAll(async () => {
    const db = createServiceClient();
    // Orders reference the user and the offer, so they go first or the FKs
    // block the rest and every row is left behind for the next run.
    for (const id of made.orders) await db.from("orders").delete().eq("id", id);
    if (made.userId) await db.from("users").delete().eq("id", made.userId);
    if (made.offerId) await db.from("offers").delete().eq("id", made.offerId);
  });

  it("counts an offer's own sales, once per order, live mode only", async () => {
    // The fourth step of an offer's funnel. An offer sold on its own page and
    // one taken as an upsell write the same order_items kind, so this counts
    // the order's host_offer_id instead.
    const rows = await paidByOffer({ start: "2026-05-10", end: "2026-05-12" });
    expect(rows.find((r) => r.product === KEY)?.orders).toBe(2);
  });

  it("counts nothing for a window the orders miss entirely", async () => {
    const rows = await paidByOffer({ start: "2026-06-01", end: "2026-06-30" });
    expect(rows.find((r) => r.product === KEY)).toBeUndefined();
  });
});
```

Extend that file's imports to cover what this block uses:

```ts
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { bumpPageCountOrThrow, pageCountsSince, paidByProduct, paidByOffer, productNames } from "@/lib/traffic";
```

The `zz-` key prefix and the timestamp matter: suites run in parallel against
one local store, and a fixture with a fixed key collides with a re-run of
itself. See `lib/library.ts`'s ordering fix for what an unordered pick over a
shared store does.

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run lib/traffic.integration.test.ts`
Expected: FAIL — `paidByOffer` is not exported. (If the suite skips, ensure `.env.local` provides `SUPABASE_SERVICE_ROLE_KEY`; a skipped suite proves nothing.)

- [ ] **Step 5: Write `paidByOffer` in `lib/traffic.ts`**

Add below `paidByProduct`:

```ts
/**
 * How many orders each OFFER sold, keyed by the offer's key.
 *
 * The fourth step of an offer's funnel. `paidByProduct` counts base-product
 * order lines, and an offer has none — the line it writes carries the same
 * kind ('oto') an accepted upsell does, so the two are indistinguishable
 * there. `orders.host_offer_id` says which offer the order was opened for,
 * which is exactly the question the funnel asks.
 *
 * Same window arithmetic, `livemode` filter and paging as paidByProduct, for
 * the reasons its comments give.
 */
export async function paidByOffer(range: DayRange): Promise<BoughtRow[]> {
  try {
    const db = createServiceClient();
    const store = await getStoreId();
    const since = `${range.start}T00:00:00.000Z`;

    const orders = await allRows<{ id: string; host_offer_id: string }>((from, to) =>
      db
        .from("orders")
        .select("id, host_offer_id")
        .eq("store_id", store)
        .eq("status", "paid")
        .eq("livemode", true)
        .not("host_offer_id", "is", null)
        .gte("created_at", since)
        .lt("created_at", endExclusive(range))
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (orders.length === 0) return [];

    const { data: offers } = await db
      .from("offers")
      .select("id, key")
      .eq("store_id", store);
    const keyOf = new Map((offers ?? []).map((o) => [o.id as string, o.key as string]));

    // Distinct ORDERS per offer. One order has one host offer, so this is a
    // count rather than a dedup — but it is written as a set for the same
    // reason paidByProduct is: a paged read can hand back a row twice.
    const seen = new Map<string, Set<string>>();
    for (const o of orders) {
      const key = keyOf.get(o.host_offer_id);
      if (!key) continue;
      const set = seen.get(key) ?? new Set<string>();
      set.add(o.id);
      seen.set(key, set);
    }
    return [...seen.entries()].map(([product, ids]) => ({ product, orders: ids.size }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 6: Write `host_offer_id` on the order**

In `lib/offer-checkout.ts`, find the `orders` insert inside `startOfferCheckout` (the object containing `stripe_payment_intent_id: pi.id` and `visitor_id: visitorId`). Add one field:

```ts
      // Which offer this order was FOR. An offer's order line carries the same
      // kind as an accepted upsell, so without this there is no way to ask how
      // many people bought this offer from its own checkout — which is the
      // fourth step of its funnel on /admin/traffic.
      host_offer_id: offer.id,
```

Use whatever the offer variable is named at that point in the function (`offer` or `sold`); it must be the HOST offer, never the bump.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run lib/traffic.integration.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0077_orders_host_offer.sql lib/traffic.ts lib/offer-checkout.ts lib/traffic.integration.test.ts
git commit -m "Record which offer an order was for, and count it

An offer sold on its own page and one taken as an upsell write the same
order_items kind, so \"how many bought this offer\" could not be asked.
orders.host_offer_id answers it; paidByOffer reads it for the funnel's
fourth step. Written forward only — earlier orders stay null.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Count the offer checkout, and file an offer's upsell view

Spec §1a and §1b. Two counting sites; both fire-and-forget.

**Files:**
- Modify: `app/(store)/checkout/offer/page.tsx`
- Modify: `lib/traffic.ts` (`orderProductSlug` → also try the host offer)
- Test: `lib/traffic-wiring.test.ts`

**Interfaces:**
- Consumes: `recordPageHit(path, product)` (existing), `orders.host_offer_id` from Task 2.
- Produces: nothing new; changes what two existing calls record.

- [ ] **Step 1: Write the failing test**

Append to `lib/traffic-wiring.test.ts`:

```ts
describe("an offer's funnel is counted at every step", () => {
  it("counts the offer's own checkout, under the offer's key", () => {
    // Without this the second step of every offer funnel is permanently zero.
    const src = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
    expect(src).toContain('void recordPageHit("/checkout/offer", offer.key)');
  });

  it("counts it AFTER the guards, so a bounced visitor is not a checkout", () => {
    const src = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
    const hit = src.indexOf('recordPageHit("/checkout/offer"');
    const bounce = src.indexOf("offer=already_owned");
    expect(bounce).toBeGreaterThan(-1);
    expect(hit).toBeGreaterThan(bounce);
  });

  it("files an offer-originated upsell view under the host offer", () => {
    // recordOtoPageHit resolves the order's BASE PRODUCT. An offer order has
    // none, so the hit was written with an empty product and belonged to no
    // funnel at all — 24 such rows in production on 9 Sep 2026.
    const src = readFileSync("lib/traffic.ts", "utf8");
    expect(src).toContain("host_offer_id");
    expect(src).toMatch(/orderFunnelKey|hostOfferKey/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/traffic-wiring.test.ts`
Expected: FAIL on all three.

- [ ] **Step 3: Record the offer checkout hit**

In `app/(store)/checkout/offer/page.tsx`, after the eligibility redirect (`redirect("/library?offer=already_owned")`) and before the page's data fetching, add:

```ts
  // Not awaited — a count is worth less than a page load. After the guards:
  // somebody bounced to their library never reached a checkout, and counting
  // them would put a step above the sales page it came from.
  void recordPageHit("/checkout/offer", offer.key);
```

Add the import: `import { recordPageHit } from "@/lib/traffic";`

- [ ] **Step 4: Fall back to the host offer in `lib/traffic.ts`**

Rename `orderProductSlug` to `orderFunnelKey` and give it the fallback:

```ts
/**
 * The funnel key an order belongs to: its base product, or its host offer.
 *
 * `kind = 'product'` is the base row — a bump or an accepted upsell is an
 * offer, not what was bought first. An order that came from an OFFER's
 * checkout has no such row at all, so this used to return "" and the upsell
 * view it names was filed under no funnel; 24 such rows were sitting in
 * production on 9 Sep 2026. `orders.host_offer_id` names that offer.
 *
 * Two queries rather than a PostgREST embed: the embed's shape depends on how
 * the relationship is detected, and this runs behind a fire-and-forget count
 * where a silently-wrong shape would never surface.
 */
async function orderFunnelKey(orderId: string): Promise<string> {
  const db = createServiceClient();
  const { data: items } = await db
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId)
    .eq("kind", "product")
    .not("product_id", "is", null)
    .limit(1);
  const productId = items?.[0]?.product_id as string | undefined;
  if (productId) {
    const { data: product } = await db
      .from("products")
      .select("slug")
      .eq("id", productId)
      .maybeSingle();
    if (product?.slug) return product.slug as string;
  }

  const { data: order } = await db
    .from("orders")
    .select("host_offer_id")
    .eq("id", orderId)
    .maybeSingle();
  const offerId = order?.host_offer_id as string | null | undefined;
  if (!offerId) return "";
  const { data: offer } = await db
    .from("offers")
    .select("key")
    .eq("id", offerId)
    .maybeSingle();
  return (offer?.key as string) ?? "";
}
```

Update the one caller inside `recordOtoPageHit` to `await orderFunnelKey(orderId)`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/traffic-wiring.test.ts && npx tsc --noEmit`
Expected: PASS; tsc silent.

- [ ] **Step 6: Commit**

```bash
git add "app/(store)/checkout/offer/page.tsx" lib/traffic.ts lib/traffic-wiring.test.ts
git commit -m "Count the two offer-funnel steps that counted nothing

The offer checkout recorded no hit at all, so every offer funnel's second
step was permanently zero. And an offer-originated upsell view was filed
under the order's base product, which an offer order does not have — it
landed under no funnel, 24 rows of it in production.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `buildFunnels` learns owners, so an offer has a funnel

Spec §1d. Plus `biggestDrop`, which the table sorts on.

**Files:**
- Modify: `lib/traffic-funnel.ts`
- Modify: `lib/traffic.ts` (add `offerKeys`)
- Modify: `app/admin/traffic/page.tsx` (feed owners; rename `view.products`)
- Modify: `components/admin/traffic-funnel.tsx` (`ProductFunnel` → `Funnel`)
- Test: `lib/traffic-owners.test.ts` (create)

**Interfaces:**
- Consumes: `paidByOffer` (Task 2), `DayRange`/`daysInRange` (Task 1).
- Produces:
  - `export type FunnelOwner = { key: string; title: string; kind: "product" | "offer" }`
  - `export type Funnel = { key: string; title: string; kind: "product" | "offer"; steps: FunnelStep[]; sources: SourceSplit[]; daily: DayPoint[]; salesViews: number }`
  - `export type FunnelView = { funnels: Funnel[]; others: OtherPage[]; counted: number }`
  - `export function buildFunnels(counts: CountRow[], bought: BoughtRow[], owners: FunnelOwner[], days: string[]): FunnelView`
  - `export function biggestDrop(steps: FunnelStep[]): { from: number; percent: number } | null`
  - `export async function offerKeys(): Promise<{ key: string; name: string }[]>` (in `lib/traffic.ts`)

Note `Funnel.slug` becomes `Funnel.key` — an offer has a key, not a slug, and one field cannot be both.

- [ ] **Step 1: Write the failing test**

Create `lib/traffic-owners.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFunnels, biggestDrop, type CountRow, type FunnelOwner } from "@/lib/traffic-funnel";

const DAYS = ["2026-09-08", "2026-09-09"];
const OWNERS: FunnelOwner[] = [
  { key: "digital-product-validator", title: "Digital Product Validator", kind: "product" },
  { key: "book-writer", title: "Book Writer", kind: "offer" },
];
const hit = (over: Partial<CountRow>): CountRow => ({
  day: "2026-09-09",
  path: "/",
  source: "direct",
  product: "",
  hits: 1,
  ...over,
});

describe("an offer is a funnel like a product is", () => {
  it("builds all four steps for an offer", () => {
    const view = buildFunnels(
      [
        hit({ path: "/o/book-writer", product: "book-writer", hits: 100 }),
        hit({ path: "/checkout/offer", product: "book-writer", hits: 40 }),
        hit({ path: "/checkout/oto", product: "book-writer", hits: 10 }),
      ],
      [{ product: "book-writer", orders: 6 }],
      OWNERS,
      DAYS,
    );
    const bw = view.funnels.find((f) => f.key === "book-writer");
    expect(bw?.kind).toBe("offer");
    expect(bw?.steps.map((s) => s.count)).toEqual([100, 40, 10, 6]);
  });

  it("keeps a product's steps on its own paths", () => {
    const view = buildFunnels(
      [
        hit({ path: "/p/digital-product-validator", hits: 50 }),
        hit({ path: "/checkout", product: "digital-product-validator", hits: 20 }),
        hit({ path: "/checkout/oto", product: "digital-product-validator", hits: 5 }),
      ],
      [{ product: "digital-product-validator", orders: 3 }],
      OWNERS,
      DAYS,
    );
    const p = view.funnels.find((f) => f.key === "digital-product-validator");
    expect(p?.kind).toBe("product");
    expect(p?.steps.map((s) => s.count)).toEqual([50, 20, 5, 3]);
  });

  it("does not let an offer's checkout land on a product's funnel", () => {
    // /checkout and /checkout/offer are different steps of different funnels
    // and both carry a key in the same column.
    const view = buildFunnels(
      [hit({ path: "/checkout/offer", product: "digital-product-validator", hits: 9 })],
      [],
      OWNERS,
      DAYS,
    );
    const p = view.funnels.find((f) => f.key === "digital-product-validator");
    expect(p?.steps[1].count ?? 0).toBe(0);
  });

  it("leaves a key nothing owns in the other-pages list", () => {
    // A deleted offer's key — content-engine-monthly, 7 hits in production —
    // must not invent a funnel with three empty steps.
    const view = buildFunnels(
      [hit({ path: "/o/content-engine-monthly", product: "content-engine-monthly", hits: 7 })],
      [],
      OWNERS,
      DAYS,
    );
    expect(view.funnels.map((f) => f.key)).not.toContain("content-engine-monthly");
    expect(view.others.map((o) => o.path)).toContain("/o/content-engine-monthly");
  });

  it("counts every view towards the total, funnel or not", () => {
    const view = buildFunnels(
      [hit({ path: "/o/book-writer", product: "book-writer", hits: 3 }), hit({ path: "/", hits: 4 })],
      [],
      OWNERS,
      DAYS,
    );
    expect(view.counted).toBe(7);
  });
});

describe("the biggest drop, which the table sorts on", () => {
  const steps = (...counts: number[]) =>
    counts.map((count, i) => ({ label: ["a", "b", "c", "d"][i], count }));

  it("names the step the fall happened AT and its size", () => {
    expect(biggestDrop(steps(100, 21, 20, 19))).toEqual({ from: 0, percent: 79 });
  });

  it("picks the largest fall, not the first", () => {
    expect(biggestDrop(steps(100, 90, 9, 9))).toEqual({ from: 1, percent: 90 });
  });

  it("ignores a step that follows a zero, which is not a drop", () => {
    // 0 -> 0 is not a 100% fall; there was nobody to lose.
    expect(biggestDrop(steps(10, 0, 0, 0))).toEqual({ from: 0, percent: 100 });
  });

  it("is nothing at all when the funnel had no traffic", () => {
    // A page with no traffic is not the page that is leaking, and must sort
    // last rather than first.
    expect(biggestDrop(steps(0, 0, 0, 0))).toBeNull();
  });

  it("is nothing when no step falls", () => {
    expect(biggestDrop(steps(5, 5, 5, 5))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/traffic-owners.test.ts`
Expected: FAIL — `biggestDrop` and `FunnelOwner` are not exported; `view.funnels` is undefined.

- [ ] **Step 3: Rewrite the types and `buildFunnels` in `lib/traffic-funnel.ts`**

Replace `ProductFunnel` and `FunnelView`:

```ts
/** What a recorded key belongs to. Products and offers both own funnels. */
export type FunnelOwner = { key: string; title: string; kind: "product" | "offer" };

export type Funnel = {
  key: string;
  title: string;
  kind: "product" | "offer";
  steps: FunnelStep[];
  sources: SourceSplit[];
  daily: DayPoint[];
  /** Sales-page views, the default order. */
  salesViews: number;
};

export type FunnelView = {
  funnels: Funnel[];
  others: OtherPage[];
  /** Every counted view in the window, funnel or not. */
  counted: number;
};
```

Replace `buildFunnels`'s signature and its owner-resolution block. The two changed regions:

```ts
export function buildFunnels(
  counts: CountRow[],
  bought: BoughtRow[],
  owners: FunnelOwner[],
  days: string[],
): FunnelView {
  const ownerOf = new Map(owners.map((o) => [o.key, o]));
  const boughtOf = new Map(bought.map((b) => [b.product, b.orders]));
```

and the loop body, replacing everything from `const salesSlug =` to the end of the `if (known && r.path === "/checkout/oto")` block:

```ts
    // A sales page names its owner in the path; the other steps carry it in
    // the column. /p/<slug> is a product's page and /o/<key> an offer's.
    const fromPath =
      r.path.startsWith("/p/") ? r.path.slice(3) : r.path.startsWith("/o/") ? r.path.slice(3) : null;
    const key = fromPath ?? r.product;
    const owner = ownerOf.get(key);

    if (owner && fromPath) {
      add(sales, key, r.hits);
      add(per(sources, key, () => new Map()), r.source, r.hits);
      add(per(daily, key, () => new Map()), r.day, r.hits);
      continue;
    }
    // Each kind reaches its checkout by its own path, and both carry a key in
    // the same column — so the path has to agree with the owner's kind, or an
    // offer's checkout lands on a product's funnel.
    const checkoutPath = owner?.kind === "offer" ? "/checkout/offer" : "/checkout";
    if (owner && r.path === checkoutPath) {
      add(checkout, key, r.hits);
      continue;
    }
    if (owner && r.path === "/checkout/oto") {
      add(upsell, key, r.hits);
      continue;
    }
```

Then the assembly, replacing `const slugs = ...` through the `return`:

```ts
  const keys = new Set<string>([
    ...sales.keys(),
    ...checkout.keys(),
    ...upsell.keys(),
    ...[...boughtOf.keys()].filter((k) => ownerOf.has(k)),
  ]);

  const funnels: Funnel[] = [...keys]
    .map((key) => {
      const byDay = daily.get(key) ?? new Map<string, number>();
      const owner = ownerOf.get(key)!;
      return {
        key,
        title: owner.title,
        kind: owner.kind,
        steps: [
          sales.get(key) ?? 0,
          checkout.get(key) ?? 0,
          upsell.get(key) ?? 0,
          boughtOf.get(key) ?? 0,
        ].map((count, i) => ({ label: STEP_LABELS[i], count })),
        sources: splitOf(sources.get(key) ?? new Map()),
        // Dense: a line that skips the quiet days draws a plateau where there
        // was a gap.
        daily: days.map((day) => ({ day, hits: byDay.get(day) ?? 0 })),
        salesViews: sales.get(key) ?? 0,
      };
    })
    .sort((a, b) => b.salesViews - a.salesViews || a.key.localeCompare(b.key));

  return {
    funnels,
    others: [...others.entries()]
      .map(([path, o]) => ({ path, hits: o.hits, sources: splitOf(o.sources) }))
      .sort((a, b) => b.hits - a.hits),
    counted,
  };
}

/**
 * The largest fall between two consecutive steps.
 *
 * `from` is the index of the step the fall happened AT, so the table can say
 * "79% at checkout". Null when nothing fell, and null when the funnel had no
 * traffic at all — a page nobody visited is not the page that is leaking, and
 * sorting it to the top would bury the ones that are.
 */
export function biggestDrop(steps: FunnelStep[]): { from: number; percent: number } | null {
  let best: { from: number; percent: number } | null = null;
  for (let i = 0; i < steps.length - 1; i += 1) {
    const before = steps[i].count;
    const after = steps[i + 1].count;
    if (before <= 0 || after >= before) continue;
    const percent = Math.round(((before - after) / before) * 100);
    if (!best || percent > best.percent) best = { from: i, percent };
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/traffic-owners.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Add `offerKeys` to `lib/traffic.ts`**

```ts
/** Every offer's key and name, so an offer key can own a funnel. */
export async function offerKeys(): Promise<{ key: string; name: string }[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("offers")
      .select("key, name")
      .eq("store_id", await getStoreId());
    return (data ?? []).map((o) => ({ key: o.key as string, name: o.name as string }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 6: Feed owners from the page**

In `app/admin/traffic/page.tsx`, extend the parallel fetch and build the owner list:

```ts
  const [counts, bought, names, offers, boughtOffers, consented] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    offerKeys(),
    paidByOffer(range),
    consentedVisitorCount(range),
  ]);
  // Products first: if a product slug and an offer key ever collided, the
  // product wins, which is the behaviour that existed before offers had
  // funnels at all.
  const owners: FunnelOwner[] = [
    ...names.map((n) => ({ key: n.slug, title: n.title, kind: "product" as const })),
    ...offers.map((o) => ({ key: o.key, title: o.name, kind: "offer" as const })),
  ];
  const days = daysInRange(range);
  const view = buildFunnels(counts, [...bought, ...boughtOffers], owners, days);
```

Then replace `view.products` with `view.funnels` in the render, and in `components/admin/traffic-funnel.tsx` change `FunnelCard`'s prop type from `ProductFunnel` to `Funnel` and its `product.slug` references to `.key`. Rename the prop from `product` to `funnel` for honesty.

- [ ] **Step 7: Run typecheck and the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc silent; all pass. `lib/traffic-funnel.test.ts` and `lib/analytics/funnel.test.ts` will need `view.products` → `view.funnels` and `ProductFunnel` → `Funnel`; update those references only, never the assertions.

- [ ] **Step 8: Commit**

```bash
git add lib/traffic-funnel.ts lib/traffic.ts app/admin/traffic/page.tsx components/admin/traffic-funnel.tsx lib/traffic-owners.test.ts lib/traffic-funnel.test.ts lib/analytics/funnel.test.ts
git commit -m "Give an offer a funnel, the same way a product has one

buildFunnels built a card only when the recorded key named a product, so
every offer fell into Other pages with a total and nothing else — including
/o/book-writer, the busiest page in the store. It takes owners now, tagged
product or offer, and a key nothing owns still falls through.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The overview table

Spec §2. Shaping is pure and lives apart from the component so both are testable.

**Files:**
- Create: `lib/traffic-overview.ts`
- Create: `lib/traffic-overview.test.ts`
- Create: `components/admin/traffic-overview.tsx`
- Create: `components/admin/traffic-overview.test.tsx`
- Modify: `app/admin/traffic/page.tsx`
- Modify: `components/admin/traffic-funnel.tsx` (delete `OtherPages`)

**Interfaces:**
- Consumes: `FunnelView`, `Funnel`, `OtherPage`, `biggestDrop`, `formatCount`, `Sparkline`.
- Produces:
  - `export type OverviewRow = { key: string | null; title: string; path: string; kind: "product" | "offer" | "other"; steps: number[]; drop: { from: number; percent: number } | null; daily: DayPoint[]; topSource: { source: string; hits: number } | null }`
  - `export type Sort = "page" | "views" | "checkout" | "upsell" | "bought" | "drop" | "source"`
  - `export type Dir = "asc" | "desc"`
  - `export type OverviewFilter = { kind: "all" | "product" | "offer" | "other"; source: string; q: string; sort: Sort; dir: Dir }`
  - `export function overviewFilterFrom(params): OverviewFilter`
  - `export function overviewRows(view: FunnelView): OverviewRow[]`
  - `export function applyOverview(rows: OverviewRow[], filter: OverviewFilter): OverviewRow[]`
  - `export function sourcesIn(rows: OverviewRow[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `lib/traffic-overview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  overviewFilterFrom,
  overviewRows,
  applyOverview,
  sourcesIn,
  type OverviewRow,
} from "@/lib/traffic-overview";
import type { FunnelView } from "@/lib/traffic-funnel";

const step = (label: string, count: number) => ({ label, count });
const VIEW: FunnelView = {
  funnels: [
    {
      key: "book-writer",
      title: "Book Writer",
      kind: "offer",
      steps: [step("Saw the sales page", 100), step("Reached the checkout", 20), step("Saw the upsell", 5), step("Bought", 4)],
      sources: [{ source: "meta", hits: 60 }, { source: "direct", hits: 40 }],
      daily: [{ day: "2026-09-09", hits: 100 }],
      salesViews: 100,
    },
    {
      key: "digital-product-validator",
      title: "Digital Product Validator",
      kind: "product",
      steps: [step("Saw the sales page", 40), step("Reached the checkout", 30), step("Saw the upsell", 20), step("Bought", 10)],
      sources: [{ source: "direct", hits: 40 }],
      daily: [{ day: "2026-09-09", hits: 40 }],
      salesViews: 40,
    },
  ],
  others: [{ path: "/", hits: 70, sources: [{ source: "direct", hits: 70 }] }],
  counted: 210,
};

const base = overviewFilterFrom({});

describe("every page is in one list", () => {
  it("puts funnels and other pages in the same rows", () => {
    const rows = overviewRows(VIEW);
    expect(rows.map((r) => r.title)).toEqual(["Book Writer", "Digital Product Validator", "/"]);
    expect(rows.map((r) => r.kind)).toEqual(["offer", "product", "other"]);
  });

  it("gives a funnel-less page views and no steps", () => {
    const home = overviewRows(VIEW).find((r) => r.path === "/")!;
    expect(home.steps).toEqual([70]);
    expect(home.key, "nothing to drill into").toBeNull();
    expect(home.drop).toBeNull();
  });

  it("links a funnel by its key", () => {
    expect(overviewRows(VIEW)[0]).toMatchObject({ key: "book-writer", path: "/o/book-writer" });
    expect(overviewRows(VIEW)[1].path).toBe("/p/digital-product-validator");
  });

  it("names the busiest source", () => {
    expect(overviewRows(VIEW)[0].topSource).toEqual({ source: "meta", hits: 60 });
  });
});

describe("sorting", () => {
  const rows = overviewRows(VIEW);

  it("defaults to views, busiest first — the order the page had", () => {
    expect(applyOverview(rows, base).map((r) => r.title)).toEqual([
      "Book Writer",
      "Digital Product Validator",
      "/",
    ]);
  });

  it("puts the worst leak first, which is what the screen is for", () => {
    const sorted = applyOverview(rows, { ...base, sort: "drop", dir: "desc" });
    // Book Writer loses 80% at the checkout; the Validator's worst is 33%.
    expect(sorted[0].title).toBe("Book Writer");
  });

  it("sorts a page with no drop last, whichever direction", () => {
    // A page with no traffic is not the page that is leaking.
    for (const dir of ["asc", "desc"] as const) {
      const sorted = applyOverview(rows, { ...base, sort: "drop", dir });
      expect(sorted.at(-1)!.title).toBe("/");
    }
  });

  it("sorts by each numeric column", () => {
    expect(applyOverview(rows, { ...base, sort: "bought", dir: "desc" })[0].title).toBe(
      "Digital Product Validator",
    );
    expect(applyOverview(rows, { ...base, sort: "checkout", dir: "desc" })[0].title).toBe(
      "Digital Product Validator",
    );
  });

  it("sorts by name", () => {
    expect(applyOverview(rows, { ...base, sort: "page", dir: "asc" })[0].title).toBe("/");
  });
});

describe("filters", () => {
  const rows = overviewRows(VIEW);

  it("narrows to a kind", () => {
    expect(applyOverview(rows, { ...base, kind: "offer" }).map((r) => r.key)).toEqual(["book-writer"]);
    expect(applyOverview(rows, { ...base, kind: "other" })).toHaveLength(1);
  });

  it("matches a search on title or path, case-insensitively", () => {
    expect(applyOverview(rows, { ...base, q: "BOOK" })).toHaveLength(1);
    expect(applyOverview(rows, { ...base, q: "/p/" })).toHaveLength(1);
    expect(applyOverview(rows, { ...base, q: "nothing here" })).toHaveLength(0);
  });

  it("lists the sources present, busiest first, for the select", () => {
    expect(sourcesIn(rows)).toEqual(["direct", "meta"]);
  });
});

describe("reading the filter off the URL", () => {
  it("defaults to everything, by views, descending", () => {
    expect(overviewFilterFrom({})).toEqual({
      kind: "all",
      source: "",
      q: "",
      sort: "views",
      dir: "desc",
    });
  });

  it("takes what it knows", () => {
    expect(overviewFilterFrom({ sort: "drop", dir: "asc", kind: "offer", q: " book ", source: "meta" })).toEqual({
      kind: "offer",
      source: "meta",
      q: "book",
      sort: "drop",
      dir: "asc",
    });
  });

  it("falls back on a sort or direction it does not know", () => {
    // It selects a comparator. An unrecognised one must pick one rather than
    // render nothing.
    expect(overviewFilterFrom({ sort: "revenue" }).sort).toBe("views");
    expect(overviewFilterFrom({ dir: "sideways" }).dir).toBe("desc");
    expect(overviewFilterFrom({ kind: "app" }).kind).toBe("all");
    expect(overviewFilterFrom({ sort: ["drop", "views"] }).sort).toBe("drop");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/traffic-overview.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write `lib/traffic-overview.ts`**

```ts
import { biggestDrop, type DayPoint, type FunnelView } from "@/lib/traffic-funnel";

/**
 * The traffic screen as one list.
 *
 * Pure, and deliberately not `server-only`: the table component's test imports
 * it, and lib/traffic.ts (which is server-only) may not be pulled into jsdom.
 * Same split, and the same reason, as lib/traffic-funnel.ts.
 *
 * Every page is a row, funnel or not. A separate section for the pages with no
 * funnel is what hid /o/book-writer — the busiest page in the store — under
 * fourteen cards.
 */

export type OverviewRow = {
  /** The funnel this row drills into, or null for a page that owns none. */
  key: string | null;
  title: string;
  path: string;
  kind: "product" | "offer" | "other";
  /** Four for a funnel; one (views) for anything else. */
  steps: number[];
  drop: { from: number; percent: number } | null;
  daily: DayPoint[];
  topSource: { source: string; hits: number } | null;
};

export type Sort = "page" | "views" | "checkout" | "upsell" | "bought" | "drop" | "source";
export type Dir = "asc" | "desc";
export type Kind = "all" | "product" | "offer" | "other";

export type OverviewFilter = { kind: Kind; source: string; q: string; sort: Sort; dir: Dir };

const SORTS: readonly Sort[] = ["page", "views", "checkout", "upsell", "bought", "drop", "source"];
const KINDS: readonly Kind[] = ["all", "product", "offer", "other"];

const one = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;

/**
 * The filter off the URL.
 *
 * Whitelisted like every other admin filter: `sort` and `dir` select a
 * comparator, and an unrecognised value has to pick one rather than render
 * nothing. `q` and `source` are compared in memory, never interpolated into a
 * query.
 */
export function overviewFilterFrom(
  params: Record<string, string | string[] | undefined>,
): OverviewFilter {
  const sort = one(params.sort);
  const dir = one(params.dir);
  const kind = one(params.kind);
  return {
    kind: KINDS.includes(kind as Kind) ? (kind as Kind) : "all",
    source: (one(params.source) ?? "").trim(),
    q: (one(params.q) ?? "").trim(),
    sort: SORTS.includes(sort as Sort) ? (sort as Sort) : "views",
    dir: dir === "asc" ? "asc" : "desc",
  };
}

const pathOf = (kind: "product" | "offer", key: string) =>
  kind === "product" ? `/p/${key}` : `/o/${key}`;

export function overviewRows(view: FunnelView): OverviewRow[] {
  const funnels: OverviewRow[] = view.funnels.map((f) => ({
    key: f.key,
    title: f.title,
    path: pathOf(f.kind, f.key),
    kind: f.kind,
    steps: f.steps.map((s) => s.count),
    drop: biggestDrop(f.steps),
    daily: f.daily,
    topSource: f.sources[0] ?? null,
  }));

  const others: OverviewRow[] = view.others.map((o) => ({
    key: null,
    title: o.path,
    path: o.path,
    kind: "other" as const,
    steps: [o.hits],
    drop: null,
    daily: [],
    topSource: o.sources[0] ?? null,
  }));

  return [...funnels, ...others];
}

/** Every source present, busiest first — the options for the select. */
export function sourcesIn(rows: OverviewRow[]): string[] {
  const total = new Map<string, number>();
  for (const r of rows) {
    if (!r.topSource) continue;
    total.set(r.topSource.source, (total.get(r.topSource.source) ?? 0) + r.topSource.hits);
  }
  return [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

const at = (row: OverviewRow, i: number): number => row.steps[i] ?? 0;

export function applyOverview(rows: OverviewRow[], filter: OverviewFilter): OverviewRow[] {
  const q = filter.q.toLowerCase();
  const kept = rows.filter((r) => {
    if (filter.kind !== "all" && r.kind !== filter.kind) return false;
    if (filter.source && r.topSource?.source !== filter.source) return false;
    if (q && !`${r.title} ${r.path}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const sign = filter.dir === "asc" ? 1 : -1;
  return [...kept].sort((a, b) => {
    switch (filter.sort) {
      case "page":
        return sign * a.title.localeCompare(b.title);
      case "source":
        return sign * (a.topSource?.source ?? "").localeCompare(b.topSource?.source ?? "");
      case "drop": {
        // A page with no drop sorts LAST whichever way the column is pointed:
        // "nothing to lose" is not the answer to "what is leaking worst", and
        // it is not the answer to "what is leaking least" either.
        if (!a.drop && !b.drop) return a.title.localeCompare(b.title);
        if (!a.drop) return 1;
        if (!b.drop) return -1;
        return sign * (a.drop.percent - b.drop.percent) || a.title.localeCompare(b.title);
      }
      default: {
        const i = { views: 0, checkout: 1, upsell: 2, bought: 3 }[filter.sort]!;
        return sign * (at(a, i) - at(b, i)) || a.title.localeCompare(b.title);
      }
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/traffic-overview.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Write the table component**

Create `components/admin/traffic-overview.tsx`:

```tsx
import Link from "next/link";
import { formatCount } from "@/lib/traffic-funnel";
import { Sparkline } from "@/components/admin/traffic-funnel";
import type { OverviewFilter, OverviewRow, Sort } from "@/lib/traffic-overview";

const STEP_AT = ["the sales page", "the checkout", "the upsell", "the sale"];

const COLUMNS: { key: Sort; label: string; right?: boolean }[] = [
  { key: "page", label: "Page" },
  { key: "views", label: "Views", right: true },
  { key: "checkout", label: "Checkout", right: true },
  { key: "upsell", label: "Upsell", right: true },
  { key: "bought", label: "Bought", right: true },
  { key: "drop", label: "Biggest drop" },
  { key: "source", label: "Top source" },
];

const KINDS = [
  { key: "all", label: "All" },
  { key: "product", label: "Products" },
  { key: "offer", label: "Offers" },
  { key: "other", label: "Other" },
] as const;

type LinkFilter = OverviewFilter & { preset: string };

/** Every link keeps the whole state: dropping the preset would silently change
 *  the window under the numbers being sorted. */
function href(filter: LinkFilter, over: Partial<OverviewFilter>): string {
  const f = { ...filter, ...over };
  const q = new URLSearchParams();
  if (f.preset && f.preset !== "30") q.set("preset", f.preset);
  if (f.kind !== "all") q.set("kind", f.kind);
  if (f.source) q.set("source", f.source);
  if (f.q) q.set("q", f.q);
  if (f.sort !== "views") q.set("sort", f.sort);
  if (f.dir !== "desc") q.set("dir", f.dir);
  const s = q.toString();
  return s ? `/admin/traffic?${s}` : "/admin/traffic";
}

export function TrafficOverview({
  rows,
  filter,
  sources,
}: {
  rows: OverviewRow[];
  /** Carries the preset too, so a sorted link keeps the window. */
  filter: LinkFilter;
  sources: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={href(filter, { kind: k.key })}
            aria-current={filter.kind === k.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter.kind === k.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted hover:border-fg hover:text-fg"
            }`}
          >
            {k.label}
          </Link>
        ))}

        <form action="/admin/traffic" className="ml-auto flex flex-wrap items-center gap-2">
          <input type="hidden" name="preset" value={filter.preset} />
          <input type="hidden" name="sort" value={filter.sort} />
          <input type="hidden" name="dir" value={filter.dir} />
          {filter.kind !== "all" && <input type="hidden" name="kind" value={filter.kind} />}
          <input
            name="q"
            defaultValue={filter.q}
            placeholder="Search pages"
            aria-label="Search pages"
            className="w-44 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <select
            name="source"
            defaultValue={filter.source}
            aria-label="Source"
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
          >
            <option value="">Every source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-fg"
          >
            Apply
          </button>
        </form>
      </div>

      {/* Orders carry no source anywhere in this store, so a source-filtered
          Bought column would be the unfiltered number sitting beside filtered
          view counts — which reads as that source's conversion rate and is
          wrong by however much traffic came from elsewhere. */}
      {filter.source && (
        <p className="text-xs text-muted">
          Showing views from <span className="font-medium text-fg">{filter.source}</span>. Orders are
          not attributed to a source, so <span className="font-medium text-fg">Bought</span> is left
          blank rather than counted against a filtered funnel.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              {COLUMNS.map((c) => {
                const active = filter.sort === c.key;
                const dir = active && filter.dir === "desc" ? "asc" : "desc";
                return (
                  <th key={c.key} className={`px-4 py-3 font-medium ${c.right ? "text-right" : ""}`}>
                    <Link
                      href={href(filter, { sort: c.key, dir })}
                      aria-current={active ? "page" : undefined}
                      className={active ? "text-fg" : "hover:text-fg"}
                    >
                      {c.label}
                      {active && <span aria-hidden>{filter.dir === "desc" ? " ↓" : " ↑"}</span>}
                    </Link>
                  </th>
                );
              })}
              <th className="px-4 py-3 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.path} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-3">
                  {r.key ? (
                    <Link href={`/admin/traffic/${r.key}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )}
                  <span className="block text-xs text-muted">{r.path}</span>
                </td>
                {[0, 1, 2, 3].map((i) => {
                  const blank = r.kind === "other" ? i > 0 : i === 3 && Boolean(filter.source);
                  return (
                    <td key={i} className="px-4 py-3 text-right tabular-nums">
                      {blank ? (
                        <span className="text-muted">—</span>
                      ) : (
                        formatCount(r.steps[i] ?? 0)
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-sm">
                  {r.drop ? (
                    <span className="text-primary">
                      {r.drop.percent}% at {STEP_AT[r.drop.from + 1]}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {r.topSource ? `${r.topSource.source} ${formatCount(r.topSource.hits)}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.daily.length > 1 ? <Sparkline daily={r.daily} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the component test**

Create `components/admin/traffic-overview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TrafficOverview } from "@/components/admin/traffic-overview";
import { overviewFilterFrom, type OverviewRow } from "@/lib/traffic-overview";

const ROWS: OverviewRow[] = [
  {
    key: "book-writer",
    title: "Book Writer",
    path: "/o/book-writer",
    kind: "offer",
    steps: [100, 20, 5, 4],
    drop: { from: 0, percent: 80 },
    daily: [
      { day: "2026-09-08", hits: 40 },
      { day: "2026-09-09", hits: 60 },
    ],
    topSource: { source: "meta", hits: 60 },
  },
  {
    key: null,
    title: "/",
    path: "/",
    kind: "other",
    steps: [70],
    drop: null,
    daily: [],
    topSource: { source: "direct", hits: 70 },
  },
];

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

function mount(over: Record<string, string> = {}) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  const filter = { ...overviewFilterFrom(over), preset: over.preset ?? "30" };
  act(() => {
    root.render(<TrafficOverview rows={ROWS} filter={filter} sources={["meta", "direct"]} />);
  });
}
const text = () => document.body.textContent ?? "";
const hrefs = () => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");

describe("the traffic table", () => {
  it("puts a funnel and a plain page in the same list", () => {
    mount();
    expect(text()).toContain("Book Writer");
    expect(text()).toContain("/o/book-writer");
    expect(text()).toContain("/");
  });

  it("drills into a funnel and leaves a plain page unlinked", () => {
    mount();
    expect(hrefs()).toContain("/admin/traffic/book-writer");
    expect(hrefs().some((h) => h.startsWith("/admin/traffic/") && h.endsWith("/"))).toBe(false);
  });

  it("says where the biggest drop happened, in words", () => {
    mount();
    expect(text()).toContain("80% at the checkout");
  });

  it("keeps the window and the filters in every sort link", () => {
    // A sorted link that dropped the preset would silently change the window
    // under the numbers being sorted.
    mount({ preset: "7", kind: "offer" });
    const sortLinks = hrefs().filter((h) => h.includes("sort="));
    expect(sortLinks.length).toBeGreaterThan(0);
    for (const h of sortLinks) {
      expect(h).toContain("preset=7");
      expect(h).toContain("kind=offer");
    }
  });

  it("flips the direction of the column already sorted", () => {
    mount({ sort: "drop", dir: "desc" });
    expect(hrefs()).toContain("/admin/traffic?sort=drop&dir=asc");
  });

  it("blanks Bought under a source filter, and says why", () => {
    mount({ source: "meta" });
    expect(text()).toContain("not attributed to a source");
    // 4 is the only step the source filter cannot honour; the views stay.
    expect(text()).toContain("100");
    expect(text()).not.toContain(">4<");
  });

  it("shows dashes rather than zeroes for a page with no funnel", () => {
    mount();
    const cells = [...document.querySelectorAll("tbody tr")][1].querySelectorAll("td");
    expect(cells[1].textContent).toBe("70");
    for (const i of [2, 3, 4]) expect(cells[i].textContent).toBe("—");
  });
});
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npx vitest run components/admin/traffic-overview.test.tsx`
Expected: PASS, 7 tests. If `Sparkline` needs a client boundary, keep it a server component — it renders an inline `<svg>` with no hooks.

- [ ] **Step 8: Rewrite `app/admin/traffic/page.tsx` around the table**

Replace the render body (keeping the heading, the views-vs-people note, `CoverageNote` and the empty state) so that after `const view = buildFunnels(...)`:

```ts
  const filter = overviewFilterFrom(params);
  const rows = overviewRows(view);
  const sources = sourcesIn(rows);
  const shown = applyOverview(rows, filter);
```

and the body renders `<PresetTabs preset={preset} />`, the two notes, then:

```tsx
          <TrafficOverview rows={shown} filter={{ ...filter, preset }} sources={sources} />
```

Delete the `view.funnels.map(...)` card loop and the `<OtherPages … />` line. Change the empty-state condition to `view.funnels.length === 0 && view.others.length === 0` (unchanged meaning, new field name). Capture `searchParams` once into `const params = await searchParams;` and pass it to both `presetFrom` and `overviewFilterFrom`.

Then delete `OtherPages` from `components/admin/traffic-funnel.tsx` — its rows live in the table now.

- [ ] **Step 9: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npx eslint .`
Expected: tsc silent; all tests pass; eslint 0 errors.

- [ ] **Step 10: Commit**

```bash
git add lib/traffic-overview.ts lib/traffic-overview.test.ts components/admin/traffic-overview.tsx components/admin/traffic-overview.test.tsx app/admin/traffic/page.tsx components/admin/traffic-funnel.tsx
git commit -m "Put every page in one sortable table

Fourteen 250px cards could not be ranked, and the pages with no funnel sat
in a list below them — which is where the busiest page in the store was.
One row per page, every header sorts through the URL, and the filters are
chips like the rest of the admin. Bought stays blank under a source filter:
orders carry no source, and the unfiltered number beside filtered views
reads as that source's conversion rate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The drill-in page

Spec §3. The existing card, at its own URL.

**Files:**
- Create: `app/admin/traffic/[key]/page.tsx`
- Test: `app/admin/traffic/traffic-drill-in.test.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 1–4 plus `FunnelCard` (now taking `funnel: Funnel`).
- Produces: the route `/admin/traffic/<key>`.

- [ ] **Step 1: Write the failing test**

Create `app/admin/traffic/traffic-drill-in.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * One funnel at its own URL.
 *
 * The card itself is unchanged — it already answered "how is this page
 * doing". What it lacked was somewhere to live that was not a stack of
 * thirteen others, and a link somebody could send.
 */
const src = readFileSync("app/admin/traffic/[key]/page.tsx", "utf8");

describe("the drill-in page", () => {
  it("builds the same funnels the overview does, from the same window", () => {
    // A second shaping path would drift from the table it was reached from.
    expect(src).toContain("buildFunnels");
    expect(src).toContain("presetFrom");
    expect(src).toContain("rangeOf");
  });

  it("resolves ONE funnel by the key in the path", () => {
    expect(src).toMatch(/view\.funnels\.find\(/);
  });

  it("404s for a key with no funnel in this window", () => {
    expect(src).toContain("notFound()");
  });

  it("renders the card the storefront funnel already had", () => {
    expect(src).toContain("FunnelCard");
  });

  it("keeps the window on the way back", () => {
    // Landing back on a 30-day table after drilling in from a 7-day one is
    // the kind of quiet lie this whole screen is meant to stop telling.
    expect(src).toMatch(/href=\{`\/admin\/traffic\$\{|\/admin\/traffic\?preset=/);
  });

  it("is dynamic, like every other admin page that reads live counts", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/admin/traffic/traffic-drill-in.test.ts`
Expected: FAIL — the file does not exist.

- [ ] **Step 3: Write the page**

Create `app/admin/traffic/[key]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  pageCountsSince,
  paidByProduct,
  paidByOffer,
  productNames,
  offerKeys,
  todayUtc,
} from "@/lib/traffic";
import {
  buildFunnels,
  daysInRange,
  presetFrom,
  rangeOf,
  type FunnelOwner,
} from "@/lib/traffic-funnel";
import { FunnelCard } from "@/components/admin/traffic-funnel";

export const dynamic = "force-dynamic";

/**
 * One funnel, at a URL.
 *
 * The card is the one the overview used to stack fourteen of. Shaped through
 * the same buildFunnels the table uses rather than a query of its own: a
 * second path would drift from the row that was clicked to reach it.
 */
export default async function TrafficFunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const preset = presetFrom(sp);
  // One clock read for the whole request, as everywhere else on this screen.
  const today = todayUtc();
  const range = rangeOf(preset, today);

  const [counts, bought, names, offers, boughtOffers] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    offerKeys(),
    paidByOffer(range),
  ]);
  const owners: FunnelOwner[] = [
    ...names.map((n) => ({ key: n.slug, title: n.title, kind: "product" as const })),
    ...offers.map((o) => ({ key: o.key, title: o.name, kind: "offer" as const })),
  ];
  const view = buildFunnels(counts, [...bought, ...boughtOffers], owners, daysInRange(range));
  const funnel = view.funnels.find((f) => f.key === key);
  if (!funnel) notFound();

  const back = preset === "30" ? "/admin/traffic" : `/admin/traffic?preset=${preset}`;

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <Link href={back} className="kicker w-fit text-muted hover:text-fg">
          &larr; Traffic
        </Link>
        <h1 className="text-2xl">{funnel.title}</h1>
        <p className="text-sm text-muted">
          {funnel.kind === "offer" ? `/o/${funnel.key}` : `/p/${funnel.key}`}
        </p>
      </div>

      {/* The same sentence the overview carries, because somebody arriving
          from a shared link never read it there. */}
      <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
        The first three steps count <span className="font-medium text-fg">views, not people</span>:
        one visitor reloading a page counts twice. Only{" "}
        <span className="font-medium text-fg">Bought</span> counts people, from real paid orders.
        Read the drop between steps as a direction, not a conversion rate.
      </p>

      <FunnelCard funnel={funnel} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/admin/traffic/traffic-drill-in.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run everything and build**

Run: `npx tsc --noEmit && npx vitest run && npx eslint . && npx next build`
Expected: tsc silent; all tests pass; eslint 0 errors; build succeeds with `/admin/traffic/[key]` in the route list.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/traffic/[key]/page.tsx" app/admin/traffic/traffic-drill-in.test.ts
git commit -m "Give one funnel its own URL

The card already answered \"how is this page doing\"; it had nowhere to live
but a stack of thirteen others, and no link anybody could send. Same
buildFunnels the table uses, so the two cannot disagree, and the window
survives the trip in both directions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## After the last task

**Migrate production before deploying.** Migrations do not run on deploy in this repo — there is no Dockerfile step for them. Apply `0077_orders_host_offer.sql` to the production database first, then announce, wait the full 60 seconds, and push:

```bash
ssh root@187.127.154.67 "docker exec -e PGPASSWORD='<GI_PG_PASSWORD>' -i supabase-db-fuv6argrk5j8ogd4y3hi5tu0 psql -U postgres -d postgres -v ON_ERROR_STOP=1" < supabase/migrations/0077_orders_host_offer.sql
```

Then reload PostgREST's schema cache (`notify pgrst, 'reload schema';`) so the new column is visible to the API, and verify with:

```sql
select column_name from information_schema.columns where table_name='orders' and column_name='host_offer_id';
```

**What will look wrong and is not:** offer funnels show `Bought` as 0 for anything sold before the migration, because `host_offer_id` is written forward only. Five orders exist in production; it is noise, but it should not surprise anyone reading the screen in its first week.
