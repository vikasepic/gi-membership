-- ---------------------------------------------------------------------------
-- 0087 — watch progress: resuming a long video, and knowing what was opened.
--
-- `progress.position_seconds` has existed since 0001 and nothing has ever
-- written it. Two columns turn it into something the library can use.
--
-- `duration_seconds` is stored beside the position so a percentage can be
-- worked out from our own row. The alternative is asking Vimeo or YouTube
-- again on every render of every card, which is a third-party call on a page
-- behind the paywall to recover a number we were already told once.
--
-- `last_viewed_at` is when the member OPENED the lesson, which is not the
-- same as `updated_at` (that moves whenever any field is written, including a
-- position save seconds later). "Continue where you left off" and the admin
-- activity column both mean opened, so they get a column that means opened.
--
-- The two CHECKs are deliberate and invisible to tsc, vitest and `next build`:
-- a feature can be green everywhere and still unable to save. A negative
-- position or a zero duration is a bug in the player bridge, and it should
-- fail at the write rather than render as a resume prompt pointing at -3
-- seconds or a bar dividing by zero.
-- ---------------------------------------------------------------------------

alter table progress
  add column if not exists duration_seconds integer,
  add column if not exists last_viewed_at   timestamptz;

alter table progress
  drop constraint if exists progress_position_sane;
alter table progress
  add constraint progress_position_sane
  check (position_seconds is null or position_seconds >= 0);

alter table progress
  drop constraint if exists progress_duration_sane;
alter table progress
  add constraint progress_duration_sane
  check (duration_seconds is null or duration_seconds > 0);

-- Serves both "what did this member open last" (the library's continue box)
-- and the admin's last-activity column. Descending because every reader wants
-- the newest row and nobody pages backwards through it.
create index if not exists progress_recent_idx
  on progress (user_id, last_viewed_at desc nulls last);

comment on column progress.duration_seconds is
  'Length of the lesson''s video in whole seconds, as the player reported it. Null until a video lesson has been played once.';
comment on column progress.last_viewed_at is
  'When the member last OPENED this lesson. Distinct from updated_at, which also moves on a position save.';
