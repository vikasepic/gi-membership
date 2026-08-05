-- A second price for an offer sold on its own page.
--
-- The bump and the upsell take their pairing from the product that places
-- them, which is right: the same offer may be sold at two prices on one
-- product's checkout and one price on another's. But /o/<key> has no product
-- behind it — it is the offer standing alone — so it had nowhere to read a
-- second price from, and could only ever sell the one.
--
-- This is that page's own pairing, and only that page's. It does not affect
-- any bump or upsell, which keep reading the product.

alter table offers
  add column if not exists page_alt_offer_id uuid references offers(id) on delete set null;

alter table offers drop constraint if exists offers_page_alt_not_self;
alter table offers add constraint offers_page_alt_not_self
  check (page_alt_offer_id is null or page_alt_offer_id <> id);

comment on column offers.page_alt_offer_id is
  'A second price shown on this offer''s OWN sales page at /o/<key>. Bumps and upsells read their pairing from the product instead.';
