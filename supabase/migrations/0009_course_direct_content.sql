-- A course can hold its content directly, with no chapters or lessons.
--
-- The simplest product — a single downloadable PDF, one audio file, one embedded
-- video — shouldn't need a curriculum built around it. These columns let the
-- course itself carry the deliverable, mirroring the fields a course_item has.
-- The storefront cover (courses.cover_path) already existed; it just was never
-- collected or shown. A course with no course_items renders straight from here.

alter table courses
  add column attachments jsonb not null default '[]'::jsonb, -- [{path,name,size,mime}], paid-assets bucket
  add column video_embed_url text;                            -- for a simple video course
