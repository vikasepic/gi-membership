# Visit-level attribution — design

Date: 2026-09-11. Status: approved in conversation, awaiting plan.

Builds on `2026-09-10-utm-attribution-design.md`, which shipped the `gi_utm`
cookie and the three `orders` columns. That gave orders a campaign. This gives
the store a record of the visits themselves, and four screens to read it.

## The problem

The owner opened the admin after the last deploy and could not find the
tracking. Three separate reasons, all real:

1. **Most pages record nothing.** Only five paths call `recordPageHit`:
   `/p/<slug>`, `/o/<key>`, `/checkout`, `/checkout/offer`, `/checkout/oto`.
   The home page, `/library`, `/account`, the legal pages and every future
   page are invisible. Someone arriving on the home page from an outside
   site leaves no trace at all.
2. **What is recorded is an aggregate.** `page_counts` holds day, path,
   source, hits, product. There is no row anywhere that says "this visitor
   arrived from this link", so a direct visit can never be explained after
   the fact.
3. **The one place the landing URL exists is gated and hidden.**
   `visitors.landing_url` holds the full URL with its query for all 164 rows,
   but a row is only written after the cookie banner is accepted, only once
   per person ever (`ignoreDuplicates: true`), and no screen displays it.

The result: a store taking Meta traffic every day, where the admin answer to
"where did this sale come from" is the word `direct`.

## Decisions already made

- **Coverage: everyone, personal bits hashed.** Landing URL, referrer,
  campaign labels and device are recorded for every visitor with no consent
  gate. The IP is stored only as a salted hash, never in the clear. Click ids
  (`fbclid`, `gclid`, `_fbp`, `_fbc`) stay behind the consent banner, because
  a click id identifies a person's click rather than an ad. This is a
  deliberate posture the owner takes; the spec records it rather than
  discovering it later.
- **Depth: entry plus milestones.** One row when a visit begins, plus a row
  for each of: reached the checkout, saw the upsell, bought. Not every page
  view — the owner chose this explicitly over a full page-by-page journey.
- **Referrer for any entry page.** The owner's words: "if they are coming
  from any other website to the home page or any other page I want to record
  that too". So capture hangs off the store layout, not off a list of paths.
- **All four screens** are in scope: campaigns, visits, referrers and landing
  pages, and full attribution on each order.

## Goals

- Every visit to any store page is recorded once, with the link that brought
  it, whether or not the visitor accepts the banner.
- A direct visit can be explained: the exact landing URL including its query
  is on the row.
- A campaign's visits, checkouts, orders and revenue are readable in one
  table without leaving the admin.
- An order names the visit that produced it.
- Nothing here can slow down or break a page that takes money.

## Non-goals

- Real-time. Every screen is a query over rows already written.
- Country or city. It needs an IP geolocation database this box does not
  have, and guessing from `Accept-Language` is worse than a blank column.
- A row per page view. The owner chose entry plus milestones.
- Cross-device identity. A visit is keyed on the `gi_anon` cookie; the same
  person on a phone and a laptop is two visitors, as in every tool of this
  kind that does not require a login.
- Replacing the Traffic screen. It stays as the fast funnel overview and
  keeps using `page_counts`.
- Reconstructing the past. Visits begin the day this ships. The 164
  consented `visitors` rows seed a partial history, once, and no more.

## 1. Capture

### Where it hangs

`app/(store)/layout.tsx` renders for every store page and already reads
`headers()`. It gains one fire-and-forget call, `void recordVisit()`, beside
the existing `pixelMatch()`. This is the whole reason the home page starts
counting: the hook is the layout, not a per-page list.

`recordVisit` lives in a new `lib/visits.ts`, is `server-only`, and follows
`lib/traffic.ts`'s house rule exactly: it swallows every error, because it
runs on pages that take money.

### What a visit is

A visit is a `gi_anon` cookie id plus a 30-minute idle window. On each
request `recordVisit` looks for that visitor's most recent visit; if its
`last_seen_at` is within 30 minutes it touches that row and returns,
otherwise it opens a new one. Two writes at once are made harmless by a
unique index (below) rather than by a lock.

`isBot(user-agent)` from `lib/traffic-source.ts` still applies: a bot opens
no visit. A request with no `gi_anon` cookie — the very first request, before
the proxy's `Set-Cookie` lands — opens no visit either, because there is no
id to key it on; the next request has one.

### `visits`

Migration `0080_visits.sql`:

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `store_id` | uuid not null | FK to stores, cascade |
| `anon_id` | text not null | the `gi_anon` cookie |
| `started_at` | timestamptz not null default now() | |
| `last_seen_at` | timestamptz not null default now() | drives the 30-minute window |
| `landing_path` | text not null | `/p/digital-product-validator` |
| `landing_query` | text | the full query, sanitised (below); null when there was none |
| `referrer` | text | the whole referring URL, foreign hosts only |
| `referrer_host` | text | its hostname, for grouping |
| `utm_first` | jsonb not null default `{}` | first touch, from the `gi_utm` cookie |
| `utm_last` | jsonb not null default `{}` | last touch |
| `device` | text | `phone`, `tablet` or `desktop` |
| `browser` | text | `Chrome`, `Safari`, `Firefox`, `Edge`, `Samsung Internet`, `Other` |
| `os` | text | `iOS`, `Android`, `macOS`, `Windows`, `Linux`, `Other` |
| `ip_hash` | text | sha256 of salted IP; never the IP |
| `user_agent` | text | kept whole, for the visit log |
| `created_at` | timestamptz not null default now() | |

Indexes: `(store_id, started_at desc)` for the log; `(store_id, anon_id,
last_seen_at desc)` for the window lookup; a partial unique index on
`(store_id, anon_id, date_trunc('minute', started_at))` so a double render
cannot open two visits in the same minute.

**The query string is sanitised before storage.** Same rule as a label: any
parameter whose value contains `@` is dropped, because ESP links carry
per-recipient addresses. Click ids (`fbclid`, `gclid`, `ttclid`, `msclkid`,
`wbraid`, `gbraid`, `_fbp`, `_fbc`) are dropped too, matched case-insensitively
on the key — this column has no consent gate, and a click id identifies a
person's click, not an ad. Everything else, campaign labels included, is kept
verbatim. Capped at 500 characters.

**The referrer is kept whole**, unlike `orders.referrer` which is origin plus
path. The visit log is where the owner goes to ask "what exactly was this",
and the referring page's own query is part of the answer. Same `@` rule,
capped at 500. Same-host referrers are not recorded: a move from the sales
page to the checkout is not a referral, and recording it would make every
internal navigation look like traffic.

### `visit_steps`

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `store_id` | uuid not null | |
| `visit_id` | uuid not null | FK to visits, cascade |
| `step` | text not null | check in (`checkout`, `upsell`, `purchase`) |
| `order_id` | uuid | set on `purchase`; FK to orders, on delete set null |
| `value_cents` | integer | set on `purchase` |
| `at` | timestamptz not null default now() | |

Unique on `(visit_id, step)` — a visit reaches the checkout once for the
purposes of this table; a refresh is not a second milestone.

Written from the three places that already know: `recordPageHit`'s callers
for `/checkout` and `/checkout/offer` record `checkout`, the OTO page records
`upsell`, and `finalizeOrder` plus `completeOfferCheckout` record `purchase`
with the order and its total.

### `orders.visit_id`

Migration `0080` also adds `orders.visit_id uuid` (FK to visits, on delete
set null), written at order creation from the same lookup the milestone uses.
It is what lets an order link to the visit that produced it, and it is
forward-only: existing orders keep a null.

### Seeding from `visitors`

The migration writes one visit per existing `visitors` row, using
`first_seen_at` as both timestamps, `landing_url` split into path and query,
its `referrer` and `utm`, and null for device, browser, os and ip_hash — that
data was never captured. Those seeded rows are marked by having a null
`user_agent`, and the visit log labels them "before visit tracking" so nobody
reads a blank device as a bug. One-time, guarded so it cannot double-insert.

## 2. The screens

A new **Attribution** group in the admin sidebar, under Customers, with three
entries; the fourth screen is a change to the existing Orders page.

### 2a. `/admin/attribution` — Campaigns

One row per `(source, medium, campaign, ad set, ad)` combination present in
the range, from `visits.utm_last`. Columns: visits, reached checkout, orders,
revenue, and two rates — checkout per visit, orders per checkout. Direct and
referral traffic appear as their own rows rather than being dropped, because
a table that only shows paid traffic cannot tell you what share paid traffic
is.

The same day-range presets the Traffic screen uses (`lib/traffic-funnel.ts`'s
`PRESETS`), and the same whitelist-not-parse rule for every URL value.
Sortable on any numeric column. A row expands to show its full label set.

### 2b. `/admin/attribution/visits` — Visits

Newest first, 100 at a time with a "show more". Each row: when, the landing
path, the campaign or the referrer host or `direct`, device, and how far it
got (a dash, `checkout`, `upsell`, or the order's value). Opening a row shows
the full landing URL with its query, the whole referrer, both label sets, the
user agent, and the milestones with their times.

Filters: by campaign, by referrer host, by outcome, by device. All
whitelisted against the values present.

### 2c. `/admin/attribution/sources` — Referrers and landing pages

Two tables on one screen. The first groups by `referrer_host`, with `direct`
as a row. The second groups by `landing_path`. Both show visits, orders and
revenue, ranked by visits with a toggle to rank by orders.

### 2d. The Orders page

The `SourcePill` popover stays — it is good for scanning. What changes is the
expanded row: instead of the compact block, it lays out every label openly in
two columns, last touch and first touch, plus the landing URL, the referrer,
and a link to the visit. The owner's words: "the tracking and the attribution
must be clear open".

## 3. Reading it back

A new `lib/visit-reports.ts`, pure where it can be and `server-only` where it
queries, holding one function per screen. Every query uses `allRows` from
`lib/traffic.ts` — PostgREST truncates at 1000 rows silently and visits grow
faster than anything else in this store.

Aggregation happens in Postgres, not in Node: three SQL views or RPCs
(`visit_campaign_rollup`, `visit_referrer_rollup`, `visit_landing_rollup`)
grouped and filtered by store and date range. Pulling every visit row into
the app to group it in JavaScript is the version of this that stops working
in six months.

## 4. Privacy and retention

- The IP is hashed with `ATTRIBUTION_IP_SALT`, a new secret set in Coolify.
  Without it the column stays null rather than falling back to a raw IP.
- Click ids are not in `visits` at all. They remain in the consent-gated
  `visitors` row, joined by `anon_id` where consent exists.
- Landing query and referrer drop any value containing `@`.
- **No retention job exists yet.** `app/api/cron` holds only `retry` and
  `backfill-renewals`, so nothing prunes anything today. The plan adds a
  `prune-visits` route that deletes visits older than 400 days, and the owner
  wires it to the same schedule the others use. Until that is wired, visits
  accumulate — at the current rate that is roughly 55,000 rows a year, which
  is harmless, so this is a tidiness task rather than a blocker.
- `docs/privacy` copy is not in scope here, but the owner should know the
  posture changed: the store now records a visit for everyone. Flagged, not
  decided, in the implementation plan's final task.

## Files

| File | Responsibility |
|---|---|
| `lib/visits.ts` (new) | `recordVisit`, `recordVisitStep`, the 30-minute window, `server-only`, swallows everything |
| `lib/visit-fields.ts` (new) | Pure: `deviceOf`, `browserOf`, `osOf`, `sanitizeQuery`, `foreignReferrer`, `hashIp` |
| `lib/visit-fields.test.ts` (new) | Its behaviour tests |
| `supabase/migrations/0080_visits.sql` (new) | Both tables, `orders.visit_id`, indexes, the seed |
| `supabase/migrations/0081_visit_rollups.sql` (new) | The three rollup functions |
| `app/(store)/layout.tsx` | `void recordVisit()` |
| `app/(store)/checkout/page.tsx`, `checkout/offer/page.tsx`, `checkout/oto/page.tsx` | milestone calls |
| `lib/checkout.ts`, `lib/offer-checkout.ts` | `visit_id` on the order; the `purchase` milestone |
| `lib/visit-reports.ts` (new) | One read per screen |
| `app/admin/attribution/page.tsx` (new) | Campaigns |
| `app/admin/attribution/visits/page.tsx` (new) | Visits |
| `app/admin/attribution/sources/page.tsx` (new) | Referrers and landing pages |
| `app/api/cron/prune-visits/route.ts` (new) | Deletes visits older than 400 days |
| `components/admin/visit-row.tsx`, `campaign-table.tsx` (new) | The tables |
| `components/admin/attribution-popover.tsx` | The open two-column layout for the expanded order row |
| `components/admin/sidebar.tsx` | The Attribution group |
| `lib/orders.ts` | `visitId` on `OrderRow` |
| `docs/DATABASE.md`, `docs/lessons.md` | The tables and what this cost |

## Testing

- `lib/visit-fields.test.ts`: device, browser and OS from real user-agent
  strings including a Samsung Internet one and an iPad; `sanitizeQuery` drops
  an `@` value and drops `fbclid` and its siblings, case-insensitively;
  `foreignReferrer` returns null for our own host and keeps the query for a
  foreign one; `hashIp` is stable, salted, and null without a salt.
- `lib/visits.integration.test.ts`: a second call inside the window touches
  the same row rather than opening a second; a call 31 minutes later opens a
  new one; a bot user agent opens none; no `gi_anon` opens none; two
  concurrent calls produce one visit, not two.
- `lib/visit-reports.test.ts`: the rollups group and total correctly, and
  direct traffic appears as its own row rather than vanishing.
- Component tests for the three screens rendering to markup, with the same
  can-it-fail discipline the last branch had to learn twice.
- The migration's seed is exercised against the local database and asserted
  to be re-runnable.

## Risks

- **Write volume on every page.** One extra query and at most one insert per
  request. `recordVisit` is `void`-called and never awaited, exactly like
  `recordPageHit`. If it ever becomes a cost, the window lookup is the thing
  to cache, not the insert.
- **Migration order.** 0080 adds `orders.visit_id`, which order creation
  writes. Same hazard as 0079 and the same rule: apply by hand, reload
  PostgREST, verify through the API, then push.
- **The unique index.** A partial unique on a `date_trunc` expression needs
  an immutable expression; `date_trunc('minute', started_at)` on a
  `timestamptz` is not immutable in Postgres. The plan must use a generated
  column (`started_minute timestamptz generated always as (date_trunc('minute', started_at at time zone 'UTC')) stored`) or a plain unique on
  `(store_id, anon_id, started_at)` accepting that a genuine double-render
  inserts twice. Decide in the plan, with the reason written down.
- **Seeded rows are half-empty.** Device, browser, OS and ip_hash are null
  for all 164. The visit log must say why rather than render blanks.
