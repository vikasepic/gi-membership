-- The offer's tag IS the buyer tag.
--
-- 0031 added a fourth column and called the original one "access". They only
-- ever differ during a trial — granted-and-not-yet-paid — and asking someone to
-- fill in two fields to describe that was how the same id ended up typed into
-- both. Three tags now, and the original column carries the buyer.
--
--   activecampaign_tag_id            buyer: applied the first time money is
--                                    taken, removed at cancellation
--   activecampaign_trial_tag_id      applied when the trial starts, removed
--                                    when they pay, KEPT if they cancel first
--   activecampaign_cancelled_tag_id  applied when access ends, never removed
--
-- Which leaves one condition per segment:
--   cancelled AND trial       tried it, never paid
--   cancelled AND NOT trial   paid, then left
--   buyer                     paying right now
--
-- Behaviour change worth knowing about: on an offer WITH a trial, this tag used
-- to be applied the moment the trial started. It is now applied when the trial
-- converts. Any automation keyed on it for a trial offer moves seven days later
-- — which is the point, since that automation was firing for people who had not
-- paid.

alter table offers drop column if exists activecampaign_buyer_tag_id;

comment on column offers.activecampaign_tag_id is
  'Buyer: applied the first time money is actually taken, removed at cancellation. On a trial offer that is when the trial converts, not when it starts.';
