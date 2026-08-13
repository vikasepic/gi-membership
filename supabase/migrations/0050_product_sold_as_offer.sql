-- "This product is sold as this offer."
--
-- A product carries one price and is charged as a bare PaymentIntent. Nothing
-- in the app creates a subscription for a base product — `fulfilOffer` is the
-- only code that creates one at all, and it is called for bumps, upsells and
-- offer checkouts. So "sell this product monthly" was not a form field away; it
-- needed the base item to be chargeable the way an offer is.
--
-- This is the pointer that makes that possible. An offer already knows how to
-- be charged one-time OR recurring, already holds N ways to pay, and already
-- has a checkout that can take any of them. Naming one here says: the ways to
-- pay for this product are that offer's ways to pay.
--
-- On its own this changes NOTHING about what anybody is charged. The product's
-- own price_cents is still what /checkout takes. What it enables is the page
-- knowing which prices to show without every block having to name an offer,
-- and — in the slice after this one — the main checkout routing a recurring
-- choice through the path that can actually bill it.
--
-- Nullable, and null is the default: every product that exists is sold exactly
-- as it is sold today.

alter table products
  add column if not exists offer_id uuid references offers(id) on delete set null;

comment on column products.offer_id is
  'The offer whose ways to pay this product is sold on. Null means the '
  'product''s own one-time price_cents, which is every product today. Does not '
  'change what /checkout charges — see lib/checkout.ts.';

-- `on delete set null`, not restrict: deleting an offer should not be blocked
-- by a product that merely displays its prices. The product falls back to its
-- own price, which is a page that still sells something rather than a page
-- that cannot load.
