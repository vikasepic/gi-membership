-- An offer's checkout can carry a bump, the way a product's always could.
--
-- The slot lived on `products` alone, so an offer sold on its own page had no
-- way to offer anything alongside it. `bump_price_ids` mirrors the product
-- column of the same name — same type, same CHECK, same meaning: which of
-- the bump offer's prices THIS placement shows, because one offer may be
-- sold at three prices in one place and one price in another.
--
-- No `bump_product_id`. Products have one; an offer that grants a product is
-- the thing being sold here, so a second nullable target would mean a second
-- guard and a second branch in the charge path for a case nobody has.
alter table offers
  add column if not exists bump_offer_id uuid references offers(id) on delete set null,
  add column if not exists bump_price_ids jsonb not null default '[]'::jsonb;

comment on column offers.bump_offer_id is
  'An offer shown as a tickbox on this offer''s checkout. Must be one-time: a recurring bump would mean creating a subscription from a saved card afterwards, which Stripe refuses on an India-issued card without an e-mandate.';

-- Named, because an unnamed CHECK is invisible in a diff and this repo has
-- twice shipped a feature the database then refused.
alter table offers
  drop constraint if exists offers_bump_not_self;
alter table offers
  add constraint offers_bump_not_self
  check (bump_offer_id is null or bump_offer_id <> id);

-- jsonb accepts a bare number or string as valid json; this is a list.
alter table offers drop constraint if exists offers_bump_price_ids_array;
alter table offers add constraint offers_bump_price_ids_array
  check (jsonb_typeof(bump_price_ids) = 'array');
