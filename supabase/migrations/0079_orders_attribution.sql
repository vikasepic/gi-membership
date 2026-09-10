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
-- carried — and only onto orders that have nothing yet, so this can be
-- re-run without overwriting a real snapshot.
update orders o
   set utm_first = coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(vis.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       utm_last  = coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(vis.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       referrer  = coalesce(o.referrer, left(vis.referrer, 200))
  from visitors vis
 where vis.id = o.visitor_id
   and vis.utm <> '{}'::jsonb
   and o.utm_first = '{}'::jsonb;
