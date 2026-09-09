-- Which offers the storefront shows, and in what order.
--
-- The home page listed EVERY active recurring offer, cheapest first. That rule
-- was invisible and unchangeable: splitting Content Engine into three channel
-- offers put all three on the storefront the moment they went active, with
-- nowhere in the admin to say otherwise, and a one-time offer could never
-- appear at all however much it belonged there.
--
-- So placement becomes a number the admin sets. Null means "not on the home
-- page" — the default, because an offer exists to be sold from wherever it is
-- linked, and appearing on the storefront is the exception a person chooses.
-- 1 shows first. Billing type stops deciding anything.
alter table offers add column if not exists home_order integer
  check (home_order is null or home_order > 0);

comment on column offers.home_order is
  'Position on the storefront. Null = not shown. 1 is first. Replaces the old "every active recurring offer" rule.';

create index if not exists offers_home_order_idx
  on offers (home_order) where home_order is not null;

-- Seed today's page so the deploy changes nothing visible.
--
-- Exactly what the old rule selected — active, recurring — in exactly the
-- order it showed them, cheapest first. Without this every storefront goes
-- blank on deploy and stays blank until somebody numbers them by hand, which
-- is a worse default than the rule being replaced.
with ranked as (
  select id, row_number() over (order by price_cents asc, id asc) as n
    from offers
   where active and billing_type = 'recurring'
)
update offers o set home_order = ranked.n
  from ranked
 where o.id = ranked.id and o.home_order is null;
