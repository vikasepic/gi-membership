-- The ten-section sales page.
--
-- Ajit's structure, shared by the store sales page and the upsell page so there
-- is one argument and one editor rather than two systems that drift apart.
--
-- One ROW PER SECTION rather than a jsonb blob on the owner. That is what makes
-- "save just this section" honest: saving section 4 writes one row and cannot
-- overwrite an edit someone made to section 9 a moment earlier. A blob would
-- lose that write silently, which is the worst way to lose copy.

create table if not exists page_sections (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,

  -- Polymorphic on purpose: a sales page hangs off a product or an offer, and
  -- both render through the same components. Two nullable FKs would allow a row
  -- that belongs to neither or both.
  owner_type  text not null check (owner_type in ('product', 'offer')),
  owner_id    uuid not null,

  section_key text not null,
  position    integer not null default 0,
  enabled     boolean not null default true,

  -- Presentation. `style` names a preset in lib/page-sections.ts; presets pair
  -- a ground with its text colour, because a band carries paragraphs and the
  -- two have to move together. `accent` is a free hex for the small marks.
  style       text not null default 'paper',
  accent      text,
  variant     text,

  content     jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One row per section per page: the target of the per-section upsert.
  unique (owner_type, owner_id, section_key)
);

create trigger page_sections_updated before update on page_sections
  for each row execute function set_updated_at();

create index if not exists page_sections_owner_idx
  on page_sections (owner_type, owner_id, position);

-- New tables are not granted to the API roles automatically here; service_role
-- bypasses RLS but still needs the GRANT. Missing this fails at runtime with a
-- permission error rather than at migration time.
grant select, insert, update, delete on page_sections to service_role;
