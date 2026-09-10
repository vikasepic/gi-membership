# UTM attribution — design

Date: 2026-09-10. Status: approved in conversation, awaiting plan.

## The problem

The ads team runs Meta campaigns with this link template:

```
utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_adset={{adset.name}}&utm_content={{ad.name}}
```

They read sales in a platform fed straight from Stripe, and they cannot tell
a paid sale from an organic one. Inside the store the picture is the same:
the Orders page shows no source, and the traffic dashboard cannot say how
many sales a source produced.

The store already has most of the machinery and it leaks in four places:

1. **Consent gates everything.** The client tracker posts UTMs to
   `/api/track`, which refuses to store anything until the cookie banner is
   accepted. 40 of 153 visitors have UTMs; 5 of 13 paid orders can be
   attributed. The other 8 are unattributable, not organic.
2. **Adset is dropped.** The tracker captures a fixed list of five keys and
   `utm_adset` is not on it. Meta's `utm_id` and `utm_term` arrive too and are
   kept only by luck.
3. **Nothing reaches Stripe.** Charges and subscriptions carry
   `store_created`, product and offer names, and no campaign.
4. **Orders store a pointer, not a snapshot.** `orders.visitor_id` points at
   a row that exists only with consent, and the ledger never reads it.

## Decisions already made

- **Campaign labels are stored for everyone, without consent.** They describe
  the ad, not the person. Click ids, IP, user agent and the consented visitor
  row stay behind the consent gate exactly as they are. The one guard kept:
  a label containing `@` is dropped, because per-recipient email links name a
  person.
- **Both first touch and last touch are recorded**, on the order and in
  Stripe. First touch is the ad that brought them; last touch is the ad they
  clicked most recently before buying, which is what Ads Manager reports.
- **Existing Stripe metadata and descriptions do not change.** Another
  platform reads `store_created`, `productSlug`, `offerName` and the
  description today. New keys are added beside them.
- **The referrer is captured too**, for the order list.

## Goals

- Every order carries first-touch labels, last-touch labels and the landing
  referrer, written at creation, never reconstructed later.
- Every Stripe object the store creates carries the same labels as metadata.
- Meta and GA4 server events carry the labels.
- The Orders page shows the buyer's name, a source, and every label on
  click, and can be filtered by source.
- The traffic dashboard can count sales per source, so the Bought step is a
  real number under a source filter.
- A visitor who bounces before JavaScript runs is still captured.

## Non-goals

- Rewriting internal links to carry `utm_*` in the URL. A first-party cookie
  does the same job on every request for a year, invisibly.
- Cross-domain carry. An ad that lands on another domain must still carry
  the UTMs in its link to this store; a cookie does not cross subdomains.
- Stamping metadata onto Stripe objects created before this ships.
- Changing the consent gate for click ids, IP, user agent or the visitor
  row.
- Multi-touch beyond first and last.
- A revenue-by-campaign report of its own. The traffic dashboard's source
  split gains an orders column; a full report is a later spec if wanted.

## 1. Capture: a cookie written by the proxy

`proxy.ts` runs on every matched request and already forwards the query to
server components as `x-search`. It gains one more job: maintaining a
`gi_utm` cookie.

**Labels.** The seven keys, and only these: `utm_source`, `utm_medium`,
`utm_campaign`, `utm_adset`, `utm_content`, `utm_term`, `utm_id`. A value is
trimmed, dropped if empty or containing `@`, and cut at 120 characters. Case
is preserved: the ads team matches on the names they typed. Keys keep the
`utm_` prefix everywhere — cookie, database, Stripe — so nothing translates.

**Cookie shape.** JSON, short keys to stay well under the 4 KB cookie limit:

```
{ "f": {labels}, "l": {labels}, "fa": iso, "la": iso, "r": referrer }
```

`f` is first touch, `l` is last touch, `fa`/`la` are when each was seen, `r`
is the landing referrer. Worst case is about 2.1 KB. Attributes: `httpOnly`,
`sameSite: lax`, `secure` outside development, `maxAge` 365 days, `path /`,
the same as `gi_anon`. An unparseable cookie is treated as absent.

**Rules, on each request:**

- The query carries at least one label, and there is no cookie: `f` and `l`
  are both this set, `fa` and `la` are now.
- The query carries labels, and there is a cookie: `l` and `la` are
  replaced; `f`, `fa` and `r` are kept.
- There is no cookie, no labels, and the `referer` header names a host other
  than `NEXT_PUBLIC_SITE_URL`: a cookie is written with `r` only. Referrer
  is stored as origin plus path, never the query, cut at 200 characters.
- There is a cookie and no labels: nothing is written. `Set-Cookie` goes out
  only when the value changed.
- Requests the matcher already excludes (static assets, image optimiser,
  webhooks) are untouched.

Everything except reading and writing the cookie is a pure function in
`lib/attribution.ts`: `parseLabels(search)`, `mergeAttribution(existing,
labels, referrer, now)`, `serialize`/`deserialize`. The proxy calls them and
does nothing clever itself.

**Client tracker.** `components/attribution-tracker.tsx` captures every
`utm_*` key in the query instead of a fixed five, so the consented visitor
row stops dropping the adset. No other change; it is not the source of truth
for orders any more.

## 2. Storage: a snapshot on the order

Migration `0079_orders_attribution.sql`:

```sql
alter table orders
  add column if not exists utm_first jsonb not null default '{}'::jsonb,
  add column if not exists utm_last  jsonb not null default '{}'::jsonb,
  add column if not exists referrer  text;
```

The jsonb holds the labels with their `utm_` keys, e.g.
`{"utm_source":"meta","utm_medium":"paid_social","utm_campaign":"…"}`.

**Written at every order-creation site**, from the cookie on the request
that creates the order:

- the product checkout (`createCheckoutIntent` in `lib/checkout.ts`, the
  insert that already writes `visitor_id`);
- the offer checkout (the second insert in `lib/checkout.ts` that writes
  `visitor_id`);
- renewals (`lib/renewals.ts`), which copy all three from the origin order
  the way they copy `visitor_id` — a renewal has no request and belongs to
  the campaign that made the sale.

A server helper `readAttribution(cookieStore)` in `lib/attribution-server.ts`
returns `{ first, last, referrer }` or empty values; the checkout actions pass
it in beside `anonId`. `lib/orders.ts` selects the three columns onto
`OrderRow` as `utmFirst`, `utmLast`, `referrer`.

**Backfill, in the same migration.** Orders that have a consented visitor
row with UTMs get both sets and the referrer from it:

```sql
update orders o
   set utm_first = (select jsonb_object_agg(k, v) from jsonb_each_text(v.utm) where k like 'utm\_%'),
       utm_last  = (select jsonb_object_agg(k, v) from jsonb_each_text(v.utm) where k like 'utm\_%'),
       referrer  = coalesce(o.referrer, v.referrer)
  from visitors v
 where v.id = o.visitor_id
   and v.utm <> '{}'::jsonb
   and o.utm_first = '{}'::jsonb;
```

That recovers the five attributable sales already made. Orders with no
consented row stay empty and read as direct.

## 3. Stripe metadata

One pure helper, `stripeAttributionMetadata({ first, last, referrer })`,
returns a flat record: `utm_source` … `utm_id` for last touch,
`first_utm_source` … `first_utm_id` for first touch, `referrer`. Only keys
with a value are present, so an organic sale adds nothing. Values are already
under Stripe's 500-character limit and keys under 40.

Spread into the existing `metadata` object, after the existing keys, at
every place the store creates a Stripe object that carries metadata:

- the product PaymentIntent in `createCheckoutIntent`;
- the offer checkout's PaymentIntent and SetupIntent in
  `lib/offer-checkout.ts`;
- both branches of `fulfilOffer` — the subscription and the one-time
  PaymentIntent — which serve the offer checkout, the bump and the upsell
  accept. `fulfilOffer` reads the labels off the order row it is given,
  so every caller gets them without being changed.

Worst case adds 15 keys to a bag that allows 50; the largest existing bag has
about 14.

## 4. Meta and GA4

`PurchaseEvent` in `lib/tracking.ts` gains `attribution?: { first, last,
referrer }`.

**Meta.** `buildMetaEvent` adds the same flat keys as the Stripe helper
into `custom_data`, beside `order_id`, `value` and the content fields. Meta
accepts custom properties there; they appear on the event in Events
Manager. Meta attributes by `fbc`/`fbclid`, which is unchanged — the labels
are for reading, not matching.

**GA4.** `buildGa4Event` adds GA4's own campaign parameter names so its
attribution reports read them: `campaign_id` from `utm_id`, `campaign` from
`utm_campaign`, `source`, `medium`, `term`, `content`. `utm_adset` has no GA4
name and goes as `adset`; first touch goes as `first_source`,
`first_medium`, `first_campaign`; the referrer as `referrer`. Those five are
custom parameters: GA4 stores them but shows them in reports only once
somebody registers each as a custom dimension in that property. The store
cannot verify that, so this is a note for the ads team, not a check.

**Where the labels come from:**

- Money events (Purchase, StartTrial, Subscribe) — read off the order row in
  `purchaseForOrder` / `lib/tracking-receipt.ts`. The browser copy in
  `TrackPurchase` gets them as props from the same receipt, so both copies
  carry the same custom data and the deduplicated event has them whichever
  copy Meta keeps.
- Upper-funnel server copies (`/api/track/event`) — read from the `gi_utm`
  cookie on the request. Never from the body.
- Upper-funnel browser copies — unchanged. GA4's browser tag attributes from
  its own cookies already; Meta attributes by click id. Adding labels there
  would mean exposing the httpOnly cookie to the page for no reporting gain.

## 5. The Orders page

Columns become: **When · Buyer · Items · Status · Source · Total**.

**Buyer** shows the name above the email, with the country beside the email
as now. The name is `users.username`, which the checkout fills with the
typed full name; `lib/orders.ts` joins it. No name, no first line.

**Source** is a small pill: `utm_source · utm_medium` from last touch, e.g.
`meta · paid_social`; `direct` when there are no labels. Clicking the pill
opens a small popover anchored to it (not hover: hover does not exist on a
phone) listing, in this order: the seven last-touch labels that have values;
a "First touch" group with the first-touch labels, shown only when first
touch differs from last; the referrer. Clicking outside or pressing Escape
closes it. Clicking the pill does not toggle the row.

The expanded row shows the same block inline under the items, so a printed
or screenshotted order shows its labels without a click.

**Filter.** A `source` select beside the existing status filter. Its options
are the distinct last-touch `utm_source` values present in the loaded rows
plus `direct`, and the URL value is matched against that set — an
unrecognised value selects "all". Same whitelist rule as every other URL
value in the admin.

## 6. The traffic dashboard

Today, under a source filter, the Bought step is null: orders carried no
source. They do now.

`lib/traffic-source.ts` gains `sourceOfOrder(utmLast, referrer)`, pure, using
the same rules and the same `campaignSlug` as `sourceOf` so a view and its
sale land in the same bucket:

1. a `utm_campaign` that slugs to something → that slug;
2. else `utm_source` in `fb`, `ig`, `meta`, `facebook`, `instagram` →
   `meta`; in `google`, `adwords` → `google`; any other `utm_source` →
   its slug;
3. else a referrer on a foreign host → `referral`;
4. else `direct`.

`paidByProduct` and `paidByOffer` return `BoughtRow` with a `source` field.
`buildFunnels` sums bought per owner across sources for the unfiltered view
and, under a source filter, keeps only rows in that bucket. The forced
`bought = []` under a filter in `app/admin/traffic/page.tsx` goes away, and
the Bought step under a filter becomes a measured number.

`SourceSplit` gains `orders`, and the per-source table in the drill-in shows
a Bought column beside Hits. That single table is the ads team's answer:
views and sales, per campaign, for the period.

Orders made before this shipped and not recovered by the backfill sit in
`direct`. The dashboard's existing coverage note gains one sentence saying
so, with the ship date, so a reader of August numbers does not conclude the
ads did nothing.

## Files

| File | Change |
|---|---|
| `lib/attribution.ts` | New. Pure: `parseLabels`, `mergeAttribution`, `serializeCookie`, `parseCookie`, `stripeAttributionMetadata`, types `Labels`, `Attribution`. |
| `lib/attribution-server.ts` | New. `readAttribution(cookieStore)`; `server-only`. |
| `proxy.ts` | Maintain `gi_utm`. |
| `components/attribution-tracker.tsx` | Capture every `utm_*` key. |
| `supabase/migrations/0079_orders_attribution.sql` | Three columns, backfill. |
| `lib/checkout.ts` | Accept attribution in both checkout inputs; write it on both inserts; metadata on the product PaymentIntent; `fulfilOffer` reads the order's labels and stamps both branches. |
| `lib/offer-checkout.ts` | Metadata on its PaymentIntent and SetupIntent. |
| `lib/renewals.ts` | Copy the three columns from the origin order. |
| `lib/orders.ts` | Select the three columns and the buyer name. |
| `lib/tracking.ts` | `attribution` on `PurchaseEvent`; Meta `custom_data`; GA4 params. |
| `lib/tracking-receipt.ts` | Carry attribution on the receipt. |
| `components/track-purchase.tsx` | Pass it on the browser copy. |
| `app/api/track/event/route.ts` | Read the cookie for upper-funnel server copies. |
| `components/admin/order-row.tsx` | Buyer name, Source pill, popover, inline block. |
| `components/admin/attribution-popover.tsx` | New. The popover and the inline block, one component, two layouts. |
| `app/admin/orders/page.tsx` | Source filter. |
| `lib/traffic-source.ts` | `sourceOfOrder`. |
| `lib/traffic.ts` | `BoughtRow.source`; the two paid-by queries select `utm_last, referrer`. |
| `lib/traffic-funnel.ts` | Sum bought per source; `SourceSplit.orders`. |
| `app/admin/traffic/page.tsx` | Drop the forced empty bought under a filter. |
| `components/admin/traffic-table.tsx`, `traffic-funnel.tsx` | Bought column in the source split; coverage sentence. |
| `docs/DATABASE.md`, `docs/products-and-offers.md` | The columns and where they are written. |

## Testing

- `lib/attribution.test.ts`: `parseLabels` keeps the seven keys and no
  others, drops `@`, drops empty, cuts at 120, preserves case;
  `mergeAttribution` sets both on first sight, replaces only last on a later
  sight, keeps the referrer, writes a referrer-only record on a foreign
  referrer with no labels, returns "unchanged" when nothing changed;
  `parseCookie` returns empty on garbage; `stripeAttributionMetadata` emits
  only present keys with the right prefixes.
- `proxy.test.ts`: a request with `utm_source` gets a `Set-Cookie` for
  `gi_utm` with `httpOnly` and a year's `maxAge`; a plain request with an
  existing cookie gets no `Set-Cookie`; a plain request from a foreign
  referrer with no cookie gets a referrer-only cookie.
- `lib/checkout.integration.test.ts` (existing suite): an order created
  with attribution carries `utm_first`, `utm_last` and `referrer`; the
  PaymentIntent's metadata carries `utm_source` and `first_utm_source` and
  still carries `store_created`.
- `lib/tracking.test.ts`: Meta `custom_data` and GA4 `params` carry the
  labels; an event without attribution emits none of the keys.
- `lib/traffic-source.test.ts`: `sourceOfOrder` cases 1–4, and that a view
  with `utm_campaign=X` and an order with `utm_last.utm_campaign=X` bucket
  identically.
- `lib/traffic-funnel.test.ts`: bought rows summed across sources; a source
  filter keeps only its bucket; `SourceSplit.orders` present.
- `components/admin/order-row.test.tsx`: the name renders above the email;
  the pill reads `meta · paid_social`; clicking it opens the popover with
  the adset and does not expand the row; `direct` with no labels; first
  touch shown only when it differs.
- The offer-checkout suite: the SetupIntent's metadata carries the labels.

A behaviour test each; source-text assertions only where a behaviour test
cannot reach (none expected).

## Risks

- **Cookie size.** Bounded by the 120-character cap on seven values twice
  plus a 200-character referrer. About 2.1 KB worst case, under the 4 KB
  limit with room for the store's other cookies.
- **`Set-Cookie` on every ad click.** Only on requests whose labels differ
  from the stored last touch, so a session's page views after landing write
  nothing.
- **A metadata key collision** with an existing name. None of the existing
  bags use `utm_`, `first_utm_` or `referrer`; the helper is spread last, so
  an accidental future collision would be visible in the test that asserts
  `store_created` survives.
- **Migration order.** The columns must exist before the image that writes
  them serves a checkout. Apply 0079 by hand, `notify pgrst, 'reload
  schema'`, then push.
- **Bucket drift** between views and sales: both go through `campaignSlug`,
  and one test asserts a view and its sale share a bucket.
