-- N ways to pay for one thing.
--
-- An offer held one price, so selling the same thing monthly AND yearly meant
-- building a second whole offer — its own copy, its own bump design, its own
-- OTO page, its own CRM tags — and pairing the two with a "second price"
-- dropdown. Two was also the ceiling, because every pairing was a single
-- nullable foreign key.
--
-- Not a jsonb column on offers, for three reasons that all point the same way:
-- a price is referenced by ownership and by order_items, so it needs an id the
-- database can police; "how many people are on this price" has to be a question
-- answerable with an index, because it is the question that decides whether a
-- price may be removed; and the recurring-needs-an-interval rule that offers
-- already states as a CHECK stays expressible as a CHECK.
--
-- Nothing here reaches Stripe. Subscriptions are created with inline
-- price_data (lib/checkout.ts) and one-time offers are a bare PaymentIntent, so
-- a price is numbers a charge is built from rather than an object that has to
-- exist somewhere first. All the prices of one offer share ONE Stripe product —
-- they are the same thing on different terms. Do not add a product per price.

create table if not exists offer_prices (
  id               uuid primary key default gen_random_uuid(),
  offer_id         uuid not null references offers(id) on delete cascade,
  -- Optional. Blank means "say it in terms of what it costs", which is what
  -- every derived label in this app already does.
  label            text,
  billing_type     text not null check (billing_type in ('one_time','recurring')),
  interval         text check (interval in ('day','week','month','year')),
  -- What makes fortnightly possible: every 2 weeks.
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

  -- Named, all three of them. offers carries this same rule as an INLINE
  -- unnamed CHECK (0001_init.sql), which is why it is invisible in a diff and
  -- why this repo has twice shipped a feature the database then refused.
  constraint offer_prices_recurring_needs_interval
    check (billing_type <> 'recurring' or interval is not null),
  -- Free trials only, and there is nothing to trial about a one-off purchase.
  constraint offer_prices_one_time_has_no_trial
    check (billing_type <> 'one_time' or trial_days is null),
  -- A "was" price below the price is a discount that reads as a markup.
  constraint offer_prices_compare_at_above_price
    check (compare_at_cents is null or compare_at_cents >= price_cents)
);

create trigger offer_prices_updated before update on offer_prices
  for each row execute function set_updated_at();

-- The only read pattern there is: every price of one offer, in the order they
-- are shown. created_at breaks a sort_order tie so the order is total — if the
-- render order and the server's rebuild of it ever differ by one, a buyer is
-- charged the option beside the one they ticked, with no error anywhere.
create index if not exists offer_prices_offer_idx
  on offer_prices (offer_id, sort_order, created_at);

-- No store_id. Every read reaches a price through its offer, and offers.store_id
-- already says which store it belongs to. Add one when something genuinely
-- queries prices without an offer in hand, and not before.

-- ---------------------------------------------------------------------------
-- Which price somebody is actually on
-- ---------------------------------------------------------------------------
-- `on delete restrict` IS the archive-not-delete rule. The admin refusing to
-- remove a price with subscribers is the polite version; this is the one that
-- holds when a script, a console or a future screen forgets to ask.

alter table ownership
  add column if not exists offer_price_id uuid references offer_prices(id) on delete restrict;
create index if not exists ownership_offer_price_idx
  on ownership (offer_price_id) where offer_price_id is not null;

alter table order_items
  add column if not exists offer_price_id uuid references offer_prices(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Backfill: every offer becomes an offer with exactly one price
-- ---------------------------------------------------------------------------
-- Nothing merges and nothing moves. An offer that exists today keeps selling
-- exactly what it sells today, and the pairs built as two offers stay two
-- offers — that was the owner's decision, and it is the reason this migration
-- cannot change anybody's price.
--
-- interval_count is coalesced because the column has always been nullable with
-- a default of 1, and one live row is null.

insert into offer_prices (offer_id, billing_type, interval, interval_count,
                          trial_days, price_cents, compare_at_cents, sort_order)
select id, billing_type, interval, coalesce(interval_count, 1),
       trial_days, price_cents, compare_at_cents, 0
from offers
where not exists (select 1 from offer_prices p where p.offer_id = offers.id);

-- Everyone who has already bought points at the price they are on. There is
-- exactly one per offer at this moment, so this cannot be wrong — and without
-- it the subscriber count under-reports, which is how a price somebody is on
-- becomes removable.
update ownership o set offer_price_id = p.id
  from offer_prices p
 where p.offer_id = o.offer_id and o.offer_id is not null and o.offer_price_id is null;

update order_items i set offer_price_id = p.id
  from offer_prices p
 where p.offer_id = i.offer_id and i.offer_id is not null and i.offer_price_id is null;

-- ---------------------------------------------------------------------------
-- offers' own price columns become a mirror of the headline price
-- ---------------------------------------------------------------------------
-- They are read in around sixty places, and in raw SQL by
-- lib/subscription-emails.ts — a reader no hydration helper can reach. Leaving
-- them to go stale would not fail anywhere; it would quote the wrong price to a
-- live subscriber in a trial-ending email and look entirely plausible.
--
-- So they stop being a fact and become a cache, with exactly one writer, which
-- is this. The headline price is the first one showing by (sort_order,
-- created_at) — no is_default column, because that would be a second key
-- describing what sort_order already says, and hiding the top price SHOULD
-- promote the next one rather than leave the storefront quoting a price nobody
-- can buy.

create or replace function sync_offer_default_price() returns trigger as $$
declare
  o_id uuid;
  d    offer_prices%rowtype;
begin
  o_id := coalesce(new.offer_id, old.offer_id);
  select * into d from offer_prices
   where offer_id = o_id and archived = false
   order by sort_order, created_at
   limit 1;
  -- No price showing at all: leave the last known one standing. offers.price_cents
  -- is NOT NULL, so writing nulls here would fail the caller's save with an
  -- error naming a table they never touched.
  if not found then
    return null;
  end if;
  -- billing_type and interval move TOGETHER or offers' own inline CHECK
  -- (recurring implies an interval) rejects the write.
  update offers
     set billing_type     = d.billing_type,
         interval         = d.interval,
         interval_count   = d.interval_count,
         trial_days       = d.trial_days,
         price_cents      = d.price_cents,
         compare_at_cents = d.compare_at_cents
   where id = o_id;
  return null;
end
$$ language plpgsql;

drop trigger if exists offer_prices_sync on offer_prices;
create trigger offer_prices_sync
  after insert or update or delete on offer_prices
  for each row execute function sync_offer_default_price();

comment on table offer_prices is
  'The ways to pay for one offer. offers.price_cents and its siblings are a '
  'mirror of the first non-archived row here, written by offer_prices_sync and '
  'by nothing else.';
