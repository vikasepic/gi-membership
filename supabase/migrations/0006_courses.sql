-- Split content from commerce.
--
-- Until now a "course" WAS a product: chapters hung off products, pricing and
-- content lived on one row, and products.type was a label that changed nothing.
-- That made two things impossible: selling one course through several products,
-- and selling a bundle that grants several courses.
--
-- After this migration:
--   courses          = content (chapters, lessons, vocabulary)
--   products         = the sellable thing (price, offers)
--   product_courses  = many-to-many, so a bundle grants several courses and a
--                      course can be sold through several products
-- A product may still deliver a single file directly and grant no courses at
-- all — simple one-file sales stay simple.

create table courses (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  slug          text not null,
  title         text not null,
  subtitle      text,
  description   text,
  cover_path    text,                                  -- public bucket
  chapter_label text not null default 'Chapter',       -- per-course vocabulary
  lesson_label  text not null default 'Lesson',
  status        text not null default 'draft' check (status in ('draft','published')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, slug)
);
create trigger courses_updated before update on courses
  for each row execute function set_updated_at();

create table product_courses (
  product_id uuid not null references products(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, course_id)
);
create index product_courses_course_idx on product_courses (course_id);

-- Course items move from products to courses.
alter table course_items add column course_id uuid references courses(id) on delete cascade;

-- Carry existing content across: one course per product that has items, keeping
-- that product's title and vocabulary, and linking it back to the product so
-- nobody loses access to something they already bought.
insert into courses (store_id, slug, title, description, chapter_label, lesson_label, status)
select distinct p.store_id, p.slug, p.title, p.description, p.chapter_label, p.lesson_label,
       case when p.status = 'published' then 'published' else 'draft' end
from products p
where exists (select 1 from course_items ci where ci.product_id = p.id)
on conflict (store_id, slug) do nothing;

insert into product_courses (product_id, course_id)
select p.id, c.id
from products p
join courses c on c.store_id = p.store_id and c.slug = p.slug
where exists (select 1 from course_items ci where ci.product_id = p.id)
on conflict do nothing;

update course_items ci
set course_id = pc.course_id
from product_courses pc
where pc.product_id = ci.product_id and ci.course_id is null;

-- Anything that somehow has no course now would be unreachable content.
delete from course_items where course_id is null;

alter table course_items
  alter column course_id set not null,
  drop column product_id;

-- Per-lesson media type. This is what makes the type meaningful: the editor
-- shows only the fields a lesson of that type needs, and one course can mix a
-- video lesson with an audio meditation and a PDF worksheet.
alter table course_items
  add column item_type text not null default 'text'
    check (item_type in ('video','audio','pdf','text'));

-- Vocabulary now belongs to the course, not the product.
alter table products drop column chapter_label, drop column lesson_label;

-- Progress follows content, so it is scoped by course. product_id becomes
-- nullable: legacy product-level rows stay readable, new rows are per course.
alter table progress
  add column course_id uuid references courses(id) on delete cascade,
  alter column product_id drop not null;

update progress pr
set course_id = ci.course_id
from course_items ci
where ci.id = pr.lesson_id and pr.course_id is null;

create index progress_course_idx on progress (user_id, course_id);

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
