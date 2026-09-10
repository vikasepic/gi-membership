-- Attribute the offer purchases made before there was a column to record it.
--
-- 0077 added `orders.host_offer_id` and it is written forward only, so every
-- offer sold before that migration counts as nothing on the traffic screen's
-- "Bought" step. Reported 10 Sep 2026: Book Writer showed 1 sale against two
-- real ones in Stripe, and the missing one was bought the day before the
-- column existed.
--
-- Only where the answer is not a guess. An offer sold on its own page and an
-- offer accepted as an upsell are both written with `kind = 'oto'`, so an
-- order carrying two of them cannot say which was the purchase. This claims
-- an order only when:
--
--   * it has no product line — a product order's host is the product, and its
--     host_offer_id must stay null; and
--   * it has exactly ONE 'oto' line — so there is one candidate, not two.
--
-- A bump rides along as `kind = 'bump'` and is never the host, so an offer
-- bought with a bump beside it still qualifies. Anything ambiguous is left
-- null and simply keeps counting as nothing, which is what it does today.
--
-- Idempotent: it only fills nulls, so a re-run changes nothing.
update orders o
   set host_offer_id = pick.offer_id
  from (
    select i.order_id, i.offer_id
      from order_items i
     where i.kind = 'oto'
       and i.offer_id is not null
       and not exists (
             select 1 from order_items p
              where p.order_id = i.order_id and p.kind = 'product'
           )
       and (
             select count(*) from order_items x
              where x.order_id = i.order_id and x.kind = 'oto'
           ) = 1
  ) as pick
 where o.id = pick.order_id
   and o.host_offer_id is null;
