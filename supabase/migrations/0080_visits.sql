-- supabase/migrations/0080_visits.sql
--
-- Visits, and the milestones inside them.
--
-- page_counts answers "how many views did this path get today". It cannot
-- answer "where did THIS person come from", which is the question an owner
-- actually asks, and it never saw the home page at all: only five paths call
-- recordPageHit. A visit row is written from the store LAYOUT, so every page
-- is an entry point.
--
-- Recorded for everyone, with no consent gate, because a landing URL and a
-- campaign describe the ad rather than the person. The address is stored only
-- as a salted hash and click ids are not here at all — those stay in the
-- consent-gated `visitors` row. See docs/superpowers/specs/2026-09-11-visit-attribution-design.md.

create table if not exists visits (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  -- The first-party gi_anon cookie. Not a person: the same person on a phone
  -- and a laptop is two visitors, as in every tool that does not require a login.
  anon_id        text not null,
  started_at     timestamptz not null default now(),
  -- Drives the 30-minute idle window in record_visit below.
  last_seen_at   timestamptz not null default now(),
  landing_path   text not null,
  -- The query as the link actually was, click ids included, minus any value
  -- carrying an address. This is what makes a "direct" visit explainable.
  landing_query  text,
  -- The whole referring URL, foreign hosts only. An internal move is not a referral.
  referrer       text,
  referrer_host  text,
  utm_first      jsonb not null default '{}'::jsonb,
  utm_last       jsonb not null default '{}'::jsonb,
  device         text,
  browser        text,
  os             text,
  -- sha256 of salt:ip. Null when ATTRIBUTION_IP_SALT is unset — never a raw address.
  ip_hash        text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists visits_store_started_idx on visits (store_id, started_at desc);
create index if not exists visits_window_idx on visits (store_id, anon_id, last_seen_at desc);
create index if not exists visits_referrer_host_idx on visits (store_id, referrer_host) where referrer_host is not null;

create table if not exists visit_steps (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  visit_id    uuid not null references visits(id) on delete cascade,
  step        text not null check (step in ('checkout','upsell','purchase')),
  order_id    uuid references orders(id) on delete set null,
  value_cents integer,
  at          timestamptz not null default now(),
  -- A refresh is not a second milestone.
  unique (visit_id, step)
);

create index if not exists visit_steps_store_at_idx on visit_steps (store_id, at desc);

-- Which visit produced this order. Forward-only: rows older than this keep null.
alter table orders add column if not exists visit_id uuid references visits(id) on delete set null;
comment on column orders.visit_id is 'The visit this order was placed in. Null for orders predating migration 0080.';

-- Find-or-create, in ONE statement, for the same reason bump_page_count is an
-- RPC: done as a read in Node and then a write, two page loads in the same
-- millisecond both read "no recent visit" and both insert.
--
-- The residual race is two SIMULTANEOUS first page loads by the same visitor
-- with no prior visit, which still inserts twice. That is rare enough to
-- accept, and cheaper than an expression index on a date_trunc whose
-- immutability varies by Postgres version.
create or replace function record_visit(
  p_store uuid, p_anon text, p_path text, p_query text,
  p_referrer text, p_referrer_host text,
  p_utm_first jsonb, p_utm_last jsonb,
  p_device text, p_browser text, p_os text,
  p_ip_hash text, p_user_agent text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  update visits
     set last_seen_at = now()
   where id = (
     select id from visits
      where store_id = p_store
        and anon_id = p_anon
        and last_seen_at > now() - interval '30 minutes'
      order by last_seen_at desc
      limit 1
   )
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into visits (
    store_id, anon_id, landing_path, landing_query, referrer, referrer_host,
    utm_first, utm_last, device, browser, os, ip_hash, user_agent
  ) values (
    p_store, p_anon, p_path, p_query, p_referrer, p_referrer_host,
    coalesce(p_utm_first, '{}'::jsonb), coalesce(p_utm_last, '{}'::jsonb),
    p_device, p_browser, p_os, p_ip_hash, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Seed what the consented visitor rows already know, once.
--
-- Those rows have a landing_url with its query and a referrer, but never had
-- a device, a browser or an address: that was not captured. They are marked
-- by a null user_agent, and the visit log says "before visit tracking" rather
-- than rendering blanks that read as a bug.
insert into visits (store_id, anon_id, started_at, last_seen_at, landing_path, landing_query, referrer, referrer_host, utm_first, utm_last)
select v.store_id,
       v.anon_id,
       v.first_seen_at,
       v.first_seen_at,
       coalesce(nullif(split_part(split_part(v.landing_url, '?', 1), '://', 2), ''), '/') ,
       nullif(split_part(v.landing_url, '?', 2), ''),
       v.referrer,
       nullif(split_part(split_part(coalesce(v.referrer, ''), '://', 2), '/', 1), ''),
       coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(v.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb),
       coalesce((select jsonb_object_agg(t.k, t.val) from jsonb_each_text(v.utm) as t(k, val) where t.k like 'utm\_%' and t.val <> ''), '{}'::jsonb)
  from visitors v
 where not exists (select 1 from visits x where x.store_id = v.store_id and x.anon_id = v.anon_id)
   and v.landing_url is not null;
