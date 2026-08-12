-- Per-page code snippets, the same shape as the store-wide ones.
--
-- `page_settings` already holds one box of CSS and one of JavaScript for a
-- page. Neither takes a `<script>` tag: the JavaScript box is the INSIDE of a
-- script element, so a tag typed there is not JavaScript, and one box cannot
-- hold three vendors' snippets with a position each.
--
-- Same JSON shape as `stores.settings -> codeSnippets`, read by the same
-- schema and drawn by the same component, so the two cannot drift into meaning
-- different things.

alter table page_settings
  add column if not exists snippets jsonb not null default '[]'::jsonb;

comment on column page_settings.snippets is
  'Code snippets for this page alone: [{name, place, code, on, onCheckout}]. '
  'Same shape as the store-wide list in stores.settings.codeSnippets — see '
  'lib/code-snippets.ts.';
