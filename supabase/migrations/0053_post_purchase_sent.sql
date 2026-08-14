-- When the post-purchase email went, so it can only go once.
--
-- The email is sent from three places, because there are three ways a checkout
-- can end: the buyer reaches the thank-you page, or they close the tab on the
-- upsell and a sweep picks them up later, or the upsell offer expires. All
-- three call the same function, and this column is what makes calling it twice
-- harmless.
--
-- A timestamp rather than a boolean. "Did it send" and "when" are the same
-- question here, and the answer is the first thing anybody asks when a buyer
-- says they never got it.
--
-- Deliberately NOT a not-null default: every order that already exists reads
-- as never sent, which is true. Nothing sweeps them, because the sweep only
-- looks at orders newer than its window.

alter table orders
  add column if not exists post_purchase_sent_at timestamptz;

comment on column orders.post_purchase_sent_at is
  'When the welcome/post-purchase email was sent for this order. Null means '
  'never. Set by lib/post-purchase-send.ts, which is the only writer.';

-- The sweep asks "paid orders with nothing sent yet", newest first. Partial,
-- because the rows it wants are the small minority — everything else has a
-- timestamp within minutes of being paid.
create index if not exists orders_post_purchase_pending_idx
  on orders (store_id, created_at)
  where post_purchase_sent_at is null;
