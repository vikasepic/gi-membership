-- A bump or an upsell can name a product.
--
-- Until now a placement stored an `offer_id` and nothing else, which is the
-- only reason a product could not be sold on a checkout it did not own. Not a
-- concept — a column. Somebody wanting to upsell "The Idea Vault" had to build
-- an offer that existed solely to point at it.
--
-- One column per placement, beside the offer one. Never both: a placement sells
-- one thing, and a row naming two is a row where the code has to guess, which
-- is the kind of guess that charges somebody for the wrong item.
--
-- `bump_price_ids` and `upsell_price_ids` are REUSED rather than duplicated.
-- They hold price ids, and a placement names either an offer or a product, so
-- the ids belong to whichever one it named. Two more jsonb columns would only
-- create a second place for the same list to be wrong.
--
-- This is slice 1 of the products/offers merge — see docs/products-and-offers.md.
-- It is deliberately additive: nothing existing changes, and a placement that
-- names an offer keeps working exactly as it does today.

alter table products
  add column if not exists bump_product_id uuid references products(id) on delete set null,
  add column if not exists upsell_product_id uuid references products(id) on delete set null;

-- One thing per placement. A row naming an offer AND a product is ambiguous,
-- and the ambiguity would be resolved by whichever branch the code checked
-- first — which is not a decision anybody made on purpose.
alter table products
  drop constraint if exists products_bump_names_one_thing;
alter table products
  add constraint products_bump_names_one_thing
  check (bump_offer_id is null or bump_product_id is null);

alter table products
  drop constraint if exists products_upsell_names_one_thing;
alter table products
  add constraint products_upsell_names_one_thing
  check (upsell_offer_id is null or upsell_product_id is null);

-- A product cannot be its own bump or upsell. Buying a thing and being offered
-- the same thing beside it is a checkout arguing with itself, and taking it
-- would grant something already being granted by the order it sits on.
alter table products
  drop constraint if exists products_bump_is_not_self;
alter table products
  add constraint products_bump_is_not_self
  check (bump_product_id is null or bump_product_id <> id);

alter table products
  drop constraint if exists products_upsell_is_not_self;
alter table products
  add constraint products_upsell_is_not_self
  check (upsell_product_id is null or upsell_product_id <> id);

comment on column products.bump_product_id is
  'The product offered as this checkout''s order bump. Mutually exclusive with '
  'bump_offer_id; bump_price_ids holds the price ids of whichever was named.';
