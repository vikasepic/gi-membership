-- One session per purchase, for an offer bought by a stranger.
--
-- An offer checkout can be reached by anybody now, so it creates accounts the
-- same way the product checkout does — and a buyer who has just signed up has
-- no password. The product path signs them in on the way back from Stripe and
-- guards that with orders.session_granted_at, so the return URL cannot be
-- replayed into a second session by anybody who gets hold of it.
--
-- Offers grant through `ownership` and never touch `orders`, so they had no
-- such guard because they had no such need — until now.
alter table ownership add column if not exists session_granted_at timestamptz;

comment on column ownership.session_granted_at is
  'When a post-purchase session was handed out for this grant. Set once; the compare-and-set on it is what stops a return URL minting a second session.';

notify pgrst, 'reload schema';
