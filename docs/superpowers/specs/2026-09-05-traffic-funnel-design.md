# Traffic, part 1: a funnel per product

**Date:** 5 September 2026
**Status:** approved in chat, awaiting implementation plan
**Follows:** `2026-09-04-traffic-tracking-design.md`, which shipped the counter this extends.

## The problem

The traffic page went live yesterday and answers less than it looks like it
does.

**`/checkout` is one row for the whole catalogue.** The counter stores a
pathname with the query stripped — deliberately, because `?fbclid=…` would make
every row unique — so `/checkout?product=digital-product-validator` and
`?product=the-guide-to-viral-carousels` are the same line. The screen shows
`/checkout — 1` and there is no way to know whose checkout that was.
`/checkout/oto` has the same problem.

**There is no funnel.** Four independent path totals sit in a list. The
question anyone actually has — of the people who saw this product's sales
page, how many reached its checkout, and how many bought — cannot be asked.

**There is nothing over time.** Every figure is a 30-day total. A launch, a
quiet week and a spike all read the same.

**It looks like a debug view**, because it is one: a list of raw paths with
numbers beside them.

## Scope

This is part 1 of two. Part 1 counts VIEWS and stores no identifier, so it
keeps counting everyone — including people who declined cookies. Part 2 (a
separate spec, not this one) adds per-person paths for the consented subset,
which needs a row per view carrying a visitor id and a retention policy.

Part 1 makes part 2 easy to add. The reverse is not true, which is why this
one goes first.

## Design

### The data

`page_counts` gains one column:

```sql
alter table page_counts add column product text not null default '';
```

**Not nullable, defaulting to the empty string.** It has to join the primary
key, and Postgres will not accept a NULL in one — a nullable column there is
not a stricter version of this design, it is a design that does not run.
Empty string means "this page is not about one product".

- Sales pages already carry it in the path (`/p/<slug>`, `/o/<key>`) and set
  `product` to the same slug, so every row groups one way.
- `/checkout` sets it from the `product` search param it has already resolved
  to a real published product before it renders — the value written is
  `product.slug` from that row, never the raw query, so it cannot be used to
  inject cardinality.
- `/checkout/oto` sets it from the order behind its signed token: the base
  `order_items` row's product slug, which the page already loads to build the
  offer.
- Everything else writes `''`.

**The primary key becomes `(store_id, day, path, source, product)`**, and
`bump_page_count` takes a fifth argument. A row per day per path per source
per product. Cardinality stays bounded: `product` is only ever a slug that
resolved to a real row, and the charset guard already added to `source` stops
that column being free text.

**`product` is a slug, never an identifier.** It names a thing in the
catalogue, not a person. The privacy line from the first spec holds unchanged:
this table still records that a page was viewed, never who viewed it.

### The funnel

Per product, four steps:

| Step | Source |
|---|---|
| Saw the sales page | `page_counts` where `path` is `/p/<slug>` |
| Reached the checkout | `page_counts` where `path` = `/checkout` and `product` = slug |
| Saw the upsell | `page_counts` where `path` = `/checkout/oto` and `product` = slug |
| Bought | `orders` joined through `order_items`, `status = 'paid'`, `livemode` |

The last step comes from orders rather than page views on purpose: it is the
only step where a real number exists, and reading it from the ledger means the
funnel ends in something that reconciles with revenue.

**The honest limit, stated on the page and not buried:** the first three steps
are VIEWS. One person reloading the sales page twice is two views. So "412 →
88" is a direction, not a conversion rate, and the page says so. Part 2 is what
turns it into a rate. A funnel that implies more precision than it has is worse
than no funnel, because somebody will make a spending decision on it.

### Over time

A line per product of daily views of its sales page, across the selected range.
`page_counts` already stores `day`, so this needs no new data — only a query
that does not sum it away.

Ranges: 7, 30, 90 days. Default 30.

**Hand-rolled inline SVG, no charting library.** The repo has no chart
dependency and this needs one line and an axis; adding recharts for that is a
dependency, a bundle and an upgrade path in exchange for something an SVG
`polyline` does. The chart must render server-side with the rest of the page.

### The page

Replaces the flat path list at `/admin/traffic`:

- A product per card, ordered by traffic
- Its funnel across the card, with drop-off between the steps
- Its sparkline of daily views
- Its source split
- Pages with no product (the store home, anything else counted later) in a
  short "other pages" list below, not in the funnel

The visual design is done at implementation through the project's design
skill, not specified here. What this spec fixes is what the page must SAY;
how it looks is a separate discipline and specifying it in prose here would
produce worse results than letting that skill do it against the real data.

### Empty and thin states

- No traffic at all → the sentence that is already there
- A product with views but no orders → the funnel renders with a zero final
  step. That is a real and useful answer, not an empty state
- Fewer than ~2 days of data → the sparkline is omitted rather than drawn as a
  single dot pretending to be a trend

## What this does not do

- **No unique people.** That is part 2, and it needs consent.
- **No per-person paths.** Same.
- **No attribution of a purchase to a source.** Tempting — "which source
  bought" — but `page_counts` holds no identifier, so a view and an order
  cannot be joined. Doing it would require the identifier this design
  deliberately refuses. The Meta and GA4 events already answer it for
  consented traffic.

## Testing

- The `product` column is set correctly by all four pages, including `''` where
  there is none — and specifically that `/checkout` writes the resolved
  product's slug rather than the raw query parameter
- The upsert still increments rather than duplicating now the key has five
  columns
- Funnel assembly: a product with views at every step, one with a gap in the
  middle, one with orders but no views (possible — a direct link), one with
  nothing
- The "bought" step counts paid live orders only, excluding test-mode rows
- The sparkline omits itself below two days of data
- The page renders with no data, and with a product that has no orders

## Open questions

None blocking. Retention is not a question here — the rollup is bounded and
nothing is deleted; it becomes one in part 2.
