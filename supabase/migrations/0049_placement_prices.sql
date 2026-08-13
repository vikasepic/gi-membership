-- Which of an offer's prices a placement shows.
--
-- The "second price" this replaces was a foreign key to a whole second OFFER,
-- so two was the ceiling and each extra price meant duplicating a set of copy,
-- a bump design, an upsell page and three CRM tag ids. Now an offer holds its
-- own prices (0048) and a placement picks from them.
--
-- On the placement, not on the offer, and that is the point 0033 made when it
-- moved the second price here in the first place: what a given checkout should
-- SHOW differs per product. One product's bump can offer monthly and yearly;
-- another's can offer only the yearly.
--
-- An EMPTY array means the headline price alone — which is exactly what every
-- placement does today. So nothing changes until somebody ticks something, and
-- adding a third price to an offer cannot silently light up a third radio
-- button on a checkout nobody was looking at.

alter table products
  add column if not exists bump_price_ids   jsonb not null default '[]'::jsonb,
  add column if not exists upsell_price_ids jsonb not null default '[]'::jsonb;

alter table offers
  add column if not exists page_price_ids   jsonb not null default '[]'::jsonb;

-- jsonb accepts a bare number or string as valid json; these are lists.
alter table products drop constraint if exists products_bump_price_ids_array;
alter table products add constraint products_bump_price_ids_array
  check (jsonb_typeof(bump_price_ids) = 'array');
alter table products drop constraint if exists products_upsell_price_ids_array;
alter table products add constraint products_upsell_price_ids_array
  check (jsonb_typeof(upsell_price_ids) = 'array');
alter table offers drop constraint if exists offers_page_price_ids_array;
alter table offers add constraint offers_page_price_ids_array
  check (jsonb_typeof(page_price_ids) = 'array');

-- No backfill, deliberately.
--
-- Today's pairs are two separate OFFERS — "Funnel App - Monthly" beside
-- "Funnel App - Yearly" — and the owner's decision was to leave them alone. A
-- backfill would therefore have to write a list holding prices that belong to
-- two different offers, which is a shape every reader would then have to
-- understand for ever, to describe an arrangement nobody wants to keep.
--
-- So the old columns stay and keep working: a non-empty list here wins, and an
-- empty one falls through to bump_alt_offer_id exactly as before. They come out
-- in their own migration once the placements have been moved by hand, the same
-- way 0033 ended by dropping the column 0030 added.

comment on column products.bump_price_ids is
  'Which of the bump offer''s prices this product shows, in order. Empty means '
  'the headline price alone. Falls through to bump_alt_offer_id while that '
  'column still exists — see lib/checkout.ts.';
