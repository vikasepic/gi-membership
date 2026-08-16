-- An order that starts a subscription has no payment to point at.
--
-- Every product order so far has been a PaymentIntent: a charge, today, for a
-- known amount. A recurring product price cannot be one. On a trial there is
-- nothing to charge today, and a $0 PaymentIntent is not a thing Stripe will
-- make — which is exactly why the offer checkout has always saved the card with
-- a SetupIntent and let the subscription bill on its own schedule.
--
-- So the order needs somewhere to record which SetupIntent it came from.
-- `stripe_payment_intent_id` is not that column: reusing it would mean every
-- reader of a payment id has to know it might be a setup id instead, and the
-- ones that forget would retrieve the wrong object type and throw.
--
-- Nullable, and exactly one of the two is set on any order.

alter table orders
  add column if not exists stripe_setup_intent_id text;

comment on column orders.stripe_setup_intent_id is
  'Set instead of stripe_payment_intent_id when this order starts a '
  'subscription — a recurring product price, where nothing is charged today. '
  'See lib/checkout.ts finalizeOrder.';

-- finalizeOrder looks an order up by whichever id it was handed, and it is
-- called from the thank-you page and the Stripe webhook within milliseconds of
-- each other. Without this that lookup is a sequential scan of every order the
-- store has ever taken, twice per purchase.
create unique index if not exists orders_setup_intent_idx
  on orders (stripe_setup_intent_id)
  where stripe_setup_intent_id is not null;

-- ---------------------------------------------------------------------------
-- Where a product's Stripe product lives
-- ---------------------------------------------------------------------------
-- A subscription needs a Stripe Product to hang its inline price_data on.
-- Offers have carried these two columns since the beginning; products need them
-- for the same reason and with the same rule: one Stripe product per thing, not
-- one per price. All the ways to buy a product are the same product on
-- different terms.
--
-- Two columns rather than one, because test and live mode are separate object
-- spaces in Stripe — a test product id sent to the live API is a 404 at the
-- moment of a real purchase.
--
-- Not created ahead of time. The id is written the first time a recurring price
-- is actually charged, so a store that sells nothing recurring never has a
-- Stripe product it did not ask for.

alter table products
  add column if not exists stripe_product_id_test text,
  add column if not exists stripe_product_id_live text;

comment on column products.stripe_product_id_live is
  'The Stripe Product every recurring price of this product bills against. '
  'Written on first use by ensureStripeProductFor in lib/checkout.ts.';
