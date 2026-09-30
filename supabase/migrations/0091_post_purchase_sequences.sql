-- supabase/migrations/0091_post_purchase_sequences.sql
--
-- Post-purchase email sequences, per offer and per product.
-- Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
--
-- Sent in addition to the store's welcome email. Off until an admin turns a
-- sequence on. Email 1 goes a minute after the checkout is over; each later
-- email waits its delay after the one before it was sent.

create table if not exists post_purchase_sequences (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  owner_type  text not null check (owner_type in ('offer', 'product')),
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

create table if not exists post_purchase_sends (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  order_item_id  uuid not null references order_items(id) on delete cascade,
  sequence_id    uuid not null references post_purchase_sequences(id) on delete cascade,
  email_id       uuid references post_purchase_emails(id) on delete set null,
  position       integer not null,  -- the step: 1st, 2nd, 3rd email this line gets
  to_email       text not null,
  due_at         timestamptz not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  reason         text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  -- Queueing the same step twice inserts nothing.
  unique (order_item_id, sequence_id, position)
);

create index if not exists post_purchase_sends_due_idx
  on post_purchase_sends (due_at) where status = 'pending';

alter table order_items add column if not exists post_purchase_stopped_at timestamptz;

-- Service role only. Supabase grants new tables to anon and authenticated by
-- default; 0067 revoked what existed then, not what is created after.
alter table post_purchase_sequences enable row level security;
alter table post_purchase_emails    enable row level security;
alter table post_purchase_sends     enable row level security;
revoke all on post_purchase_sequences, post_purchase_emails, post_purchase_sends from anon, authenticated;
