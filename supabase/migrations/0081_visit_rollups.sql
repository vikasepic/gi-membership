-- supabase/migrations/0081_visit_rollups.sql
--
-- Grouped in Postgres, not in Node. Pulling every visit row into the app to
-- group it in JavaScript is the version of this that stops working in six
-- months, and PostgREST truncates at 1000 rows silently while it does.

create or replace function visit_campaign_rollup(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (
  source text, medium text, campaign text, adset text, ad text,
  visits bigint, checkouts bigint, orders bigint, revenue_cents bigint
)
language sql stable
as $$
  select coalesce(nullif(v.utm_last->>'utm_source',''), 'direct')  as source,
         coalesce(nullif(v.utm_last->>'utm_medium',''), '—')       as medium,
         coalesce(nullif(v.utm_last->>'utm_campaign',''), '—')     as campaign,
         coalesce(nullif(v.utm_last->>'utm_adset',''), '—')        as adset,
         coalesce(nullif(v.utm_last->>'utm_content',''), '—')      as ad,
         count(distinct v.id)                                       as visits,
         count(distinct s_checkout.visit_id)                        as checkouts,
         count(distinct s_purchase.visit_id)                        as orders,
         coalesce(sum(s_purchase.value_cents), 0)                   as revenue_cents
    from visits v
    left join visit_steps s_checkout on s_checkout.visit_id = v.id and s_checkout.step = 'checkout'
    left join visit_steps s_purchase on s_purchase.visit_id = v.id and s_purchase.step = 'purchase'
   where v.store_id = p_store and v.started_at >= p_from and v.started_at < p_to
   group by 1,2,3,4,5
   -- PostgREST's 1000-row cap applies to a set-returning function same as any
   -- table select. Without this, whatever truncates is whatever the planner
   -- happened to emit last, not the least important rows.
   order by visits desc;
$$;

create or replace function visit_referrer_rollup(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (key text, visits bigint, orders bigint, revenue_cents bigint)
language sql stable
as $$
  select coalesce(nullif(v.referrer_host,''), 'direct') as key,
         count(distinct v.id) as visits,
         count(distinct s.visit_id) as orders,
         coalesce(sum(s.value_cents), 0) as revenue_cents
    from visits v
    left join visit_steps s on s.visit_id = v.id and s.step = 'purchase'
   where v.store_id = p_store and v.started_at >= p_from and v.started_at < p_to
   group by 1
   order by visits desc;
$$;

create or replace function visit_landing_rollup(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (key text, visits bigint, orders bigint, revenue_cents bigint)
language sql stable
as $$
  select v.landing_path as key,
         count(distinct v.id) as visits,
         count(distinct s.visit_id) as orders,
         coalesce(sum(s.value_cents), 0) as revenue_cents
    from visits v
    left join visit_steps s on s.visit_id = v.id and s.step = 'purchase'
   where v.store_id = p_store and v.started_at >= p_from and v.started_at < p_to
   group by 1
   order by visits desc;
$$;

-- Only the service role calls these. Postgres grants EXECUTE to PUBLIC by
-- default, and 0067 revoked function privileges from anon/authenticated but
-- not from PUBLIC. The reads would still be refused — anon has neither the
-- table grant nor an RLS policy on visits/visit_steps — but leaving EXECUTE
-- open means that argument has to be reconstructed by whoever reads this
-- next. Exact signatures, per 0068's warning: a mismatch revokes nothing.
revoke all privileges on function visit_campaign_rollup(uuid, timestamptz, timestamptz) from public;
grant execute on function visit_campaign_rollup(uuid, timestamptz, timestamptz) to service_role;

revoke all privileges on function visit_referrer_rollup(uuid, timestamptz, timestamptz) from public;
grant execute on function visit_referrer_rollup(uuid, timestamptz, timestamptz) to service_role;

revoke all privileges on function visit_landing_rollup(uuid, timestamptz, timestamptz) from public;
grant execute on function visit_landing_rollup(uuid, timestamptz, timestamptz) to service_role;
