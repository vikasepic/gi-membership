-- Designs the owner saves, so a design is built once and reused.
--
-- The built-ins live in code — version controlled, reviewable in a diff,
-- impossible to lose to a bad migration. This table is the other half: a
-- design somebody assembles in the builder and keeps. Same shape either way,
-- an array of Block, so `listTemplates` can hand the popup one list and the
-- popup never learns the difference.
--
-- Store-scoped, because a template is a design this store uses; nothing here
-- is shared between stores.
--
-- `blocks` is jsonb and untrusted like every other jsonb on this page: it is
-- sanitized on the way in and normalized on the way out, exactly as
-- page_sections.content is. A row written by hand is a row the reader has to
-- survive.
--
-- `band` holds the colour, width and air the design was drawn on — the same
-- shape page_sections.layout uses plus the preset and its colour. Null means
-- the design takes whatever band it is dropped onto, which is what a generic
-- block group wants.

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  name text not null,
  -- What it files under in the library. Free text: the groups are whatever the
  -- owner has actually made, not a list somebody has to maintain in code.
  "group" text not null default 'Saved',
  blocks jsonb not null default '[]'::jsonb,
  band jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_store_idx on templates (store_id, "group", name);

comment on table templates is
  'Designs saved from the builder. Same shape as a built-in: an array of Block, '
  'plus the band it was drawn on. Sanitized in, normalized out.';

-- Touched on every write, so the library can show what changed most recently
-- and a concurrent save can be spotted the way page_sections does it.
create or replace function templates_touch() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists templates_touch on templates;
create trigger templates_touch before update on templates
  for each row execute function templates_touch();
