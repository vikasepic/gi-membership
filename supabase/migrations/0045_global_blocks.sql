-- Which kind of saved design a row is.
--
-- A template is a copy taken once: inserting it drops blocks the page then
-- owns. A global block stays linked: the page stores a pointer, and editing
-- the design changes every page pointing at it.
--
-- One column rather than a second table, because the row is the same shape
-- either way — a name, a group, an array of Block, and the band it was drawn
-- on. Two near-identical tables would be two readers and two places for a bug
-- to hide. The separation people actually need is on screen, and that is where
-- it is: two shelves.
--
-- Everything already saved is a template, which is what the default says.

alter table templates
  add column if not exists kind text not null default 'template';

alter table templates
  drop constraint if exists templates_kind_check;

-- A kind nothing understands would render as neither, so it is refused at the
-- door rather than discovered by a page.
alter table templates
  add constraint templates_kind_check check (kind in ('template', 'global'));

comment on column templates.kind is
  'template = inserting drops a copy; global = inserting drops a link, and editing changes every page that points at it.';

create index if not exists templates_kind_idx on templates (store_id, kind, name);
