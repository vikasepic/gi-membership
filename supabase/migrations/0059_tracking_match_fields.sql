-- What Meta needs to match a conversion to the person who clicked the ad.
--
-- The server has been sending a hashed email and nothing else. Every other
-- field Meta leans on for attribution — the buyer's IP, their user agent, the
-- page they converted on — was declared on the event type and passed as
-- undefined by all three call sites, so match quality was as low as it can be
-- while still technically reporting a conversion.
--
-- Stored on the ORDER rather than read at send time, because finalizeOrder is
-- reached two ways: from the buyer's own request on the thank-you page, and
-- from Stripe's webhook, where the only IP available belongs to Stripe. An
-- event enriched with the payment processor's address is worse than one with
-- none — it is a confident wrong answer. Captured once, at checkout, from the
-- request that actually belonged to the buyer.
--
-- Only ever written when tracking_consent is true; the columns stay null for
-- everybody else, which is the same rule the visitors table already follows.
alter table orders add column if not exists client_ip text;
alter table orders add column if not exists client_user_agent text;
alter table orders add column if not exists source_url text;

comment on column orders.client_ip is
  'Buyer IP at checkout, for ad-platform match quality. Written only with tracking consent.';
comment on column orders.client_user_agent is
  'Buyer user agent at checkout. Written only with tracking consent.';
comment on column orders.source_url is
  'The page the checkout happened on, sent as event_source_url. Written only with tracking consent.';

notify pgrst, 'reload schema';
