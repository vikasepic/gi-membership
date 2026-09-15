-- Payment plans: a recurring price that stops after N instalments.
--
-- A plan is not a third billing type. It is a recurring row with
-- `installments` set, so every path that already handles recurring (the
-- SetupIntent, the subscription, dunning, revocation) handles a plan, and
-- only the places that need to know it ends read this column. The schedule
-- that ends it lives in Stripe; see lib/payment-plans-stripe.ts.
--
-- Null everywhere today. Nothing changes for an existing price.

alter table offer_prices
  add column if not exists installments integer;
alter table offer_prices
  add constraint offer_prices_installments_plan
  check (installments is null or (installments between 2 and 24 and billing_type = 'recurring'));

alter table product_prices
  add column if not exists installments integer;
alter table product_prices
  add constraint product_prices_installments_plan
  check (installments is null or (installments between 2 and 24 and billing_type = 'recurring'));

comment on column offer_prices.installments is
  'Set on a recurring row: charge this many times, then stop and keep the grant. Null: an ordinary subscription. Migration 0085.';
comment on column product_prices.installments is
  'Set on a recurring row: charge this many times, then stop and keep the grant. Null: an ordinary subscription. Migration 0085.';

notify pgrst, 'reload schema';
