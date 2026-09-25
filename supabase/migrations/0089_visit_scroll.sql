-- supabase/migrations/0089_visit_scroll.sql
--
-- How far down a sales page a visit got.
--
-- Asked 25 Sep 2026: 94% of ad visits to the Micro-Product Builder page
-- leave without clicking any buy button, and nothing recorded where they
-- stopped reading. One row per visit and page, kept at the furthest point
-- reached: the deepest <section> whose top came into view (index and its
-- heading), and the scroll depth as a percent of the page. The section
-- headings ride along as an array so the report can name every band, not
-- only the one this visit stopped at.
--
-- No consent gate, same reasoning as visits (0080): a scroll position
-- describes the page, not the person. Retention follows visits by cascade.

create table if not exists visit_scroll (
  store_id     uuid not null references stores(id) on delete cascade,
  visit_id     uuid not null references visits(id) on delete cascade,
  path         text not null,
  -- 0-based index of the deepest section reached. -1 = none seen (should not happen; guards the rollup).
  section      integer not null default -1,
  -- Heading of that section at the time. Pages get edited; the report reads the mode.
  label        text,
  -- Every section's heading in page order, so the report can label bands nobody stopped at.
  labels       jsonb not null default '[]'::jsonb,
  sections     integer not null default 0,
  depth_pct    integer not null default 0 check (depth_pct between 0 and 100),
  updated_at   timestamptz not null default now(),
  primary key (visit_id, path)
);

create index if not exists visit_scroll_store_path_idx on visit_scroll (store_id, path, updated_at desc);
alter table visit_scroll enable row level security;

-- Keep the furthest point, in one statement. Two beacons from the same tab
-- (a 10 s tick and the pagehide) can land out of order.
create or replace function record_scroll(
  p_store uuid, p_visit uuid, p_path text,
  p_section integer, p_label text, p_labels jsonb, p_sections integer, p_depth integer
) returns void
language sql
as $$
  insert into visit_scroll (store_id, visit_id, path, section, label, labels, sections, depth_pct)
  values (p_store, p_visit, p_path, p_section, p_label, coalesce(p_labels, '[]'::jsonb), p_sections, least(100, greatest(0, p_depth)))
  on conflict (visit_id, path) do update
    set section    = greatest(visit_scroll.section, excluded.section),
        label      = case when excluded.section >= visit_scroll.section then excluded.label else visit_scroll.label end,
        labels     = case when jsonb_array_length(excluded.labels) >= jsonb_array_length(visit_scroll.labels) then excluded.labels else visit_scroll.labels end,
        sections   = greatest(visit_scroll.sections, excluded.sections),
        depth_pct  = greatest(visit_scroll.depth_pct, excluded.depth_pct),
        updated_at = now();
$$;

-- Per section of one page: how many visits got at least that far.
-- The label is the most common heading recorded at that index, so an edit
-- to the page mid-window shows the name most visits actually saw.
create or replace function visit_scroll_rollup(p_store uuid, p_path text, p_from timestamptz, p_to timestamptz)
returns table (section integer, label text, reached bigint, visits bigint)
language sql stable
as $$
  with rows as (
    select s.section, s.labels, s.sections
      from visit_scroll s
      join visits v on v.id = s.visit_id
     where s.store_id = p_store and s.path = p_path
       and v.started_at >= p_from and v.started_at < p_to
  ),
  idx as (
    select generate_series(0, coalesce((select max(sections) from rows), 0) - 1) as section
  )
  select idx.section,
         (select mode() within group (order by r.labels->>idx.section) from rows r where r.labels->>idx.section is not null) as label,
         (select count(*) from rows r where r.section >= idx.section) as reached,
         (select count(*) from rows) as visits
    from idx
   order by idx.section;
$$;

-- Which pages have scroll data in the window, most visited first.
create or replace function visit_scroll_paths(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (path text, visits bigint)
language sql stable
as $$
  select s.path, count(*) as visits
    from visit_scroll s
    join visits v on v.id = s.visit_id
   where s.store_id = p_store and v.started_at >= p_from and v.started_at < p_to
   group by s.path
   order by visits desc;
$$;

-- Service role only, exact signatures, per 0068 and 0081.
revoke all privileges on function record_scroll(uuid, uuid, text, integer, text, jsonb, integer, integer) from public;
grant execute on function record_scroll(uuid, uuid, text, integer, text, jsonb, integer, integer) to service_role;
revoke all privileges on function visit_scroll_rollup(uuid, text, timestamptz, timestamptz) from public;
grant execute on function visit_scroll_rollup(uuid, text, timestamptz, timestamptz) to service_role;
revoke all privileges on function visit_scroll_paths(uuid, timestamptz, timestamptz) from public;
grant execute on function visit_scroll_paths(uuid, timestamptz, timestamptz) to service_role;
