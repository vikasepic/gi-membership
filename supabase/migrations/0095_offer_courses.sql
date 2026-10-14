-- Offers grant courses directly (docs/superpowers/specs/2026-10-14-offer-courses-design.md).
--
-- Until now a course was reached only through a product (product_courses).
-- An offer can now name courses of its own, alongside a product or an app,
-- or as all it gives ("course" grant type).

create table offer_courses (
  offer_id   uuid not null references offers(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (offer_id, course_id)
);
create index offer_courses_course_idx on offer_courses (course_id);

alter table offers drop constraint offers_grant_type_check;
alter table offers add constraint offers_grant_type_check
  check (grant_type in ('product', 'subscription', 'course'));

-- A courses-only offer grants neither a product nor an app; its ownership row
-- names the offer alone. Refunds already cancel rows by offer_id.
alter table ownership drop constraint ownership_check;
alter table ownership add constraint ownership_check
  check (product_id is not null or app_id is not null or offer_id is not null);

-- One such row per member and offer, so a re-purchase revives it.
create unique index ownership_user_offer_courses_uq
  on ownership (store_id, user_id, offer_id)
  where product_id is null and app_id is null;

notify pgrst, 'reload schema';
