-- Two callers can now book the same charge as two orders.
--
-- Round 1 made the Stripe webhook a second caller of completeOfferCheckout,
-- so a buyer who closes the tab right after paying still gets what they
-- bought — correct, but completeOfferCheckout has no atomic claim. Its
-- eligibility re-check (ownershipFor + isOfferEligible) runs at the top,
-- while the ownership grant lands near the very end, so it is a
-- check-then-act that only protects SEQUENTIAL re-entry. Stripe dispatches
-- the browser redirect and the webhook independently, so the two can
-- genuinely race, and each `.insert()`s its own `orders` row for the one
-- real charge: no double charge (Stripe confirms once) and no duplicate
-- access (grantOfferOwnership already tolerates 23505) — but duplicate
-- revenue and duplicate receipts.
--
-- Mirrors orders_setup_intent_idx (0055): a partial unique index is the
-- atomic claim completeOfferCheckout's insert races on — see
-- lib/offer-checkout.ts, which re-reads the loser's row on a 23505 instead
-- of minting a second one. Only the paid, one-time path ever sets this
-- column (a recurring/setup order never does — see the comment beside the
-- insert in completeOfferCheckout, which deliberately leaves it null to
-- avoid colliding with itself on a retry), so only that path is protected
-- here; nulls stay unconstrained, same as 0055.
--
-- Applies cleanly against production: 5 orders currently carry a
-- payment-intent id and none of them collide.
create unique index if not exists orders_payment_intent_idx
  on orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
