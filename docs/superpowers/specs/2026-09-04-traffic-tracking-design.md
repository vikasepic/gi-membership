# On-site traffic tracking

**Date:** 4 September 2026
**Status:** approved in chat, awaiting implementation plan

## The problem

Nobody can answer "how many people saw the sales page, and where did they come
from" without leaving the admin, and the answer they would find elsewhere is
wrong.

Three things are true today:

- **`visitors` is consent-gated.** `/api/track` returns
  `{ stored: false, reason: "no-consent" }` unless the visitor accepted
  cookies, so the table holds only people who opted in — 44 rows against a
  store that has been live since July.
- **GA4 and the Meta pixel are browser-side and equally gated.** They miss
  everyone who declines, blocks scripts, or leaves before hydration.
- **Nothing counts page views at all.** `visitors` records a LANDING url, one
  row per person. The upsell page is never a landing page, so the number of
  people who saw it cannot be derived from anything currently stored.

The ask, in the owner's words: how many people landed on any product sales
page and the upsell page, and where they came from — with attribution that can
be trusted.

## What this is not

Not a replacement for GA4 or the pixel. Those exist to feed ad platforms and
will stay. This answers a different question: **what actually happened on the
site**, including the traffic those tools cannot see.

Not per-person analytics for people who declined tracking. See Privacy.

## Design

Two layers, deliberately different in what they know.

### Layer 1 — true totals, every visitor

A server-side counter incremented as the page renders, before any script runs.
This is the layer that answers "how many", and it counts everyone: ad-blocked,
consent-declined, JavaScript-disabled.

```sql
create table page_counts (
  store_id  uuid not null references stores(id),
  day       date not null,
  path      text not null,      -- '/p/digital-product-validator'
  source    text not null,      -- 'meta' | 'google' | 'direct' | 'referral' | utm campaign
  hits      integer not null default 0,
  unique (store_id, day, path, source)
);
```

One row per day per page per source. A busy store adds a few dozen rows a day
and none of them are ever deleted, so there is no retention policy to get
wrong and no growth to manage.

**`path` is the pathname only, with the query string stripped.** This is not a
detail: an ad click arrives as `/p/x?fbclid=IwcGRvZ…`, and every one of those
is a different string. Keeping the query would give one row per visitor rather
than one row per page per day, which is both useless as a report and the
growth problem this design exists to avoid. The query is read for the source
bucket and then discarded.

**It stores no identifier.** No cookie is read, no `gi_anon`, no IP, no user
agent. A row says "on this day, this many hits on this page from this kind of
source" and nothing that could be traced to a person. That is what makes it
safe to count everyone.

**`source` is bucketed at request time** from the query string and referrer, in
this order:

1. `utm_campaign` when present — the advertiser's own name for the traffic
2. `fbclid` present → `meta`
3. `gclid` present → `google`
4. no referrer → `direct`
5. otherwise → `referral`

The order matters: a UTM is a deliberate label and beats an inferred one.

### Layer 2 — richer detail, consented visitors only

`visitors` stays exactly as it is. Where someone consented there is already an
exact campaign, click id, landing page and first/last seen, and unique people
can be counted.

The admin page shows both, labelled, side by side. **The gap between them is
itself the useful number**: it says what share of real traffic the pixel and
GA4 never saw, which is the thing nobody can currently measure.

### Where the counting happens

In the server component of the four pages that matter:

- `/p/[slug]` — product sales page
- `/o/[key]` — offer sales page
- `/checkout` — checkout
- `/checkout/oto` — upsell

One upsert per render, **not awaited**, so a slow or failing write can never
delay a page or break one. A count is worth less than a page load.

Not middleware. Middleware runs on far more requests than these four pages and
would put a database write in front of traffic that does not need one.

### Bots

Obvious crawlers are filtered by user agent at write time — a short explicit
list (`bot`, `crawl`, `spider`, `preview`, `headless`, and the named link
scanners Meta and Slack use), not a dependency. Without it the numbers are
flattering and wrong, which is worse than not having them.

A short list will miss some. That is accepted: the goal is removing the
obvious inflation, not perfect discrimination, and a filter that grows into a
maintained bot database is a second product.

### The admin page

`/admin/traffic`, beside Orders so the funnel reads top to bottom.

- A row per page: visits, and the source split
- A date range across the top
- The consented-visitor figures beside the true totals, labelled, so the gap
  is visible rather than hidden

## Privacy

The counting layer is aggregate and non-identifying: no cookie, no IP, no user
agent, no per-person record. That is what makes counting a visitor who
declined tracking defensible — nothing about them is stored, only that a page
was viewed.

**Two things this requires of the owner:**

1. The privacy policy should say the store counts page views. This is new
   collection, aggregate or not.
2. The distinction has to hold in implementation. The moment a counter gains
   an identifier it stops being a counter and becomes tracking, and the
   consent gate would then apply to it. Any future change that adds a column
   identifying a person to `page_counts` is a change of kind, not of degree.

## Testing

- **Bucketing** — a UTM beats a referrer; `fbclid` is meta; `gclid` is google;
  no referrer is direct; anything else is referral
- **The upsert increments** rather than inserting a duplicate row for the same
  day, path and source
- **A failed write does not break the page** — the call is not awaited and its
  rejection is swallowed
- **Bots do not count** — a known crawler user agent writes nothing
- **The admin page renders with no data** — a store with no traffic shows an
  empty state, not a crash or a zero-row table that reads as broken

## Phase 2, deliberately not now

Funnel step-through — 100 saw the sales page, 40 reached checkout, 12 bought,
9 saw the upsell, 3 took it. It needs a row per view rather than a daily
rollup, which grows faster and needs a retention policy, and drop-off
percentages mean nothing until there is enough traffic for them to be stable.
Build it once the ads are running and the numbers are worth reading.

## Open questions

None blocking. The privacy policy line is the owner's to write, and is not a
dependency for the code.
