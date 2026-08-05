-- Three tags that tell a trial apart from a sale.
--
-- The existing activecampaign_tag_id says "has access right now": applied on
-- grant, removed on revoke. That cannot answer the question Ajit actually asks
-- of the list — who tried it and never paid, versus who paid and then left —
-- because once access is taken back, both look identical.
--
--   trial     added when the trial starts, REMOVED when the first payment
--             lands. Someone who cancels inside the trial keeps it, and that
--             is the whole point: it is the only record that they were here.
--   buyer     added the first time money is actually taken, and removed again
--             at cancellation — so a cancelled contact carrying no trial tag
--             can only be someone who paid.
--   cancelled added when access ends, and never removed.
--
-- Which makes each segment one condition:
--   cancelled AND trial       tried it, never paid
--   cancelled AND NOT trial   paid, then left
--
-- The cancelled tag stays even if they come back, which is safe only because
-- the access tag carries the current state: cancelled AND NOT access is
-- churned; cancelled AND access came back. A win-back campaign built on the
-- cancelled tag alone would email paying customers.

alter table offers
  add column if not exists activecampaign_trial_tag_id     text,
  add column if not exists activecampaign_buyer_tag_id     text,
  add column if not exists activecampaign_cancelled_tag_id text;

comment on column offers.activecampaign_trial_tag_id is
  'Applied when the trial starts, removed on the first payment. Survives a cancellation inside the trial. Only meaningful when trial_days > 0.';
comment on column offers.activecampaign_buyer_tag_id is
  'Applied the first time money is taken, and removed at cancellation so that cancelled-without-a-trial-tag identifies a former payer.';
comment on column offers.activecampaign_cancelled_tag_id is
  'Applied when access ends. Never removed, so it is a history of churn rather than a current state.';
