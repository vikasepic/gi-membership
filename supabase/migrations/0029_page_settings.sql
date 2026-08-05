-- Page-level custom code.
--
-- One row per page, alongside the per-section rows in page_sections. It is a
-- separate table rather than columns on products/offers because a sales page
-- can hang off either, and the same two nullable FKs that page_sections
-- rejected would be wrong here for the same reason.
--
-- Custom JS lives here and NOWHERE else. A sales page ends at a Stripe
-- checkout, so script on it is script next to money: one box per page, visible
-- in one place, is something you can audit. Per-block script would mean
-- checking twelve bands to answer "what runs on this page".

create table if not exists page_settings (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,

  owner_type  text not null check (owner_type in ('product', 'offer')),
  owner_id    uuid not null,

  custom_css  text not null default '',
  custom_js   text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (owner_type, owner_id)
);

create trigger page_settings_updated before update on page_settings
  for each row execute function set_updated_at();

alter table page_settings enable row level security;

-- No policies: the store's own code reaches this through the service role, and
-- custom code is an admin surface. An anon SELECT policy would publish the
-- editor's working copy of a page that has not been saved anywhere else.
grant select, insert, update, delete on page_settings to service_role;
