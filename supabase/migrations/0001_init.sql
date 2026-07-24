-- Greater Inside — store platform foundation schema.
-- Multi-tenant shape via store_id throughout; one store seeded (see seed.sql).
-- snake_case DB; camelCase happens at the API boundary. No ORM.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- Shared updated_at trigger.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- stores — one row per tenant (one seeded for now).
-- ---------------------------------------------------------------------------
create table stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  settings    jsonb not null default '{}'::jsonb, -- currency, support email, brand overrides
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger stores_updated before update on stores
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- apps — app registry. Each connected app (Content Engine first) is one row.
-- ---------------------------------------------------------------------------
create table apps (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  key                 text not null,                 -- stable slug, e.g. 'content-engine'
  name                text not null,
  base_url            text not null,
  provision_endpoint  text not null default '/api/store/provision',
  handoff_endpoint    text not null default '/auth/store-handoff',
  shared_secret       text not null,                 -- service-role access only
  entitlement_mapping jsonb not null default '{}'::jsonb, -- offer grant key -> app entitlement key
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, key)
);
create trigger apps_updated before update on apps
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- products — the catalog. bump/upsell offer FKs added after offers exists.
-- ---------------------------------------------------------------------------
create table products (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references stores(id) on delete cascade,
  slug                 text not null,
  title                text not null,
  tagline              text,
  description          text,
  type                 text not null check (type in ('pdf','audio','video','app')),
  price_cents          integer not null check (price_cents >= 0),
  compare_at_cents     integer check (compare_at_cents >= 0),
  currency             text not null default 'usd',
  stripe_product_id_test text,
  stripe_price_id_test   text,
  stripe_product_id_live text,
  stripe_price_id_live   text,
  media_mode           text check (media_mode in ('upload','embed')),
  media_path           text,        -- storage object path (private bucket) for uploads
  media_embed_url      text,        -- Vimeo/YouTube URL for embeds
  cover_image_url      text,
  bump_offer_id        uuid,        -- FK added below (circular with offers)
  upsell_offer_id      uuid,        -- FK added below
  status               text not null default 'draft' check (status in ('draft','published')),
  sort_order           integer not null default 0,
  is_placeholder       boolean not null default false, -- the not-yet-defined $27 product
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (store_id, slug)
);
create trigger products_updated before update on products
  for each row execute function set_updated_at();
create index products_store_status_idx on products (store_id, status);

-- ---------------------------------------------------------------------------
-- offers — reusable offer library. Define once, attach to any product's slots.
-- ---------------------------------------------------------------------------
create table offers (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references stores(id) on delete cascade,
  key                  text not null,
  name                 text not null,                 -- internal label
  grant_type           text not null check (grant_type in ('product','subscription')),
  grant_product_id     uuid references products(id) on delete restrict, -- when grant_type='product'
  grant_app_id         uuid references apps(id) on delete restrict,     -- when grant_type='subscription'
  grant_entitlement_key text,                          -- entitlement the subscription confers
  billing_type         text not null check (billing_type in ('one_time','recurring')),
  interval             text check (interval in ('day','week','month','year')),
  interval_count       integer default 1,
  trial_days           integer,                        -- nullable; 7 for Content Engine
  price_cents          integer not null check (price_cents >= 0),
  compare_at_cents     integer check (compare_at_cents >= 0),
  currency             text not null default 'usd',
  stripe_product_id_test text,
  stripe_price_id_test   text,
  stripe_product_id_live text,
  stripe_price_id_live   text,
  headline             text not null,
  description          text,
  bullets              jsonb not null default '[]'::jsonb,
  image_url            text,
  accept_label         text not null default 'Yes, add this',
  decline_label        text not null default 'No thanks',
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (store_id, key),
  -- grant target must match grant_type
  check (grant_type <> 'product'      or grant_product_id is not null),
  check (grant_type <> 'subscription' or grant_app_id is not null),
  -- recurring offers need an interval
  check (billing_type <> 'recurring'  or interval is not null)
);
create trigger offers_updated before update on offers
  for each row execute function set_updated_at();

-- Close the circular reference: products -> offers.
alter table products
  add constraint products_bump_offer_fk
    foreign key (bump_offer_id) references offers(id) on delete set null,
  add constraint products_upsell_offer_fk
    foreign key (upsell_offer_id) references offers(id) on delete set null;

-- ---------------------------------------------------------------------------
-- lessons — ordered lesson plan for a product (courses / app onboarding).
-- ---------------------------------------------------------------------------
create table lessons (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  title           text not null,
  description     text,
  media_mode      text check (media_mode in ('upload','embed')),
  media_path      text,
  media_embed_url text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger lessons_updated before update on lessons
  for each row execute function set_updated_at();
create index lessons_product_idx on lessons (product_id, sort_order);

-- ---------------------------------------------------------------------------
-- users — store profile mirror of auth.users (Supabase Auth owns credentials).
-- Reconciled with apps on lowercased email.
-- ---------------------------------------------------------------------------
create table users (
  id          uuid primary key,   -- equals auth.users.id
  store_id    uuid not null references stores(id) on delete cascade,
  email       text not null,      -- store lowercased/trimmed
  username    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, email)
);
create trigger users_updated before update on users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- orders + order_items — one order per checkout; items per slot filled.
-- ---------------------------------------------------------------------------
create table visitors (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  anon_id       text not null,     -- first-party cookie id
  landing_url   text,
  referrer      text,
  utm           jsonb not null default '{}'::jsonb,  -- source/medium/campaign/term/content
  click_ids     jsonb not null default '{}'::jsonb,  -- gclid, fbclid, ttclid, ...
  user_agent    text,
  ip_hash       text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (store_id, anon_id)
);

create table orders (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references stores(id) on delete cascade,
  user_id                  uuid references users(id) on delete set null,
  email                    text not null,
  status                   text not null default 'pending'
                             check (status in ('pending','paid','failed','refunded')),
  currency                 text not null default 'usd',
  subtotal_cents           integer not null default 0,
  total_cents              integer not null default 0,
  stripe_payment_intent_id text,
  stripe_customer_id       text,
  visitor_id               uuid references visitors(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger orders_updated before update on orders
  for each row execute function set_updated_at();
create index orders_store_created_idx on orders (store_id, created_at desc);

create table order_items (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references stores(id) on delete cascade,
  order_id                 uuid not null references orders(id) on delete cascade,
  kind                     text not null check (kind in ('product','bump','oto')),
  product_id               uuid references products(id) on delete set null,
  offer_id                 uuid references offers(id) on delete set null,
  description              text not null,       -- snapshot at purchase time
  amount_cents             integer not null,
  stripe_payment_intent_id text,                -- one-time offer charge
  stripe_subscription_id   text,                -- subscription offer
  created_at               timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);

-- ---------------------------------------------------------------------------
-- ownership — what a user owns / subscribes to. Drives offer eligibility.
-- ---------------------------------------------------------------------------
create table ownership (
  id                     uuid primary key default gen_random_uuid(),
  store_id               uuid not null references stores(id) on delete cascade,
  user_id                uuid not null references users(id) on delete cascade,
  product_id             uuid references products(id) on delete cascade,
  app_id                 uuid references apps(id) on delete cascade,
  offer_id               uuid references offers(id) on delete set null,
  source                 text not null check (source in ('purchase','bump','oto','grant')),
  stripe_subscription_id text,
  status                 text not null default 'active'
                           check (status in ('active','trialing','canceled','past_due')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (product_id is not null or app_id is not null)
);
create trigger ownership_updated before update on ownership
  for each row execute function set_updated_at();
-- Own a given product / subscribe to a given app at most once per user.
create unique index ownership_user_product_uq on ownership (store_id, user_id, product_id)
  where product_id is not null;
create unique index ownership_user_app_uq on ownership (store_id, user_id, app_id)
  where app_id is not null;

-- ---------------------------------------------------------------------------
-- progress — lesson/media progress for owned products.
-- ---------------------------------------------------------------------------
create table progress (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references stores(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  lesson_id        uuid references lessons(id) on delete cascade,
  completed        boolean not null default false,
  position_seconds integer,      -- audio/video resume point
  updated_at       timestamptz not null default now(),
  unique (store_id, user_id, lesson_id)
);
create trigger progress_updated before update on progress
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- oto_tokens — single-use replay guard for one-click OTO accept.
-- Token itself is HMAC-signed + short-TTL; this row is the single-use ledger.
-- ---------------------------------------------------------------------------
create table oto_tokens (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  offer_id    uuid not null references offers(id) on delete restrict,
  token_hash  text not null unique,       -- sha256 of issued token
  status      text not null default 'pending'
                check (status in ('pending','completed','expired')),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Private storage bucket for paid assets (PDF/audio). Served only via
-- ownership-checked short-lived signed URLs. Never on a public path.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('paid-assets', 'paid-assets', false)
on conflict (id) do nothing;
