-- Which Stripe mode an order was made in.
--
-- Two orders in this table are test-mode purchases: real rows, marked paid,
-- for money that never moved. They were made while the store was still on a
-- test key, and nothing recorded that — so they count towards revenue, sit in
-- the members' purchase history, and hold subscription ids Stripe will never
-- renew or cancel because they do not exist in live mode.
--
-- Deleting them would lose the record of a real test. Marking them says what
-- they are, which is what anybody reading the orders list actually needs.
--
-- Default true, because every order written from here on sets it explicitly
-- from the key that created it, and the rest of the table is live.
alter table orders
  add column if not exists livemode boolean not null default true;

comment on column orders.livemode is
  'False when the order was made against a Stripe test key. Test orders are real rows for money that never moved: excluded from revenue, kept for the record.';

-- The two, identified by subscriptions Stripe answers for with "No such
-- subscription; a similar object exists" — its phrasing for an id that lives
-- in the other mode. Reached through order_items, which is where a
-- subscription id is written.
update orders o
   set livemode = false
  from order_items i
 where i.order_id = o.id
   and i.stripe_subscription_id in (
     'sub_1Twx0hKjvA6KCUXm8Dln9c54',
     'sub_1TyCRZKjvA6KCUXmB0wfLoDP'
   );

create index if not exists orders_livemode_idx on orders (store_id, livemode)
  where livemode = false;

notify pgrst, 'reload schema';
