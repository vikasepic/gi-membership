-- Type belongs to the course, not the product.
--
-- A product is a commercial wrapper — it sets a price and can bundle courses.
-- What the thing actually IS (a video course, a PDF guide) is a property of the
-- content, i.e. the course. Until now the storefront badge came from
-- products.type, which meant the same course bundled two ways could disagree
-- with itself. The course is the single source of truth from here.

alter table courses
  add column type text not null default 'text'
    check (type in ('video','audio','pdf','text'));

-- Backfill from the linked product's type so existing courses keep their badge.
-- app-typed products aren't courses, so they fall through to the 'text' default.
update courses c
set type = case p.type
             when 'video' then 'video'
             when 'audio' then 'audio'
             when 'pdf'   then 'pdf'
             else 'text'
           end
from product_courses pc
join products p on p.id = pc.product_id
where pc.course_id = c.id;

-- products.type is no longer the source of truth and no longer collected in the
-- admin form. Keep the column (some rows still carry a value) but drop NOT NULL
-- so a product can be saved without one; the storefront reads the course.
alter table products alter column type drop not null;
