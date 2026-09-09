-- Tables for the two built-in apps.
--
-- Micro-Product Builder keeps a coaching session, its transcript and the
-- documents built from it. The Viral Hook Generator keeps a history of what
-- each member generated. Nothing about access lives here: whether a member
-- may use an app is the ownership row for that app, read by the app's own
-- pages through lib/builtin-apps/access.ts.
--
-- Same conventions as every other table: store_id on every row, user_id to
-- the store's users table, row-level security on with no policies, and only
-- the service role granted. The anon and authenticated roles were stripped of
-- default privileges in 0067, so the grants below are the whole access story.

-- Micro-Product Builder --------------------------------------------------

create table if not exists pb_sessions (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  title       text not null default 'New session',
  -- The coaching step the session is in. READY means the shape is locked and
  -- a build may run; STOP means the coach ended it (no true case to build on).
  stage       text not null default 'NARROW'
                check (stage in ('NARROW','REPLAY','NAME','PROVE','EQUIP','GATE','READY','STOP')),
  -- Quick mode: about six answers to the gate, guesses marked for later.
  quick       boolean not null default false,
  -- The product taking shape, one section per step, extracted from the
  -- transcript by a model call. Null until the first step locks.
  shape       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pb_sessions_user_idx on pb_sessions (user_id, updated_at desc);
create trigger pb_sessions_updated before update on pb_sessions
  for each row execute function set_updated_at();

create table if not exists pb_messages (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  session_id  uuid not null references pb_sessions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  -- A skip is a user turn the member did not type: the Skip button pressed.
  -- Kept apart so the transcript can show it as such and the pace counter
  -- does not count it as an answer.
  kind        text not null default 'chat' check (kind in ('chat','skip')),
  content     text not null,
  -- The step this turn belonged to, for the pace counter.
  stage       text,
  created_at  timestamptz not null default now()
);
create index if not exists pb_messages_session_idx on pb_messages (session_id, created_at);

create table if not exists pb_documents (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  session_id  uuid not null references pb_sessions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('guide','pack')),
  title       text not null,
  content     text not null,
  model       text,
  -- The build hit the output limit even after continuing; the document is
  -- incomplete and the reader says so.
  truncated   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists pb_documents_session_idx on pb_documents (session_id, created_at desc);

-- Viral Hook Generator ---------------------------------------------------

create table if not exists hook_generations (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  post_idea   text not null,
  niche       text,
  audience    text,
  format      text not null default 'carousel' check (format in ('carousel','reel')),
  tone        text,
  hooks       jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists hook_generations_user_idx on hook_generations (user_id, created_at desc);

-- Locked to the service role, like everything else in this schema.
alter table pb_sessions      enable row level security;
alter table pb_messages      enable row level security;
alter table pb_documents     enable row level security;
alter table hook_generations enable row level security;

grant select, insert, update, delete on pb_sessions      to service_role;
grant select, insert, update, delete on pb_messages      to service_role;
grant select, insert, update, delete on pb_documents     to service_role;
grant select, insert, update, delete on hook_generations to service_role;
