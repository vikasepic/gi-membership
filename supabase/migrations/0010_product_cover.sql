-- A product can carry its own storefront image.
--
-- Imagery normally belongs to the course, so one upload serves every product
-- selling it — that stays the default. But a product is a marketing surface in
-- its own right: a bundle of three courses has no single "lead" image, and a
-- seasonal or campaign listing often wants its own artwork without touching the
-- content. So the product gets an OPTIONAL override, and falls back to its
-- course when unset.
--
-- Stored as a path into the PUBLIC media bucket, mirroring courses.cover_path.
-- Note the pre-existing cover_image_url column is a different thing: a legacy
-- free-text URL that nothing reads. Left alone rather than overloaded, so the
-- meaning of each column stays unambiguous.

alter table products add column cover_path text;
