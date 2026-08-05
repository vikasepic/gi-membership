-- The second price belongs to the PLACEMENT, not the offer.
--
-- 0030 put alt_offer_id on the offer, which read as "this thing can be bought
-- monthly or yearly" — true, but not the question being asked. The question is
-- what a given product's checkout should SHOW, and that differs per product:
-- one may want both prices in its bump, another only the monthly.
--
-- With it on the offer, the product form was a single select where picking
-- "Funnel App - Monthly" silently produced two radio buttons and picking
-- "Funnel App - Yearly" produced one, with nothing on the page saying so. Two
-- selects per placement say exactly what a buyer will see, and leaving the
-- second empty is how you ask for one price.

alter table products
  add column if not exists bump_alt_offer_id   uuid references offers(id) on delete set null,
  add column if not exists upsell_alt_offer_id uuid references offers(id) on delete set null;

-- An alternative that is the same offer would render the same price twice.
alter table products drop constraint if exists products_bump_alt_distinct;
alter table products add constraint products_bump_alt_distinct
  check (bump_alt_offer_id is null or bump_alt_offer_id <> bump_offer_id);
alter table products drop constraint if exists products_upsell_alt_distinct;
alter table products add constraint products_upsell_alt_distinct
  check (upsell_alt_offer_id is null or upsell_alt_offer_id <> upsell_offer_id);

comment on column products.bump_alt_offer_id is
  'A second price shown beside bump_offer_id, turning the tickbox into a choice. Null means one price.';
comment on column products.upsell_alt_offer_id is
  'A second price shown beside upsell_offer_id as a second one-click button. Null means one price.';

-- Carry over what was already configured on the offer, so nothing set up
-- before this migration quietly loses its second price.
update products p
   set bump_alt_offer_id = o.alt_offer_id
  from offers o
 where p.bump_offer_id = o.id
   and o.alt_offer_id is not null
   and p.bump_alt_offer_id is null;

update products p
   set upsell_alt_offer_id = o.alt_offer_id
  from offers o
 where p.upsell_offer_id = o.id
   and o.alt_offer_id is not null
   and p.upsell_alt_offer_id is null;

-- One home for the fact, and it is not this one.
alter table offers drop column if exists alt_offer_id;
