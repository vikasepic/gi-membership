-- supabase/migrations/0090_visit_clicks.sql
--
-- Which buy button a visit pressed.
--
-- Asked 26 Sep 2026: "which button do people click the most". Nothing had
-- ever recorded it; AddToCart carries only price and product. Every buy
-- button on a sales page is a link to /checkout, whichever block draws it,
-- so the scroll tracker (0089) listens for clicks on those links and sends
-- the section the button sits in and what it says.
--
-- One row per visit, page, section and button text: pressing the same
-- button twice is one click. No consent gate, same reasoning as 0080/0089.
-- Retention follows visits by cascade.

create table if not exists visit_clicks (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  visit_id      uuid not null references visits(id) on delete cascade,
  path          text not null,
  -- 0-based index of the <section> holding the button; -1 = outside every section (a sticky bar).
  section       integer not null,
  section_label text,
  button        text not null,
  at            timestamptz not null default now(),
  unique (visit_id, path, section, button)
);

create index if not exists visit_clicks_store_path_idx on visit_clicks (store_id, path, at desc);
alter table visit_clicks enable row level security;

-- Per button on one page: how many visits pressed it. The section label is
-- the most common one recorded, so a page edited mid-window shows the name
-- most visits saw.
create or replace function visit_click_rollup(p_store uuid, p_path text, p_from timestamptz, p_to timestamptz)
returns table (section integer, section_label text, button text, clicks bigint)
language sql stable
as $$
  select c.section,
         mode() within group (order by c.section_label) as section_label,
         c.button,
         count(distinct c.visit_id) as clicks
    from visit_clicks c
    join visits v on v.id = c.visit_id
   where c.store_id = p_store and c.path = p_path
     and v.started_at >= p_from and v.started_at < p_to
   group by c.section, c.button
   order by clicks desc, c.section;
$$;

revoke all privileges on function visit_click_rollup(uuid, text, timestamptz, timestamptz) from public;
grant execute on function visit_click_rollup(uuid, text, timestamptz, timestamptz) to service_role;
