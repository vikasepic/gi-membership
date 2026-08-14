-- What a sales page looks like in a search result and a pasted link.
--
-- Until now it looked like the STORE. Neither /p/[slug] nor /o/[key] exported
-- any metadata of its own, so every product page and every offer page in the
-- shop shared one title, one description and one share card — the store's. Two
-- products pasted into the same WhatsApp thread were indistinguishable, and a
-- search result for a course said the name of the shop.
--
-- Here rather than on `products` and `offers` for the reason 0029 gave when it
-- created this table: a sales page hangs off either, so two nullable foreign
-- keys would be wrong the same way twice. The page's own row already exists.
--
-- All three default to empty and empty means "work it out" — the product's
-- title, its tagline, its cover, and the store's defaults beneath those. So
-- nothing changes for a page nobody has filled in, and there is no state where
-- a link previews as blank because a field was added.

alter table page_settings
  add column if not exists meta_title text not null default '',
  add column if not exists meta_description text not null default '',
  add column if not exists share_image_path text not null default '';

comment on column page_settings.meta_title is
  'The <title> and og:title for this page. Empty falls back to the product or '
  'offer name, then to the store default. See lib/page-metadata.ts.';

comment on column page_settings.share_image_path is
  'Storage path of the 1200x630 card behind a shared link. Empty falls back to '
  'the page''s cover image, then the store''s share image.';
