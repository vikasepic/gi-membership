-- Money that arrives after the checkout.
--
-- The store recorded exactly one order per subscription: the one made at the
-- checkout, which on a trial is $0. Everything after it — the real charge when
-- a 7-day trial converts, and every renewal for the life of the subscription —
-- arrived at Stripe and nowhere else. No order, no receipt, no conversion
-- event.
--
-- The consequence was not only bookkeeping. Meta was told StartTrial at signup
-- and never told the trial converted, so the only signal it could optimise
-- towards was people who take free trials.
--
-- A renewal is an ORDER, like any other. Same table, same items, same receipt.
alter table orders
  add column if not exists stripe_invoice_id text;

-- Idempotency, at the database rather than in a check-then-insert.
--
-- Stripe redelivers a webhook after any non-2xx and on its own retry schedule,
-- and two deliveries racing would otherwise both read "no order yet" and both
-- write one — a duplicate receipt and a duplicate conversion, on the one event
-- type that arrives every month forever.
create unique index if not exists orders_invoice_uq
  on orders (stripe_invoice_id)
  where stripe_invoice_id is not null;

-- What a renewal line is called. The CHECK is inline and unnamed in 0001, so
-- it has to be dropped by its generated name and rewritten.
alter table order_items
  drop constraint if exists order_items_kind_check;
alter table order_items
  add constraint order_items_kind_check
  check (kind in ('product', 'bump', 'oto', 'renewal'));

comment on column orders.stripe_invoice_id is
  'The Stripe invoice this order records, for a renewal or a trial converting. Null on a checkout order. Unique, so a redelivered webhook cannot write a second one.';

notify pgrst, 'reload schema';
