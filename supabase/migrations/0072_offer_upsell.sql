-- An offer's checkout can carry an upsell (a one-time-offer page shown after
-- payment), the way a product's already could.
--
-- The slot lived on `products` alone, so an offer sold on its own page had no
-- upsell to send its buyer to. `upsell_price_ids` mirrors the product column
-- of the same name — same type, same CHECK, same meaning: which of the
-- upsell offer's prices THIS placement shows.
--
-- Unlike bump_offer_id (0071), a RECURRING offer is allowed here. A bump rides
-- the host's own single PaymentIntent, so a recurring one would mean creating
-- a subscription from a saved card AFTER that payment — off-session, which
-- Stripe refuses on an India-issued card with no e-mandate. An upsell is never
-- folded into another payment: acceptOto charges (or subscribes) the saved
-- card on its own, exactly as buying that same offer any other way would, so
-- there is no off-session-at-checkout problem for a recurring one to create.
alter table offers
  add column if not exists upsell_offer_id uuid references offers(id) on delete set null,
  add column if not exists upsell_price_ids jsonb not null default '[]'::jsonb;

comment on column offers.upsell_offer_id is
  'The one-time-offer page shown after this offer''s checkout, on the order''s own thank-you/return trip. May be recurring, unlike bump_offer_id — see the comment above this column''s migration.';

-- Named, because an unnamed CHECK is invisible in a diff and this repo has
-- twice shipped a feature the database then refused.
alter table offers
  drop constraint if exists offers_upsell_not_self;
alter table offers
  add constraint offers_upsell_not_self
  check (upsell_offer_id is null or upsell_offer_id <> id);

-- jsonb accepts a bare number or string as valid json; this is a list.
alter table offers drop constraint if exists offers_upsell_price_ids_array;
alter table offers add constraint offers_upsell_price_ids_array
  check (jsonb_typeof(upsell_price_ids) = 'array');
