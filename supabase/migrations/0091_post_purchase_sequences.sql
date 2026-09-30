-- supabase/migrations/0091_post_purchase_sequences.sql
--
-- Post-purchase email sequences: the store series (sent after the welcome
-- email), and one per offer and per product.
-- Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
--
-- A flow is one buyer (their order email, lower-cased) on one sequence. Sends
-- hang off the flow. "Stop these emails" pauses every flow for that buyer;
-- their next purchase resumes them. Off until an admin turns a sequence on.

create table if not exists post_purchase_sequences (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  owner_type  text not null check (owner_type in ('store', 'offer', 'product')),
  -- The store's own id for the store series.
  owner_id    uuid not null,
  enabled     boolean not null default false,
  layout      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (store_id, owner_type, owner_id)
);

create table if not exists post_purchase_emails (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references post_purchase_sequences(id) on delete cascade,
  position     integer not null check (position >= 1),
  delay_amount integer not null default 0 check (delay_amount >= 0 and delay_amount <= 365),
  delay_unit   text not null default 'days' check (delay_unit in ('hours', 'days')),
  subject      text not null default '' check (char_length(subject) <= 200),
  preheader    text not null default '' check (char_length(preheader) <= 200),
  doc          jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  -- Deferred so a save can renumber every email in one statement.
  constraint post_purchase_emails_position_key unique (sequence_id, position) deferrable initially deferred
);

create table if not exists post_purchase_flows (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  sequence_id  uuid not null references post_purchase_sequences(id) on delete cascade,
  -- The buyer: their order email, trimmed and lower-cased.
  email        text not null check (email = lower(btrim(email)) and email <> ''),
  status       text not null default 'running' check (status in ('running', 'paused', 'done')),
  -- Goes up by one when a finished item flow starts again from email 1.
  run          integer not null default 1 check (run >= 1),
  -- The purchase that last started, resumed or restarted it.
  order_id     uuid references orders(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sequence_id, email)
);

create index if not exists post_purchase_flows_buyer_idx on post_purchase_flows (store_id, email);

create table if not exists post_purchase_sends (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  flow_id      uuid not null references post_purchase_flows(id) on delete cascade,
  run          integer not null,
  sequence_id  uuid not null references post_purchase_sequences(id) on delete cascade,
  email_id     uuid references post_purchase_emails(id) on delete set null,
  -- The step within the run: 1st, 2nd, 3rd row queued, sent or skipped.
  position     integer not null check (position >= 1),
  to_email     text not null,
  due_at       timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  reason       text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  -- Queueing the same step twice inserts nothing.
  unique (flow_id, run, position)
);

create index if not exists post_purchase_sends_due_idx
  on post_purchase_sends (due_at) where status = 'pending';

-- Set on each purchase line once it has been processed for flows. Per line,
-- not per order: an order can be paid before its lines are written (the
-- webhook race in completeOfferCheckout), and a bump or upsell line can
-- arrive after the host line, so the re-queue sweep looks for lines not yet
-- processed.
alter table order_items add column if not exists post_purchase_flows_at timestamptz;

-- Service role only. Supabase grants new tables to anon and authenticated by
-- default; 0067 revoked what existed then, not what is created after.
alter table post_purchase_sequences enable row level security;
alter table post_purchase_emails    enable row level security;
alter table post_purchase_flows     enable row level security;
alter table post_purchase_sends     enable row level security;
revoke all on post_purchase_sequences, post_purchase_emails, post_purchase_flows, post_purchase_sends from anon, authenticated;

notify pgrst, 'reload schema';
