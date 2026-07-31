-- One-time auto sign-in after a successful purchase.
--
-- A first-time buyer has an account they never chose a password for, so without
-- this they finish paying and are immediately asked to go and find an email
-- before they can open the thing they just bought.
--
-- The session is minted on the Stripe return URL, which carries the
-- PaymentIntent client secret — proof that this browser is the one that
-- completed the payment. That proof does not expire on its own, so consumption
-- is recorded here: a thank-you URL pasted into a chat later must not hand the
-- buyer's account to whoever opens it.

alter table orders
  add column if not exists session_granted_at timestamptz;

comment on column orders.session_granted_at is
  'When the post-purchase session was minted. Set once; a second attempt is refused.';
