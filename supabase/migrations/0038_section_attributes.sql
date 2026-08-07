-- A section you can point at from CSS or from a link.
--
-- Blocks have had `cssId` and `cssClass` since the builder existed; a section
-- had neither. So the one thing on a sales page you most want to link to —
-- "#pricing" in a button, in an email, in an ad — was the one thing with no
-- name, and page-level custom CSS had no way to reach a whole band.
--
-- Two text columns rather than a jsonb blob: they are two strings, they are
-- queryable, and a column called css_id says what it is without anyone opening
-- a document.

alter table page_sections
  add column if not exists css_id text,
  add column if not exists css_class text;

comment on column page_sections.css_id is
  'Optional DOM id for this band, so #it can be linked to. Sanitised on write.';
comment on column page_sections.css_class is
  'Optional class list for this band, for page-level custom CSS. Sanitised on write.';
