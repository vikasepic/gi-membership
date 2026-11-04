-- One person's exception to one course (spec:
-- docs/superpowers/specs/2026-11-04-course-access-tab-design.md).
--
-- `grant`: they have the course with no product or offer behind it.
-- `remove`: they do not have it, whatever they bought. A remove beats every
-- source; coursesForUser (lib/courses.ts) is the one place that reads this.
-- One row per person and course, so a person is never both.

create table course_access (
  store_id   uuid not null references stores(id),
  user_id    uuid not null references users(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  kind       text not null check (kind in ('grant', 'remove')),
  granted_by text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index course_access_course_idx on course_access (course_id);

-- 0067 locked every table, but its default-privileges revoke only covers
-- tables created by the role that ran it. Lock this one by hand.
revoke all on course_access from anon, authenticated;
alter table course_access enable row level security;

notify pgrst, 'reload schema';
