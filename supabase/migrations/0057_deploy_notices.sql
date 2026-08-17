-- "An update lands in a minute — save your work."
--
-- Admins edit live pages in this store, and a deploy mid-save loses what they
-- were typing: the container swaps underneath them and the save fails with
-- nothing useful to say. A minute of warning is enough to press Save on
-- whatever is open, which is all this needs to buy.
--
-- A table rather than memory, for the obvious reason: the thing being announced
-- is a restart. Anything held in a process is gone at precisely the moment it
-- matters, and more than one container can be serving.
--
-- A table rather than the settings blob, because this is transient. Settings is
-- read on every render of every page and is backed up as configuration; a row
-- that is meaningless four minutes after it is written does not belong in it.

create table if not exists deploy_notices (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  -- When the deploy actually begins. The bar counts down to THIS, not to sixty
  -- seconds from whenever a browser happened to hear about it — a tab that
  -- polls late shows less time and is telling the truth.
  starts_at       timestamptz not null,
  -- Roughly how long the app is expected to be rebuilding. Shown as "come back
  -- in about N minutes", so it is a promise worth keeping conservative.
  back_in_minutes integer not null default 5 check (back_in_minutes between 1 and 60),
  /** Who or what announced it. For the admin log, never shown to anybody. */
  source          text not null default 'api',
  created_at      timestamptz not null default now()
);

-- The only read there is: the newest notice for this store that has not aged
-- out. Descending, because "the latest one" is the whole query.
create index if not exists deploy_notices_recent_idx
  on deploy_notices (store_id, starts_at desc);

comment on table deploy_notices is
  'Short-lived deploy warnings shown to signed-in admins. Written by '
  'POST /api/deploy-notice before a push; read by the admin shell. Rows are '
  'meaningless once starts_at + back_in_minutes has passed and are safe to '
  'delete at any time.';
