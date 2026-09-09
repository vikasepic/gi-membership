-- Which offer an order was FOR.
--
-- An offer sold on its own page and an offer taken as an upsell are written
-- with the same order_items kind ('oto'), so "how many people bought this
-- offer from its own checkout" could not be asked. The traffic page's fourth
-- funnel step needs exactly that question answered.
--
-- A column rather than a new order_items kind: retyping that line would mean
-- auditing every reader of `kind` — receipts, revenue, the ledger, the CRM
-- sync — and a missed one changes what a buyer is shown or what a number
-- means. This is additive and nothing existing reads it.
--
-- ON DELETE SET NULL matches order_items.offer_id: a deleted offer must not
-- take paid orders with it.
alter table orders add column if not exists host_offer_id uuid
  references offers(id) on delete set null;

comment on column orders.host_offer_id is
  'The offer this order was opened for, when it came from an offer checkout. Null for a product order. Written forward only — orders before this column are null.';

create index if not exists orders_host_offer_id_idx
  on orders (host_offer_id) where host_offer_id is not null;
