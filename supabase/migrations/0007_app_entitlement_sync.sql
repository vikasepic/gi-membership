-- Two-way entitlement sync between the store and connected apps.
--
-- Until now access could only originate in the store, and the store only ever
-- told an app when access STARTED. Two holes fell out of that:
--
--   1. Cancellations, refunds and dunning updated ownership here and told the
--      app nothing, so a cancelled customer kept app access indefinitely.
--   2. Someone who subscribed directly inside an app was invisible here, so the
--      store would offer them the same subscription again — breaking the rule
--      that an offer is never shown to someone who already has what it grants.

-- (1) An entitlement can now originate in the app itself.
alter table ownership drop constraint if exists ownership_source_check;
alter table ownership
  add constraint ownership_source_check
  check (source in ('purchase','bump','oto','grant','app'));

-- (2) An app may report a subscriber the store has never seen — someone who
-- signed up in the app and has no store account yet. ownership.user_id is NOT
-- NULL and must stay that way, so park those by email until an account exists,
-- then drain them on account creation.
create table if not exists pending_app_entitlements (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  app_id          uuid not null references apps(id) on delete cascade,
  email           text not null,                 -- lowercased, the shared identifier
  entitlement_key text,
  status          text not null default 'active'
                    check (status in ('active','trialing','canceled','past_due')),
  stripe_subscription_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One row per app per email: a repeated report overwrites rather than piles up.
  unique (store_id, app_id, email)
);

create index if not exists pending_app_entitlements_email_idx
  on pending_app_entitlements (store_id, email);

grant select, insert, update, delete on pending_app_entitlements to service_role;
