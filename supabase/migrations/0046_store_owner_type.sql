-- The storefront is a page, and the database never agreed.
--
-- `page_sections.owner_type` and `page_settings.owner_type` were written when
-- a page could only belong to a product or an offer, and both carry a CHECK
-- that says so. The home page editor shipped with "store" as a third owner in
-- TypeScript and no migration behind it, so every save from /admin/home failed
-- on the constraint — the editor looked complete and could not write a row.
--
-- Widening rather than dropping: the check is worth keeping. It is what stops a
-- typo becoming an owner_type nothing reads, and rows nobody can find again.

alter table page_sections
  drop constraint if exists page_sections_owner_type_check;

alter table page_sections
  add constraint page_sections_owner_type_check
  check (owner_type in ('product', 'offer', 'store'));

alter table page_settings
  drop constraint if exists page_settings_owner_type_check;

-- page_settings gets it too. The home page editor deliberately shows no custom
-- CSS/JS panel today — Site settings → Advanced already covers every page — but
-- leaving the two tables disagreeing about what an owner is would make the
-- first person to add that panel debug this same failure a second time.
alter table page_settings
  add constraint page_settings_owner_type_check
  check (owner_type in ('product', 'offer', 'store'));

comment on column page_sections.owner_type is
  'product | offer | store. "store" is the storefront''s own home page, one row '
  'set per band, keyed by the store id. See lib/pages.ts sectionsFor().';
