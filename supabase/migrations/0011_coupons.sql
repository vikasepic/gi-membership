-- Discounts on orders.
--
-- The coupons themselves live in Stripe (promotion codes), so there is no
-- coupon table here and nothing to keep in sync: they are created in the
-- dashboard, and test-mode codes are automatically separate from live ones.
--
-- What Stripe cannot hold for us is what a given order actually paid, so that
-- is recorded here — a refund, an accounting question or a "why is this order
-- $0.50" needs the answer stored, not recomputed from a coupon that may since
-- have been deleted or changed.

alter table orders
  add column if not exists coupon_code    text,
  add column if not exists discount_cents integer not null default 0;

comment on column orders.coupon_code is
  'Stripe promotion code applied at checkout, uppercased. Null when none.';
comment on column orders.discount_cents is
  'Amount taken off the subtotal, in cents. Snapshot — never recomputed.';

-- Redemption counting. Stripe only increments times_redeemed when a promotion
-- code is applied to an invoice or subscription; this store charges one-off
-- products with PaymentIntents, which Stripe does not count. Counting our own
-- paid orders is therefore the only way a max-redemptions limit can be honest.
create index if not exists orders_coupon_idx
  on orders (store_id, coupon_code)
  where coupon_code is not null;
