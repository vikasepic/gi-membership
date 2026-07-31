-- Somewhere for failures to go.
--
-- Every outbound side effect in this store is deliberately best-effort: they
-- run after the card has been charged, so an ActiveCampaign outage or a
-- connected app being down must never fail a paid order. The cost of that
-- decision was total silence — a failure reached console.error in a container
-- nobody reads, and the first symptom was a customer saying they never got
-- access.
--
-- This is the log AND the retry queue, deliberately one table. A separate
-- queue would mean a failure could be retried but not visible, or visible but
-- not retryable, and reconciling the two is more work than either.

create table if not exists error_events (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references stores(id) on delete cascade,

  -- Where it came from, e.g. 'activecampaign', 'app_entitlement', 'webhook'.
  source           text not null,
  message          text not null,
  -- Anything useful for reading it later: order id, email, status code.
  context          jsonb not null default '{}'::jsonb,

  -- Set only when the work can be replayed. A null job_kind is a log line;
  -- a non-null one is a queue item. The dispatcher in lib/retry.ts maps the
  -- kind to the function that performs it.
  job_kind         text,
  job_payload      jsonb,

  attempts         int not null default 0,
  next_attempt_at  timestamptz,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- The retry sweep's query: due, unresolved, replayable.
create index if not exists error_events_due_idx
  on error_events (next_attempt_at)
  where resolved_at is null and job_kind is not null;

-- The admin list: newest unresolved first.
create index if not exists error_events_unresolved_idx
  on error_events (store_id, created_at desc)
  where resolved_at is null;
