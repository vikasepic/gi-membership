# Traffic overview — design

**Date:** 2026-09-09
**Status:** approved in chat, ready for an implementation plan

## The problem

`/admin/traffic` renders one ~250px card per product funnel, stacked, then a
flat "Other pages" list of everything else. With five products and nine offers
it is already a page you scroll rather than read, and the store keeps adding
pages.

Two things are wrong with it, and only one of them is layout.

**Nothing can be ranked.** Every card is the same size and they are ordered by
sales-page views. The question the owner actually opens this screen to answer —
*which page is leaking* — requires reading all of them and holding four numbers
per card in your head.

**The busiest pages have no funnel at all.** `buildFunnels` creates a card only
when the recorded slug names a real product row. `/o/<key>` records the offer
key in that same column, so every offer falls through to "Other pages" with a
total and nothing else. In production on 9 Sep 2026 that meant `/o/book-writer`
— 256 views, the single busiest page in the store — sat in a list under fourteen
product-funnel cards showing one number.

## What it becomes

One sortable table listing every page, funnel or not, with a filter row and a
set of date presets. Clicking a row opens that page's full funnel at its own
URL.

## Goals

The four jobs the owner uses this screen for, confirmed 9 Sep 2026:

1. Spot which page is leaking, across everything.
2. Check how one specific page is doing.
3. Compare where traffic comes from.
4. See whether a launch worked.

## Non-goals

- **Custom start/end dates.** Presets only, this pass. Job 4 is therefore served
  only where a launch lines up with a preset. Accepted deliberately; §4 leaves
  the door open at low cost.
- **Period-over-period comparison** (±% against the preceding window).
- **Any change to how a view is counted**, beyond the three gaps in §1. No new
  event types, no client-side tracking.
- **Revenue.** This screen counts views and orders. Money lives on Orders.

---

## 1. Counting: making an offer a first-class funnel

An offer funnel has the same four steps a product's does — sales page, checkout,
upsell, bought — and today only the first records anything usable.

### 1a. The offer checkout records no hit

`app/(store)/checkout/offer/page.tsx` never calls `recordPageHit`. The second
step of every offer funnel is therefore permanently zero.

The page takes `?offer=<id>`, resolves it with `getOffer(offerId)`, and holds a
full `Offer` before it renders. Add, beside the existing fire-and-forget pattern
in the sibling checkout page:

```ts
void recordPageHit("/checkout/offer", offer.key);
```

Placed after the eligibility redirects, so a member bounced to
`/library?offer=already_owned` is not counted as having reached a checkout.

### 1b. The upsell view is filed under nothing

`recordOtoPageHit(orderId)` resolves the order's base product — the
`order_items` row with `kind = 'product'` — and files the hit under that slug.
An order that originated from an offer's own checkout has no such row, so the
hit is written with `product = ""`. Those are the 24 blank-product hits visible
in production today.

Change: when no base product resolves, fall back to the host offer's key. §1c
provides the host offer.

### 1c. "Bought" is not derivable for an offer

`paidByProduct` counts distinct paid orders per product slug via
`order_items.kind = 'product'`. There is no equivalent for an offer, and it
cannot be written against today's data: `lib/offer-checkout.ts` writes the host
offer's own line with `kind: "oto"` — the *same kind* `lib/checkout.ts` uses for
an accepted upsell. An offer sold on its own page and an offer taken as an
upsell are indistinguishable.

**Decision: add a nullable `orders.host_offer_id`** rather than retype the line.

- Retyping means auditing every reader of `order_items.kind` — receipts,
  revenue, the ledger, the CRM sync — and a missed one changes what a buyer is
  shown or what a number means.
- A column is additive. Nothing existing changes meaning, and no existing reader
  needs to know it exists.

```sql
alter table orders add column if not exists host_offer_id uuid
  references offers(id) on delete set null;
create index if not exists orders_host_offer_id_idx
  on orders (host_offer_id) where host_offer_id is not null;
```

`ON DELETE SET NULL` matches how `order_items.offer_id` already behaves: a
deleted offer must not take paid orders with it.

Written where the offer's order row is created in `lib/offer-checkout.ts` — the
same insert that already knows `offer.id`. Backfill is not required: five orders
exist in production and one is an upsell.

A new `paidByOffer(start, end)` returns `BoughtRow[]` keyed by offer key,
counting distinct paid `livemode` orders with a matching `host_offer_id`. Same
paging and same `livemode` filter as `paidByProduct`, for the same reasons its
comments give.

### 1d. `buildFunnels` only knows products

```ts
export function buildFunnels(
  counts: CountRow[],
  bought: BoughtRow[],
  names: ProductName[],
  days: string[],
): FunnelView
```

becomes

```ts
export type FunnelOwner = { key: string; title: string; kind: "product" | "offer" };

export function buildFunnels(
  counts: CountRow[],
  bought: BoughtRow[],
  owners: FunnelOwner[],
  days: string[],
): FunnelView
```

`owners` is products (slug → title) plus offers (key → name), each tagged. A
recorded product value owns a funnel if it appears in `owners`; everything else
still falls through to `others`. That rule is what keeps the keys of *deleted*
offers out — `content-engine-monthly` is in production with 7 hits and no offer
row, and it belongs in "other", not in a funnel with three empty steps.

`ProductFunnel` is renamed `Funnel` and gains `kind: "product" | "offer"`,
keeping every other field. `FunnelView.products` is renamed `FunnelView.funnels`
for the same reason: a field called `products` holding offers is the kind of lie
that survives for a year. Both renames ripple only into `traffic-funnel.tsx` and
the traffic page, which this design rewrites anyway.
`bought` is the concatenation of `paidByProduct` and `paidByOffer`; keys cannot
collide because a product slug and an offer key are checked against distinct
tables and any collision resolves to whichever owner is listed — products first,
which is the status quo.

### Step labels

The four labels are shared. An offer's steps mean:

| Step | Product | Offer |
|---|---|---|
| Saw the sales page | `/p/<slug>` | `/o/<key>` |
| Reached the checkout | `/checkout` | `/checkout/offer` |
| Saw the upsell | `/checkout/oto` | `/checkout/oto` |
| Bought | base-product order lines | `orders.host_offer_id` |

---

## 2. The overview

One table. Every page in the window appears in it, funnel or not.

| Column | Contents |
|---|---|
| Page | Title, with the path beneath it in muted type |
| Type | `Product` · `Offer` · `Other` chip |
| Views | Sales-page views (step 1) |
| Checkout | Step 2 |
| Upsell | Step 3 |
| Bought | Step 4 — people, not views |
| Biggest drop | The largest step-to-step fall, as `79% at checkout` |
| Trend | Sparkline over the window |
| Top source | The busiest source and its count |

Every header sorts, ascending and descending, through the URL
(`?sort=drop&dir=desc`) so a sorted view is shareable and the page stays a server
component. `sort` is a whitelist of `page | views | checkout | upsell | bought |
drop | source` and `dir` of `asc | desc`, both falling back to the default —
they select a comparator, and an unrecognised value must pick one rather than
render nothing. Sorting happens after shaping, in memory, over rows already
read; it never reaches a query.

**Default sort: views, descending** — the current order, so the screen opens
looking familiar. One click on *Biggest drop* answers job 1.

**Rows with no funnel** — the storefront, `/checkout`, dead offer keys — show
views, trend and top source, with an em dash in the four step columns. They are
not a separate section. One list means one sort and nothing below a fold.

**Filters**, above the table, all URL-driven:

- Type chips: All / Product / Offer / Other.
- Source: a select of the sources present in the window, filtering rows to
  traffic from that source. Selecting one recomputes the three view steps, the
  trend and the totals from that source's rows alone — this is job 3, and a
  filter that only hid rows would not answer it.

  **`Bought` cannot follow it.** `page_counts` carries a source; `orders` does
  not. With a source selected, the `Bought` column shows an em dash and the
  filter row carries one line saying orders are not attributed to a source. The
  alternative — leaving the unfiltered order count beside filtered view counts —
  reads as a conversion rate for that source and would be wrong by however much
  of the traffic came from elsewhere.
- Name search: a text input matching title or path, case-insensitive substring.

**Kept from today, unchanged:** the views-versus-people note and `CoverageNote`.
Both explain what the numbers are and cannot be dropped in a redesign.

**Empty state:** the existing copy, still gated on
`funnels.length === 0 && others.length === 0` rather than on a view count, for
the reason the current comment gives — a product can sell in a window with no
recorded view.

**Biggest drop** is computed over consecutive steps where the earlier step is
non-zero. A funnel whose first step is zero has no drop and sorts last, not
first: a page with no traffic is not the page that is leaking.

---

## 3. The drill-in

`/admin/traffic/[key]` renders the existing `FunnelCard` full width for one
owner, plus its source split and daily chart — the card as it is today, moved.

- `key` is a product slug or an offer key.
- A key with no owner in the window renders `notFound()`.
- Rows in the table that have no key (raw paths under "Other") do not link.
- A back link to `/admin/traffic` preserving the current query string, so the
  window and filters survive the round trip.

No new visual design. The card already answers job 2; it only lacked a URL.

---

## 4. Date presets

Seven presets: **Today · Yesterday · 7 days · 30 days · 90 days · This month ·
Last month**.

*This month* and *last month* are not "the last N days", so the traffic module
stops taking a day count and takes an explicit inclusive day pair.

```ts
export type Preset =
  | "today" | "yesterday" | "7" | "30" | "90" | "this-month" | "last-month";
export type DayRange = { start: string; end: string };   // inclusive, "YYYY-MM-DD"

export function presetFrom(params: Record<string, string | string[] | undefined>): Preset;
export function rangeOf(preset: Preset, today: string): DayRange;
export function daysInRange(range: DayRange): string[];
```

`presetFrom` stays a whitelist, not a parse, for the reason `rangeFrom`'s
comment already gives: the value reaches a query, and an unbounded number would
be a request for the whole table. Default remains 30 days.

All four readers change signature from `(days, today)` to `(range: DayRange)`:
`pageCountsSince`, `paidByProduct`, `paidByOffer`, `consentedVisitorCount`.
`windowStart` is deleted; `rangeOf` replaces it.

Every window stays UTC-calendar-bounded, inclusive of both ends. `page_counts.day`
is written from `toISOString()`, and the order step must be bounded by the same
UTC midnights as the three view steps — the invariant `paidByProduct`'s existing
comment protects, and the one a `days`-to-`DayRange` change is most likely to
break. The order query's bounds become
`>= ${start}T00:00:00.000Z` and `< ${end + 1 day}T00:00:00.000Z`.

`today` remains read once per request and passed in, for the reason the current
code documents: a request crossing UTC midnight between two reads builds a chart
a day shorter than the totals beside it.

**Why this is worth the refactor:** once the queries take a day pair, custom
start/end dates are a form and a validator, not a rework.

---

## Files

**Migration**
- Create `supabase/migrations/0074_orders_host_offer.sql` — §1c.

**Counting**
- `app/(store)/checkout/offer/page.tsx` — record the hit (§1a).
- `lib/traffic.ts` — `recordOtoPageHit` host-offer fallback (§1b); `paidByOffer`
  (§1c); `DayRange` signatures, `windowStart` deleted (§4).
- `lib/offer-checkout.ts` — write `host_offer_id` on the order insert (§1c).

**Shaping**
- `lib/traffic-funnel.ts` — `FunnelOwner`, `buildFunnels` (§1d); `Preset`,
  `presetFrom`, `rangeOf`, `daysInRange` (§4); `biggestDrop` (§2).

**Screens**
- `app/admin/traffic/page.tsx` — rewritten around the table.
- Create `app/admin/traffic/[key]/page.tsx` — §3.
- Create `components/admin/traffic-overview.tsx` — table, sortable headers, filters.
- `components/admin/traffic-funnel.tsx` — `RangeTabs` becomes `PresetTabs`;
  `OtherPages` deleted, its rows now live in the table; `FunnelCard` and
  `Sparkline` unchanged.

## Testing

Existing suites cover the arithmetic well and are the model to follow.

- **`lib/traffic-funnel.test.ts`** — an offer key owns a funnel; a deleted
  offer's key still falls through to `others`; `biggestDrop` ignores a
  zero-traffic funnel; `rangeOf` for all seven presets, including a month
  boundary and a leap-adjacent one; `daysInRange` inclusive at both ends.
- **`lib/traffic.integration.test.ts`** — `paidByOffer` counts distinct orders
  and excludes non-`livemode` ones; an order at the window's first UTC midnight
  counts and one a second earlier does not.
- **`lib/traffic-wiring.test.ts`** — source assertions that
  `/checkout/offer/page.tsx` calls `recordPageHit`, and that every reader takes
  a `DayRange`. This file exists because a counting call site that is deleted or
  never added fails silently.
- **Component test for the overview** — sorting by each column; the type and
  source filters recomputing rather than hiding; a funnel-less row rendering
  dashes; the views-versus-people note present.

## Risks

- **The `days` → `DayRange` change touches every traffic query.** The failure
  mode is off-by-one at a UTC boundary, which looks like nothing on screen. The
  boundary tests above are the mitigation and are not optional.
- **`host_offer_id` is only written going forward.** Offer funnels will show
  `Bought` as 0 for anything sold before the migration. With five orders in
  production this is noise, but it should not surprise anyone reading the
  screen in the first week.
- **A source-filtered view has no `Bought` number,** because orders are not
  attributed to a source anywhere in this store. That is a real limit on job 3,
  not a temporary gap — closing it means recording a source on the order, which
  is out of scope here.
- **The source filter recomputes every number it can.** More expensive than hiding
  rows, and the honest reading of "where traffic comes from". At a few dozen
  rows a day over at most ninety days the read is already one query; the filter
  is applied while shaping, not by re-querying.
