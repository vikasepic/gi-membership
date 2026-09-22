-- ---------------------------------------------------------------------------
-- 0088 — the trial reminder moves to one day out, and remembers it was sent.
--
-- Until now the only reminder was Stripe's `customer.subscription.trial_will_end`,
-- which fires a fixed three days before the trial ends and cannot be moved.
-- Measured on 22 Sep 2026 across twenty live events: every one landed at
-- exactly 3.00 days. The owner wants one day, so the send becomes ours and the
-- Stripe event stops producing mail.
--
-- A sweep that runs on a schedule needs to know what it has already done. The
-- column is that memory: a reminder is sent once per subscription and never
-- again, whatever the sweep's window happens to catch on a later pass.
--
-- Nullable with no default on purpose. Backfilling a value here would mark
-- every existing trial as already reminded, which is the opposite of what a
-- new reminder is for.
-- ---------------------------------------------------------------------------

alter table subscriptions
  add column if not exists trial_reminder_sent_at timestamptz;

-- The sweep's own query: trials that are still running, ordered by how soon
-- they end. Partial, because a reminder already sent is the majority of the
-- table over time and never needs looking at again.
create index if not exists subscriptions_trial_reminder_idx
  on subscriptions (trial_end)
  where trial_reminder_sent_at is null and trial_end is not null;

comment on column subscriptions.trial_reminder_sent_at is
  'When this store sent the one-day trial reminder. Null means unsent; it is never cleared, so a member is reminded at most once per subscription.';
