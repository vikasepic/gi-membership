-- N ways to buy one product — the same thing 0048 gave offers.
--
-- A product held one price, so selling the same course at $9/month and
-- $79/year was not a form field away: it needed a second product, or the
-- `products.offer_id` pointer added in 0050, which only let the PAGE borrow an
-- offer's prices and then sent the buyer through a different checkout. Two
-- checkouts for one product is a wart, and the owner was right to refuse it.
--
-- So products get the model offers already have, exactly: a table of ways to
-- pay, an id on ownership and order_items saying which one somebody is on, and
-- the product's own price columns demoted to a mirror of the headline row.
-- Deliberately identical — down to the constraint names and the trigger shape —
-- because two price models that are ALMOST the same is how a checkout ends up
-- charging one thing and recording another.
--
-- Nothing here reaches Stripe. A price is numbers a charge is built from.
-- Recurring product prices bill through the same inline `price_data` path that
-- offers use; see lib/checkout.ts.

create table if not exists product_prices (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products(id) on delete cascade,
  -- Optional. Blank means "say it in terms of what it costs".
  label            text,
  billing_type     text not null check (billing_type in ('one_time','recurring')),
  interval         text check (interval in ('day','week','month','year')),
  interval_count   integer not null default 1 check (interval_count >= 1),
  trial_days       integer check (trial_days is null or trial_days >= 0),
  price_cents      integer not null check (price_cents >= 0),
  compare_at_cents integer check (compare_at_cents >= 0),
  sort_order       integer not null default 0,
  -- Hidden from new buyers, never removed while anybody is on it. Stripe holds
  -- each subscriber's price inline on their own subscription, so hiding one
  -- changes nothing about what they pay — it only stops it being offered.
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Named, all three, for the reason 0048 gives: an inline unnamed CHECK is
  -- invisible in a diff, and this repo has shipped features the database then
  -- refused because of one.
  constraint product_prices_recurring_needs_interval
    check (billing_type <> 'recurring' or interval is not null),
  constraint product_prices_one_time_has_no_trial
    check (billing_type <> 'one_time' or trial_days is null),
  constraint product_prices_compare_at_above_price
    check (compare_at_cents is null or compare_at_cents >= price_cents)
);

create trigger product_prices_updated before update on product_prices
  for each row execute function set_updated_at();

-- Every price of one product, in the order they are shown. created_at breaks a
-- sort_order tie so the order is TOTAL: if the render order and the server's
-- rebuild of it differ by one, a buyer is charged the option beside the one
-- they ticked, with no error anywhere.
create index if not exists product_prices_product_idx
  on product_prices (product_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- Which price somebody is actually on
-- ---------------------------------------------------------------------------
-- `on delete restrict` IS the archive-not-delete rule, held by the database
-- rather than by the admin screen that politely asks first.

alter table ownership
  add column if not exists product_price_id uuid references product_prices(id) on delete restrict;
create index if not exists ownership_product_price_idx
  on ownership (product_price_id) where product_price_id is not null;

alter table order_items
  add column if not exists product_price_id uuid references product_prices(id) on delete restrict;

-- A recurring product is a subscription, and a subscription has to be findable
-- from the thing it grants — the reconciler, the cancel flow and the
-- trial-ending email all ask "who is on this".
alter table ownership
  add column if not exists stripe_subscription_id text;
create index if not exists ownership_subscription_idx
  on ownership (stripe_subscription_id) where stripe_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill: every product becomes a product with exactly one price
-- ---------------------------------------------------------------------------
-- One-time, because that is what every product in this store has always been:
-- `products` has no billing_type, interval or trial_days columns at all. So
-- nothing changes for anybody — each product keeps selling exactly what it
-- sells today, on the terms it already sells it on.

insert into product_prices (product_id, billing_type, price_cents, compare_at_cents, sort_order)
select id, 'one_time', price_cents, compare_at_cents, 0
from products
where not exists (select 1 from product_prices p where p.product_id = products.id);

-- Everyone who has already bought points at the price they bought. There is
-- exactly one per product at this moment, so this cannot be wrong — and without
-- it the buyer count under-reports, which is how a price somebody is on becomes
-- removable.
update ownership o set product_price_id = p.id
  from product_prices p
 where p.product_id = o.product_id and o.product_id is not null and o.product_price_id is null;

update order_items i set product_price_id = p.id
  from product_prices p
 where p.product_id = i.product_id and i.product_id is not null and i.product_price_id is null;

-- ---------------------------------------------------------------------------
-- products.price_cents becomes a mirror of the headline price
-- ---------------------------------------------------------------------------
-- It is read everywhere — the storefront card, the library, the checkout, the
-- sales page, the CRM feed — and by readers no hydration helper can reach.
-- Leaving it to go stale would not fail anywhere; it would quote the wrong
-- price on a card and look entirely plausible.
--
-- So it stops being a fact and becomes a cache, with exactly one writer, which
-- is this. The headline price is the first one showing by (sort_order,
-- created_at): no is_default column, because that would be a second key saying
-- what sort_order already says, and archiving the top price SHOULD promote the
-- next one rather than leave the storefront quoting one nobody can buy.

create or replace function sync_product_default_price() returns trigger as $$
declare
  p_id uuid;
  d    product_prices%rowtype;
begin
  p_id := coalesce(new.product_id, old.product_id);
  select * into d from product_prices
   where product_id = p_id and archived = false
   order by sort_order, created_at
   limit 1;
  -- No price showing at all: leave the last known one standing.
  -- products.price_cents is NOT NULL, so writing a null here would fail the
  -- caller's save with an error naming a table they never touched.
  if not found then
    return null;
  end if;
  update products
     set price_cents      = d.price_cents,
         compare_at_cents = d.compare_at_cents
   where id = p_id;
  return null;
end
$$ language plpgsql;

drop trigger if exists product_prices_sync on product_prices;
create trigger product_prices_sync
  after insert or update or delete on product_prices
  for each row execute function sync_product_default_price();

comment on table product_prices is
  'The ways to buy one product. products.price_cents and compare_at_cents are '
  'a mirror of the first non-archived row here, written by product_prices_sync '
  'and by nothing else. Mirrors offer_prices exactly — see 0048.';
