-- Buffer checkout emails before they reach ActiveCampaign.
--
-- Tagging on blur sent every address straight out, which had three problems:
-- a typo corrected ten seconds later had already created a junk contact, a
-- buyer who finished in two minutes was tagged and untagged for nothing, and
-- anyone could post addresses at the endpoint and have them land directly in
-- the marketing list.
--
-- Emails now land HERE first. A sweep forwards only the ones still unconverted
-- after a delay, so the buffer absorbs corrections, fast buyers never reach
-- ActiveCampaign at all, and abuse fills a table we own rather than a list the
-- business depends on.

create table if not exists checkout_leads (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,

  -- Who is at this checkout. The anonymous visitor cookie for a stranger, or
  -- the user id for a signed-in member. One row per visitor per product, so a
  -- session that types three addresses keeps only the last.
  visitor_key  text not null,
  product_id   uuid not null references products(id) on delete cascade,

  email        text not null,
  full_name    text,

  -- Set when they buy: a converted lead is never forwarded.
  converted_at timestamptz,
  -- Set once forwarded, so it cannot be sent twice.
  sent_at      timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists checkout_leads_visitor_product_idx
  on checkout_leads (store_id, visitor_key, product_id);

-- The sweep's query: unsent, unconverted, and old enough to have settled.
create index if not exists checkout_leads_pending_idx
  on checkout_leads (updated_at)
  where sent_at is null and converted_at is null;

create trigger checkout_leads_updated before update on checkout_leads
  for each row execute function set_updated_at();
