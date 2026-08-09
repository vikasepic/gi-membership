-- Typefaces the store can use.
--
-- One row per family, whether it came from Google or was uploaded. Google
-- families are DOWNLOADED at the moment they are chosen and served from our own
-- bucket, so by the time anything renders there is no difference between the
-- two sources — one table, one @font-face writer, one code path.
--
-- Self-hosted rather than linked on purpose. A <link> to fonts.googleapis.com
-- hands every visitor's IP and user-agent to Google before the consent banner
-- has said a word, which would make the privacy page — which enumerates its
-- processors and states they were checked against the code — untrue. It is also
-- faster: no second origin to resolve and shake hands with.

create table if not exists fonts (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references stores(id) on delete cascade,

  -- The CSS family name, exactly as it will be written into font-family.
  family     text not null,
  source     text not null check (source in ('google', 'custom')),

  -- [{ weight, style, path, format }] — one entry per file in the bucket.
  -- A JSON array rather than a child table: a family's files are never queried
  -- apart from the family, and there is nothing to join them to.
  files      jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Installing the same family twice is an update, not a second row.
  unique (store_id, family)
);

create trigger fonts_updated before update on fonts
  for each row execute function set_updated_at();

grant select, insert, update, delete on fonts to service_role;
