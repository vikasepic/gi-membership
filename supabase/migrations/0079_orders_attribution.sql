-- supabase/migrations/0079_orders_attribution.sql
--
-- Where an order came from, as the ads team labels it.
--
-- A snapshot on the order rather than a pointer: orders.visitor_id points at
-- a row that exists only with cookie consent, which most buyers never give —
-- 5 of 13 paid orders could be attributed through it. The labels describe the
-- ad, not the person, so they are captured for everyone and copied here at
-- creation. Written by lib/checkout.ts (product checkout), lib/offer-checkout.ts
-- (offer checkout, from the intent's metadata because completion also runs
-- from the webhook) and lib/renewals.ts (copied from the origin order).
--
-- Shape: {"utm_source": "meta", "utm_medium": "paid_social", ...} — the seven
-- keys in lib/attribution.ts, with their utm_ prefix. utm_first is the ad that
-- brought them, utm_last the one they clicked most recently before buying.
-- Empty object means no labels, which the admin reads as "direct".

alter table orders
  add column if not exists utm_first jsonb not null default '{}'::jsonb,
  add column if not exists utm_last  jsonb not null default '{}'::jsonb,
  add column if not exists referrer  text;

comment on column orders.utm_first is 'First-touch campaign labels (utm_source … utm_id) snapshotted at order creation. {} when none. See lib/attribution.ts.';
comment on column orders.utm_last  is 'Last-touch campaign labels snapshotted at order creation. {} when none. What the Orders page and Stripe metadata show.';
comment on column orders.referrer  is 'Landing referrer, origin + path, foreign hosts only. Null when direct or unknown.';

-- Recover what the consented visitor rows already know. Only utm_* keys —
-- visitors.utm was written by the client tracker from whatever the URL
-- carried — and only onto orders that have nothing yet.
--
-- NOT safely re-runnable after launch: `o.utm_first = '{}'::jsonb` cannot
-- tell "not yet backfilled" from "genuinely direct", so re-running this after
-- the branch is live would stamp a post-launch direct order with its
-- visitor's consented labels — attribution it never should have had. The
-- `created_at` cutoff below is what makes a re-run before the ship date safe;
-- past it, do not run this UPDATE again.
--
-- visitors.referrer is raw document.referrer: it keeps the query string and
-- includes same-host referrers, which orders.referrer's own comment (above)
-- says never to store — a referrer's query can carry a per-recipient token
-- or session id, and it is exported to Meta/GA4 on every renewal. This
-- approximates lib/attribution.ts's landingReferrer as closely as SQL
-- reasonably can:
--   - split_part(..., '?', 1) drops the query string, matching landingReferrer
--     returning origin+pathname only.
--   - the LIKE guard nulls out same-host referrers, matching landingReferrer
--     returning null when u.hostname equals the site's hostname.
-- Where it cannot match: landingReferrer parses a real URL and compares
-- u.hostname (host only, port stripped, case-insensitive by construction);
-- this is a lowercased prefix match against the production origin, so it
-- would wrongly null out a foreign host that happens to share this
-- string as a literal prefix (e.g. grow.greaterinside.com.example.net) —
-- neither is a real shape this store's traffic produces. It also does not
-- drop a URL fragment the way a strict origin+pathname reconstruction would;
-- referrer headers do not carry fragments, so this does not come up in
-- practice.
update orders o
   set utm_first = coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(vis.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       utm_last  = coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(vis.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       referrer  = coalesce(
         o.referrer,
         case
           when lower(vis.referrer) like 'http://grow.greaterinside.com%'
             or lower(vis.referrer) like 'https://grow.greaterinside.com%'
           then null
           else left(split_part(vis.referrer, '?', 1), 200)
         end
       )
  from visitors vis
 where vis.id = o.visitor_id
   and vis.utm <> '{}'::jsonb
   and o.utm_first = '{}'::jsonb
   and o.created_at < '2026-09-11';
