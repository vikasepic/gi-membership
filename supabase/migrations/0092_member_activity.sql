-- What a signed-in member does: the pages they see and the library card they
-- click. Two tables, one reason.
--
-- On 1 Oct 2026 the owner asked how a buyer came to hold two subscriptions
-- 25 seconds apart. The answer was the library's "Still available" card,
-- which charged the saved card on one tap, and the only evidence was the
-- code: nothing recorded the tap, and nothing recorded which pages a member
-- saw after signing in. The card now links to the offer's page like any
-- visitor's path (no charge without the checkout), the click is written
-- here, and so is every store page a member opens.
--
-- Written by the server (service role) only. Both answer "did they, and
-- when", so the browser cannot write them. Anonymous visitors are the
-- `visits` tables' business; these are keyed on the member.

create table if not exists member_page_views (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  path        text not null check (length(path) <= 200),
  at          timestamptz not null default now()
);

create index if not exists member_page_views_user_idx
  on member_page_views (user_id, at desc);

create table if not exists library_offer_clicks (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  -- A deleted offer keeps its clicks; the name is gone but the times are not.
  offer_id    uuid references offers(id) on delete set null,
  user_agent  text,
  at          timestamptz not null default now()
);

create index if not exists library_offer_clicks_user_idx
  on library_offer_clicks (user_id, at desc);

-- New tables get Supabase's default grants to anon and authenticated; 0067
-- revoked what existed then, not what is created after.
alter table member_page_views    enable row level security;
alter table library_offer_clicks enable row level security;
revoke all on member_page_views, library_offer_clicks from anon, authenticated;

notify pgrst, 'reload schema';
