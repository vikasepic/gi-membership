-- Course content: chapters + lessons as one self-referencing tree.
-- parent_id null = chapter; parent_id set = lesson under that chapter.
-- A chapter may carry its own content when it has no children.

-- Rename the empty lessons table. Postgres carries FKs (progress.lesson_id)
-- through a rename automatically.
alter table lessons rename to course_items;

-- Superseded by video_embed_url + attachments.
alter table course_items
  drop column media_mode,
  drop column media_path,
  drop column media_embed_url;

alter table course_items
  add column parent_id uuid references course_items(id) on delete cascade,
  add column subtitle text,
  add column body_html text,
  add column video_embed_url text,
  add column cover_path text,
  add column attachments jsonb not null default '[]'::jsonb,
  add column is_published boolean not null default false;

-- Depth cap: a lesson's parent must itself be a chapter (parent_id null),
-- so nesting can never exceed two levels.
create or replace function course_items_depth_guard()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'course_items: an item cannot be its own parent';
    end if;
    if exists (select 1 from course_items p
               where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'course_items: nesting deeper than chapter > lesson is not allowed';
    end if;
  end if;
  return new;
end;
$$;

create trigger course_items_depth before insert or update on course_items
  for each row execute function course_items_depth_guard();

-- Sibling ordering: two items cannot claim one position. Chapters
-- (parent_id null) need a separate partial index since null <> null.
create unique index course_items_chapter_order_uq
  on course_items (product_id, sort_order) where parent_id is null;
create unique index course_items_lesson_order_uq
  on course_items (parent_id, sort_order) where parent_id is not null;

create index course_items_parent_idx on course_items (parent_id, sort_order);

-- Per-course vocabulary + a course product type.
alter table products
  add column chapter_label text not null default 'Chapter',
  add column lesson_label  text not null default 'Lesson';

alter table products drop constraint products_type_check;
alter table products add constraint products_type_check
  check (type in ('pdf','audio','video','app','course'));

-- Per-item progress: how it completed, and whether the student took manual
-- control (after which auto-signals must never touch the row).
alter table progress
  add column completed_source text
    check (completed_source in ('manual','video','download','dwell')),
  add column manual_override boolean not null default false;

-- Public bucket for covers/thumbnails (marketing imagery shown pre-purchase).
-- Paid assets stay in the private 'paid-assets' bucket.
insert into storage.buckets (id, name, public)
values ('public-media', 'public-media', true)
on conflict (id) do nothing;

-- Same grants pattern as 0002 for the renamed/new objects.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
