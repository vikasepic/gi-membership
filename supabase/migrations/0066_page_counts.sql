-- How many people saw each funnel page, and where they came from.
--
-- Counted on the server as the page renders, so it includes the traffic the
-- pixel and GA4 never see: consent declined, scripts blocked, gone before
-- hydration. Those tools answer "what can we report to an ad platform"; this
-- answers "what actually happened".
--
-- Deliberately holds NO identifier — no cookie, no ip, no user agent. A row
-- says a page was viewed, not who viewed it, and that is what makes counting
-- a visitor who declined tracking defensible. Adding a column that identifies
-- a person turns this from a counter into tracking and changes what consent
-- it needs.
create table if not exists page_counts (
  store_id uuid not null references stores(id) on delete cascade,
  day      date not null,
  -- Pathname only. The query is read for the source and thrown away: an ad
  -- click arrives as /p/x?fbclid=… and keeping that would make every row
  -- unique, which is both useless as a report and unbounded growth.
  path     text not null,
  source   text not null,
  hits     integer not null default 0,
  primary key (store_id, day, path, source)
);

-- One statement per view, and it must be an increment rather than a read then
-- a write: two visitors landing in the same millisecond would otherwise both
-- read 4 and both write 5.
create or replace function bump_page_count(
  p_store uuid, p_day date, p_path text, p_source text
) returns void language sql as $$
  insert into page_counts (store_id, day, path, source, hits)
  values (p_store, p_day, p_path, p_source, 1)
  on conflict (store_id, day, path, source)
  do update set hits = page_counts.hits + 1;
$$;
