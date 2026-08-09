-- Who has what open, right now.
--
-- Two admins editing the same section is not rare once more than one person
-- works on a page: the second save simply overwrites the first, and neither
-- person ever finds out. The save itself is guarded separately by comparing
-- `updated_at` — that is what actually prevents the loss. This table is the
-- other half: it lets the editor say "Keya has this open" BEFORE the work is
-- done, which is the only moment a warning is any use.
--
-- Deliberately not a lock. A lock left behind by a closed laptop is worse than
-- an overwrite, because nobody can clear it. A row here goes stale on its own:
-- anything not touched inside a minute is treated as gone.

create table if not exists editing_presence (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,

  -- Free text rather than an FK: a "resource" here is a section, a settings
  -- group or a whole page, and those live in different tables. Nothing joins
  -- on it — it is only ever compared to the string the editor sends.
  resource    text not null,
  resource_id text not null,

  user_id     uuid not null references users(id) on delete cascade,

  -- Bumped by the heartbeat. Staleness is read from this, so there is nothing
  -- to clean up when a browser disappears.
  seen_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  -- One row per person per thing: the target of the heartbeat's upsert.
  unique (resource, resource_id, user_id)
);

-- The only read: everyone on this resource, recently.
create index if not exists editing_presence_resource_idx
  on editing_presence (resource, resource_id, seen_at desc);

-- New tables are not granted to the API roles automatically. service_role
-- bypasses RLS but still needs the GRANT, and missing it fails at runtime with
-- a permission error rather than at migration time.
grant select, insert, update, delete on editing_presence to service_role;
