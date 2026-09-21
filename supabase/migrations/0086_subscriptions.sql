-- Subscriptions, as billing facts.
--
-- `ownership` says who may open what; it holds a Stripe subscription id and a
-- status and nothing else. The questions an owner asks — when does this trial
-- end, when does this renew, has it cancelled at period end, how many times
-- has it paid and how much — all lived in Stripe alone. One row per Stripe
-- subscription, written by the webhook on every subscription and invoice
-- event, backfilled once from Stripe, reconciled by cron. Stripe is the truth;
-- this is the copy the admin reads without a network round trip per row.

create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  store_id               uuid not null references stores(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id     text,
  user_id                uuid references users(id) on delete set null,
  offer_id               uuid references offers(id) on delete set null,
  product_id             uuid references products(id) on delete set null,
  -- Stripe's own status word: trialing, active, past_due, canceled, unpaid,
  -- incomplete, incomplete_expired, paused.
  status                 text not null,
  amount_cents           integer not null default 0,
  currency               text not null default 'usd',
  interval               text,
  interval_count         integer,
  installments           integer,
  trial_start            timestamptz,
  trial_end              timestamptz,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  ended_at               timestamptz,
  -- Counted from Stripe's paid invoices with money on them, so a $0 trial
  -- invoice is not a payment.
  paid_invoices          integer not null default 0,
  paid_total_cents       integer not null default 0,
  first_paid_at          timestamptz,
  last_paid_at           timestamptz,
  livemode               boolean not null default true,
  started_at             timestamptz not null,
  synced_at              timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on subscriptions (user_id);
create index if not exists subscriptions_status_idx on subscriptions (store_id, status);
create index if not exists subscriptions_next_idx on subscriptions (current_period_end);

comment on table subscriptions is
  'One row per Stripe subscription: the dates and paid totals the admin reads. Written by the webhook, backfilled from Stripe, reconciled by cron. ownership stays the access record.';
comment on column subscriptions.paid_invoices is
  'Paid invoices with amount_paid > 0. A trial''s $0 invoice does not count.';

-- The admin reads with the service key; nothing public touches this table.
alter table subscriptions enable row level security;

notify pgrst, 'reload schema';
