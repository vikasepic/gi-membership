-- Consent + tax fields.
--
-- Consent: the Stripe webhook finalizes orders with no browser and therefore no
-- cookies, so the buyer's tracking consent must be captured at checkout time and
-- stored on the order. Defaults to false: absent consent is never consent.
alter table orders
  add column tracking_consent boolean not null default false;

-- Tax: the store sells digital goods to EU/UK consumers, so VAT is charged at
-- the buyer's country rate. We keep the buyer's declared country and the tax
-- Stripe calculated, so an order row can be reconciled against a filing.
alter table orders
  add column buyer_country text,          -- ISO 3166-1 alpha-2, e.g. 'GB'
  add column tax_cents integer not null default 0,
  add column stripe_tax_calculation_id text;

comment on column orders.tracking_consent is
  'GDPR: true only when the buyer explicitly opted in before purchase.';
comment on column orders.tax_cents is
  'Tax portion of total_cents, as calculated by Stripe Tax at checkout.';
