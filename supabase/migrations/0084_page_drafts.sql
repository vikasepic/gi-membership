-- Draft and publish for pages.
--
-- Until now every save in the page editor wrote the row the live site reads.
-- A section's pending work now sits in `draft` and the live columns do not
-- move until publish_page_drafts() copies it across. `published_at` null
-- means the row has only ever been a draft: live reads treat it as absent.
--
-- The default of now() on published_at is load-bearing for the deploy window:
-- code older than this migration inserts rows without naming the column, and
-- those inserts ARE live writes, so they must read as published.

alter table page_sections
  add column if not exists draft jsonb,
  add column if not exists published_at timestamptz default now();

update page_sections set published_at = coalesce(updated_at, now())
  where published_at is null;

alter table page_settings
  add column if not exists draft jsonb;

comment on column page_sections.draft is
  'Pending section as {enabled, style, accent, variant, content, background, css_id, css_class, layout}. Null: nothing unpublished.';
comment on column page_sections.published_at is
  'When the live columns were last written by a publish. Null: never published, invisible to live reads.';
comment on column page_settings.draft is
  'Pending {custom_css, custom_js, snippets, meta_title, meta_description, share_image_path}. Null: nothing unpublished.';

-- One transaction for a whole page. A section key narrows it to one row and
-- leaves page_settings alone; without one, the settings draft goes too.
-- Values are copied as stored: saveSection and savePageSettings validated
-- them on the way into the draft.
create or replace function publish_page_drafts(p_owner_type text, p_owner_id uuid, p_section_key text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  m int := 0;
begin
  update page_sections s set
    enabled      = coalesce((s.draft->>'enabled')::boolean, s.enabled),
    style        = coalesce(s.draft->>'style', s.style),
    accent       = s.draft->>'accent',
    variant      = s.draft->>'variant',
    content      = coalesce(s.draft->'content', s.content),
    background   = case when jsonb_typeof(s.draft->'background') = 'object' then s.draft->'background' else null end,
    css_id       = s.draft->>'css_id',
    css_class    = s.draft->>'css_class',
    layout       = case when jsonb_typeof(s.draft->'layout') = 'object' then s.draft->'layout' else null end,
    draft        = null,
    published_at = now()
  where s.owner_type = p_owner_type
    and s.owner_id = p_owner_id
    and s.draft is not null
    and (p_section_key is null or s.section_key = p_section_key);
  get diagnostics n = row_count;

  if p_section_key is null then
    update page_settings t set
      custom_css        = coalesce(t.draft->>'custom_css', t.custom_css),
      custom_js         = coalesce(t.draft->>'custom_js', t.custom_js),
      snippets          = coalesce(t.draft->'snippets', t.snippets),
      meta_title        = coalesce(t.draft->>'meta_title', t.meta_title),
      meta_description  = coalesce(t.draft->>'meta_description', t.meta_description),
      share_image_path  = coalesce(t.draft->>'share_image_path', t.share_image_path),
      draft             = null
    where t.owner_type = p_owner_type
      and t.owner_id = p_owner_id
      and t.draft is not null;
    get diagnostics m = row_count;
  end if;

  return n + m;
end;
$$;

revoke all on function publish_page_drafts(text, uuid, text) from public;
grant execute on function publish_page_drafts(text, uuid, text) to service_role;

notify pgrst, 'reload schema';
