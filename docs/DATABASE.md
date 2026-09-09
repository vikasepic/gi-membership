# Database reference — gi-membership

**Generated 5 September 2026 from the live production database**, not from the
migration files. Where this document and `supabase/migrations/` disagree, this
document is what is actually running.

- Postgres 15, self-hosted Supabase (not Supabase Cloud)
- Container `supabase-db-fuv6argrk5j8ogd4y3hi5tu0` on the KVM behind
  `grow-api.greaterinside.com`
- 28 tables, all in the `public` schema
- 68 migrations applied, `0001` … `0068`

## Read this before you touch anything

**1. Migrations do NOT run on deploy.** There is no migration step in the
`Dockerfile`. Deploying the app ships code only; every migration in
`supabase/migrations/` is applied by hand against the container. Code can and
does go live ahead of its schema — several read paths swallow the resulting
error deliberately so the site degrades rather than breaks. If a feature is
live and inert, check the schema before you check the code.

**2. Everything is scoped by `store_id`, and there is exactly one store.**
Every table except `templates` carries `store_id uuid not null references
stores(id) on delete cascade`. The application resolves it once via
`getStoreId()`. It is single-tenant today and shaped for multi-tenant later —
never write a query that omits the store filter, even though it currently
cannot return another store's rows.

**3. Access control is privilege-based, not policy-based.** RLS is enabled on
all 28 tables with **no policies at all**. That is not an oversight: it is the
second lock. Migration `0067` revoked every privilege from `anon` and
`authenticated` and set `alter default privileges` so new tables arrive locked.
All application table access goes through `createServiceClient()` using the
service-role key, which bypasses RLS. The anon key is used **only** for
`auth.*` calls — sign in, sign out, getUser, password reset.

> Until 5 September 2026 the anon key held SELECT/INSERT/UPDATE/DELETE/TRUNCATE
> on every table with no RLS, and customer emails, orders and ownership were
> publicly readable. `0067` closed it. If you add a table, confirm it is not
> granted to `anon` before shipping.

**4. Money lives in Stripe; this database records it.** Stripe is the source of
truth for anything a card is attached to. `ownership.stripe_subscription_id` is
reconciled against Stripe in `lib/subscription-reconcile.ts`, and where they
disagree Stripe wins. Stripe is in **LIVE mode** in production — charges are
real. Rows with `orders.livemode = false` are test-mode leftovers and must be
excluded from every revenue figure.

**5. All money is integer cents.** `price_cents`, `total_cents`,
`discount_cents`, `tax_cents`. There are no floats anywhere and there should
never be.

**6. Timestamps are `timestamptz` and days are UTC.** `page_counts.day` is a
`date` written from `new Date().toISOString().slice(0,10)` — UTC, not local.
Anything comparing a timestamp to that column must align to UTC midnight.

## How the tables relate

```
stores (1 row — everything hangs off this)
  │
  ├── users ──────────── ownership ──── apps          (what someone can access)
  │      │                   │  └────── products
  │      │                   └────────→ offer_prices / product_prices
  │      │
  │      ├── orders ────── order_items ─→ products / offers
  │      │      │                       └─→ product_prices / offer_prices
  │      │      └── oto_tokens          (signed one-click upsell links)
  │      │
  │      └── progress ──→ courses / course_items
  │
  ├── products ──┬── product_prices        (pricing variations)
  │              ├── product_courses ──→ courses ── course_items  (self-nesting)
  │              └── bump/upsell/alt ──→ offers    (7 self- and cross-FKs)
  │
  ├── offers ────── offer_prices
  │
  ├── page_sections / page_settings        (the block builder — owner_type +
  │                                         owner_id, NOT foreign keys)
  ├── media / fonts / templates            (assets and the template library)
  ├── visitors / page_counts / checkout_leads   (analytics and funnel)
  ├── error_events / deploy_notices / editing_presence   (operations)
  └── trial_history / pending_app_entitlements  (entitlement bookkeeping)
```

### The joins that are not foreign keys

Two places use a polymorphic owner instead of an FK, so referential integrity
is the application's job and orphans are possible:

- `page_sections (owner_type, owner_id, section_key)` and
  `page_settings (owner_type, owner_id)` — `owner_type` is one of
  `product | offer | store | checkout | email`, and `owner_id` points at
  whichever table that names. **Deleting a product or offer does not delete
  its page sections.**
- `error_events.job_payload` and `.context` are JSONB carrying `orderId`,
  `userId`, `offerId` as loose strings. They are not FKs, so a deleted order
  leaves a job pointing at nothing. This is a known live footgun — the retry
  button will happily offer to retry a job whose order no longer exists.

### Delete behaviour, which is where the surprises are

- `ON DELETE CASCADE` — everything hanging off `stores` and `users`, plus
  `order_items` → `orders` and `ownership` → `users`/`products`/`apps`.
  **Deleting a user deletes their ownership and their oto_tokens; deleting an
  order deletes its items.**
- `ON DELETE SET NULL` — `orders.user_id`, `orders.visitor_id`,
  `order_items.product_id`, `order_items.offer_id`, and every
  bump/upsell/alt pointer on `products` and `offers`. **An order survives its
  buyer and its product being deleted**, which is deliberate: the financial
  record must outlive the catalogue.
- `ON DELETE RESTRICT` — `offers.grant_product_id`, `offers.grant_app_id`,
  and every `*_price_id`. **A price that has ever been sold cannot be
  deleted**, because an order line references it.

A worked consequence: deleting a test order leaves the `ownership` row it
created (its FK is to the user and product, not the order) and any queued
`error_events` job. Both surfaced on the admin errors screen in September 2026
as phantom entries. If you clear test data, clear ownership and error_events
too.

## Stored functions

| Function | Signature | Purpose |
|---|---|---|
| `bump_page_count` | `(uuid, date, text, text, text) → void` | One-statement upsert-increment for traffic counting. Must be one statement: two visitors in the same millisecond would otherwise both read N and both write N+1. `EXECUTE` is granted to `service_role` only. |
| `move_course_item` | `(uuid, uuid, int) → void` | Reparent and reorder a curriculum item. In Postgres because the reordering must be atomic. |
| `swap_course_item_order` | `(uuid, uuid) → void` | Swap two items' sort order atomically. |
| `set_updated_at` | trigger | Standard `updated_at` touch. On 16 tables. |
| `course_items_depth_guard` | trigger | Refuses a curriculum nested deeper than the allowed depth. |
| `sync_offer_default_price` / `sync_product_default_price` | trigger | Mirrors the default row from `offer_prices` / `product_prices` back onto the parent's own `price_cents` columns, so old read paths keep working. |
| `templates_touch` | trigger | `updated_at` for the template library. |

## Conventions

- Primary keys are `uuid default gen_random_uuid()`, except `page_counts`
  (composite: `store_id, day, path, source, product`) and `product_courses`
  (composite: `product_id, course_id`).
- Status columns are `text` with a `CHECK (… = ANY (ARRAY[…]))` rather than
  Postgres enums — adding a value is a migration either way, and a CHECK does
  not need `ALTER TYPE`. **The type system cannot see these**, so a value the
  application believes is valid can still be refused at write time; a clean
  `tsc` and a green suite have both missed a bad CHECK here before.
- Uniqueness is almost always `(store_id, <natural key>)` — see `users`,
  `products`, `offers`, `courses`, `apps`, `fonts`, `visitors`.
- Soft delete is not used. Deletes are real.

---

# Table reference

### `apps`

*2 rows · 48 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `key` | text | no |  |  |
| `name` | text | no |  |  |
| `base_url` | text | yes |  | Null for an internal app (0074). |
| `provision_endpoint` | text | no | `'/api/store/provision'::text` |  |
| `handoff_endpoint` | text | no | `'/auth/store-handoff'::text` |  |
| `shared_secret` | text | yes |  | Null for an internal app (0074). |
| `entitlement_mapping` | jsonb | no | `'{}'::jsonb` |  |
| `active` | boolean | no | `true` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `channels` | ARRAY | no | `'{}'::text[]` | What this app can grant inside itself, e.g. {instagram,linkedin} for Content Engine. Empty… |
| `kind` | text | no | `'external'::text` | internal = runs inside this codebase at /apps/<key>, no HTTP bridge. external = a separate app reached through provision and handoff. |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, key)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((channels <@ ARRAY['instagram'::text, 'linkedin'::text]))`
- `CHECK ((kind = ANY (ARRAY['internal'::text, 'external'::text])))`
- `CHECK (((kind <> 'external'::text) OR ((base_url IS NOT NULL) AND (shared_secret IS NOT NULL))))` — an external app must have somewhere to be called; an internal one has nothing to fill in

---

### `checkout_leads`

*18 rows · 96 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `visitor_key` | text | no |  |  |
| `product_id` | uuid | no |  |  |
| `email` | text | no |  |  |
| `full_name` | text | yes |  |  |
| `converted_at` | timestamptz | yes |  |  |
| `sent_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Indexes:**

- `CREATE INDEX checkout_leads_pending_idx ON public.checkout_leads USING btree (updated_at) WHERE ((sent_at IS NULL) AND (converted_at IS NULL))`

---

### `course_items`

*9 rows · 96 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `title` | text | no |  |  |
| `description` | text | yes |  |  |
| `sort_order` | integer | no | `0` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `parent_id` | uuid | yes |  |  |
| `subtitle` | text | yes |  |  |
| `body_html` | text | yes |  |  |
| `video_embed_url` | text | yes |  |  |
| `cover_path` | text | yes |  |  |
| `attachments` | jsonb | no | `'[]'::jsonb` |  |
| `is_published` | boolean | no | `false` |  |
| `course_id` | uuid | no |  |  |
| `item_type` | text | no | `'text'::text` |  |
| `audio_urls` | ARRAY | no | `'{}'::text[]` | Externally hosted audio for an audio lesson, in order. Public by nature — an uploaded atta… |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE`
- `FOREIGN KEY (parent_id) REFERENCES course_items(id) ON DELETE CASCADE`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((item_type = ANY (ARRAY['video'::text, 'audio'::text, 'pdf'::text, 'text'::text])))`

**Indexes:**

- `CREATE INDEX course_items_parent_idx ON public.course_items USING btree (parent_id, sort_order)`

---

### `courses`

*4 rows · 48 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `slug` | text | no |  |  |
| `title` | text | no |  |  |
| `subtitle` | text | yes |  |  |
| `description` | text | yes |  |  |
| `cover_path` | text | yes |  |  |
| `chapter_label` | text | no | `'Chapter'::text` |  |
| `lesson_label` | text | no | `'Lesson'::text` |  |
| `status` | text | no | `'draft'::text` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `type` | text | no | `'text'::text` |  |
| `attachments` | jsonb | no | `'[]'::jsonb` |  |
| `video_embed_url` | text | yes |  |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, slug)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))`
- `CHECK ((type = ANY (ARRAY['video'::text, 'audio'::text, 'pdf'::text, 'text'::text])))`

---

### `deploy_notices`

*43 rows · 48 kB · RLS enabled*

> Short-lived deploy warnings shown to signed-in admins. Written by POST /api/deploy-notice before a push; read by the admin shell. Rows are meaningless once starts_at + back_in_minutes has passed and are safe to delete at any time.

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `starts_at` | timestamptz | no |  |  |
| `back_in_minutes` | integer | no | `5` |  |
| `source` | text | no | `'api'::text` |  |
| `created_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK (((back_in_minutes >= 1) AND (back_in_minutes <= 60)))`

**Indexes:**

- `CREATE INDEX deploy_notices_recent_idx ON public.deploy_notices USING btree (store_id, starts_at DESC)`

---

### `editing_presence`

*22 rows · 96 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `resource` | text | no |  |  |
| `resource_id` | text | no |  |  |
| `user_id` | uuid | no |  |  |
| `seen_at` | timestamptz | no | `now()` |  |
| `created_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (resource, resource_id, user_id)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

**Indexes:**

- `CREATE INDEX editing_presence_resource_idx ON public.editing_presence USING btree (resource, resource_id, seen_at DESC)`

---

### `error_events`

*2 rows · 64 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `source` | text | no |  |  |
| `message` | text | no |  |  |
| `context` | jsonb | no | `'{}'::jsonb` |  |
| `job_kind` | text | yes |  |  |
| `job_payload` | jsonb | yes |  |  |
| `attempts` | integer | no | `0` |  |
| `next_attempt_at` | timestamptz | yes |  |  |
| `resolved_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Indexes:**

- `CREATE INDEX error_events_due_idx ON public.error_events USING btree (next_attempt_at) WHERE ((resolved_at IS NULL) AND (job_kind IS NOT NULL))`
- `CREATE INDEX error_events_unresolved_idx ON public.error_events USING btree (store_id, created_at DESC) WHERE (resolved_at IS NULL)`

---

### `fonts`

*2 rows · 48 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `family` | text | no |  |  |
| `source` | text | no |  |  |
| `files` | jsonb | no | `'[]'::jsonb` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, family)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((source = ANY (ARRAY['google'::text, 'custom'::text])))`

---

### `media`

*74 rows · 96 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `bucket` | text | no |  |  |
| `path` | text | no |  |  |
| `name` | text | no |  |  |
| `alt` | text | yes |  |  |
| `mime` | text | no |  |  |
| `size` | bigint | no | `0` |  |
| `width` | integer | yes |  |  |
| `height` | integer | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, bucket, path)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((bucket = ANY (ARRAY['public-media'::text, 'paid-assets'::text])))`

**Indexes:**

- `CREATE INDEX media_by_kind ON public.media USING btree (store_id, mime, created_at DESC)`

---

### `offer_prices`

*4 rows · 48 kB · RLS enabled*

> The ways to pay for one offer. offers.price_cents and its siblings are a mirror of the first non-archived row here, written by offer_prices_sync and by nothing else.

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `offer_id` | uuid | no |  |  |
| `label` | text | yes |  |  |
| `billing_type` | text | no |  |  |
| `interval` | text | yes |  |  |
| `interval_count` | integer | no | `1` |  |
| `trial_days` | integer | yes |  |  |
| `price_cents` | integer | no |  |  |
| `compare_at_cents` | integer | yes |  |  |
| `sort_order` | integer | no | `0` |  |
| `archived` | boolean | no | `false` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK (((trial_days IS NULL) OR (trial_days >= 0)))`
- `CHECK ((billing_type = ANY (ARRAY['one_time'::text, 'recurring'::text])))`
- `CHECK (((compare_at_cents IS NULL) OR (compare_at_cents >= price_cents)))`
- `CHECK ((compare_at_cents >= 0))`
- `CHECK (("interval" = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text])))`
- `CHECK ((interval_count >= 1))`
- `CHECK (((billing_type <> 'one_time'::text) OR (trial_days IS NULL)))`
- `CHECK ((price_cents >= 0))`
- `CHECK (((billing_type <> 'recurring'::text) OR ("interval" IS NOT NULL)))`

**Indexes:**

- `CREATE INDEX offer_prices_offer_idx ON public.offer_prices USING btree (offer_id, sort_order, created_at)`

---

### `offers`

*3 rows · 160 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `key` | text | no |  |  |
| `name` | text | no |  |  |
| `grant_type` | text | no |  |  |
| `grant_product_id` | uuid | yes |  |  |
| `grant_app_id` | uuid | yes |  |  |
| `grant_entitlement_key` | text | yes |  |  |
| `billing_type` | text | no |  |  |
| `interval` | text | yes |  |  |
| `interval_count` | integer | yes | `1` |  |
| `trial_days` | integer | yes |  |  |
| `price_cents` | integer | no |  |  |
| `compare_at_cents` | integer | yes |  |  |
| `currency` | text | no | `'usd'::text` |  |
| `stripe_product_id_test` | text | yes |  |  |
| `stripe_price_id_test` | text | yes |  |  |
| `stripe_product_id_live` | text | yes |  |  |
| `stripe_price_id_live` | text | yes |  |  |
| `headline` | text | no |  |  |
| `description` | text | yes |  |  |
| `bullets` | jsonb | no | `'[]'::jsonb` |  |
| `image_url` | text | yes |  |  |
| `accept_label` | text | no | `'Yes, add this'::text` |  |
| `decline_label` | text | no | `'No thanks'::text` |  |
| `active` | boolean | no | `true` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `activecampaign_tag_id` | text | yes |  | Buyer: applied the first time money is actually taken, removed at cancellation. On a trial… |
| `oto_template` | text | no | `'visual'::text` | Layout for /checkout/oto: short \| visual \| long \| custom (custom = coded component keye… |
| `oto_body` | text | yes |  | Long-form copy for the long template. Blank lines separate paragraphs. |
| `oto_video_url` | text | yes |  | Embed URL for the visual template. Falls back to image_url when empty. |
| `oto_sections` | jsonb | no | `'{}'::jsonb` | Long-form sales page sections for the `sales` upsell template. Empty sections are skipped. |
| `bump_headline` | text | yes |  | Bold line on the checkout bump. Falls back to headline when null. |
| `bump_description` | text | yes |  | Grey line under it on the checkout bump. Falls back to description when null. |
| `oto_page` | jsonb | no | `'{}'::jsonb` | Overrides for the bespoke upsell page copy. Key -> string or string[]. Missing keys use th… |
| `bump_banner` | text | yes |  | Banner text. Null = show the derived default; empty string = no banner; otherwise shown ve… |
| `bump_bullets` | ARRAY | no | `'{}'::text[]` | Short proof points for the checkout. Separate from offers.bullets so the bump can be terse… |
| `bump_note` | text | yes |  | The line tying this bump to what is being bought. Null hides the callout. |
| `bump_accent` | text | yes |  | Accent colour as #rrggbb. Null uses BUMP_ACCENT_DEFAULT. |
| `activecampaign_trial_tag_id` | text | yes |  | Applied when the trial starts, removed on the first payment. Survives a cancellation insid… |
| `activecampaign_cancelled_tag_id` | text | yes |  | Applied when access ends. Never removed, so it is a history of churn rather than a current… |
| `page_alt_offer_id` | uuid | yes |  | A second price shown on this offer's OWN sales page at /o/<key>. Bumps and upsells read th… |
| `page_price_ids` | jsonb | no | `'[]'::jsonb` |  |
| `grant_channels` | ARRAY | no | `'{}'::text[]` | Channels inside the granted app this offer unlocks. Empty for offers that do not grant an … |
| `ad_event_name` | text | yes |  | Meta trackCustom event name fired when this offer is bought, beside Purchase or StartTrial… |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, key)`

**Foreign keys:**

- `FOREIGN KEY (grant_app_id) REFERENCES apps(id) ON DELETE RESTRICT`
- `FOREIGN KEY (grant_product_id) REFERENCES products(id) ON DELETE RESTRICT`
- `FOREIGN KEY (page_alt_offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((grant_type = ANY (ARRAY['product'::text, 'subscription'::text])))`
- `CHECK ((oto_template = ANY (ARRAY['short'::text, 'visual'::text, 'long'::text, 'sales'::text, 'sections'::text, 'custom'::text])))`
- `CHECK (((page_alt_offer_id IS NULL) OR (page_alt_offer_id <> id)))`
- `CHECK ((jsonb_typeof(page_price_ids) = 'array'::text))`
- `CHECK ((price_cents >= 0))`
- `CHECK ((compare_at_cents >= 0))`
- `CHECK ((grant_channels <@ ARRAY['instagram'::text, 'linkedin'::text]))`
- `CHECK (("interval" = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text])))`
- `CHECK (((ad_event_name IS NULL) OR ((char_length(btrim(ad_event_name)) >= 1) AND (char_length(btrim(ad_event_name)) <= 40))))`
- `CHECK ((billing_type = ANY (ARRAY['one_time'::text, 'recurring'::text])))`
- `CHECK (((grant_type <> 'product'::text) OR (grant_product_id IS NOT NULL)))`
- `CHECK (((grant_type <> 'subscription'::text) OR (grant_app_id IS NOT NULL)))`
- `CHECK (((billing_type <> 'recurring'::text) OR ("interval" IS NOT NULL)))`

---

### `order_items`

*6 rows · 48 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `order_id` | uuid | no |  |  |
| `kind` | text | no |  |  |
| `product_id` | uuid | yes |  |  |
| `offer_id` | uuid | yes |  |  |
| `description` | text | no |  |  |
| `amount_cents` | integer | no |  |  |
| `stripe_payment_intent_id` | text | yes |  |  |
| `stripe_subscription_id` | text | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `offer_price_id` | uuid | yes |  |  |
| `product_price_id` | uuid | yes |  |  |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (offer_price_id) REFERENCES offer_prices(id) ON DELETE RESTRICT`
- `FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE`
- `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL`
- `FOREIGN KEY (product_price_id) REFERENCES product_prices(id) ON DELETE RESTRICT`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((kind = ANY (ARRAY['product'::text, 'bump'::text, 'oto'::text, 'renewal'::text])))`

**Indexes:**

- `CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id)`

---

### `orders`

*5 rows · 112 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `user_id` | uuid | yes |  |  |
| `email` | text | no |  |  |
| `status` | text | no | `'pending'::text` |  |
| `currency` | text | no | `'usd'::text` |  |
| `subtotal_cents` | integer | no | `0` |  |
| `total_cents` | integer | no | `0` |  |
| `stripe_payment_intent_id` | text | yes |  |  |
| `stripe_customer_id` | text | yes |  |  |
| `visitor_id` | uuid | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `tracking_consent` | boolean | no | `false` | GDPR: true only when the buyer explicitly opted in before purchase. |
| `buyer_country` | text | yes |  |  |
| `tax_cents` | integer | no | `0` | Tax portion of total_cents, as calculated by Stripe Tax at checkout. |
| `stripe_tax_calculation_id` | text | yes |  |  |
| `coupon_code` | text | yes |  | Stripe promotion code applied at checkout, uppercased. Null when none. |
| `discount_cents` | integer | no | `0` | Amount taken off the subtotal, in cents. Snapshot — never recomputed. |
| `session_granted_at` | timestamptz | yes |  | When the post-purchase session was minted. Set once; a second attempt is refused. |
| `post_purchase_sent_at` | timestamptz | yes |  | When the welcome/post-purchase email was sent for this order. Null means never. Set by lib… |
| `stripe_setup_intent_id` | text | yes |  | Set instead of stripe_payment_intent_id when this order starts a subscription — a recurrin… |
| `client_ip` | text | yes |  | Buyer IP at checkout, for ad-platform match quality. Written only with tracking consent. |
| `client_user_agent` | text | yes |  | Buyer user agent at checkout. Written only with tracking consent. |
| `source_url` | text | yes |  | The page the checkout happened on, sent as event_source_url. Written only with tracking co… |
| `stripe_invoice_id` | text | yes |  | The Stripe invoice this order records, for a renewal or a trial converting. Null on a chec… |
| `livemode` | boolean | no | `true` | False when the order was made against a Stripe test key. Test orders are real rows for mon… |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`
- `FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL`

**Check constraints:**

- `CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text])))`

**Indexes:**

- `CREATE INDEX orders_post_purchase_pending_idx ON public.orders USING btree (store_id, created_at) WHERE (post_purchase_sent_at IS NULL)`
- `CREATE INDEX orders_coupon_idx ON public.orders USING btree (store_id, coupon_code) WHERE (coupon_code IS NOT NULL)`
- `CREATE INDEX orders_store_created_idx ON public.orders USING btree (store_id, created_at DESC)`
- `CREATE INDEX orders_livemode_idx ON public.orders USING btree (store_id, livemode) WHERE (livemode = false)`

---

### `oto_tokens`

*2 rows · 48 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `order_id` | uuid | no |  |  |
| `user_id` | uuid | no |  |  |
| `offer_id` | uuid | no |  |  |
| `token_hash` | text | no |  |  |
| `status` | text | no | `'pending'::text` |  |
| `expires_at` | timestamptz | no |  |  |
| `consumed_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (token_hash)`

**Foreign keys:**

- `FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE RESTRICT`
- `FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'expired'::text])))`

---

### `ownership`

*6 rows · 112 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `user_id` | uuid | no |  |  |
| `product_id` | uuid | yes |  |  |
| `app_id` | uuid | yes |  |  |
| `offer_id` | uuid | yes |  |  |
| `source` | text | no |  |  |
| `stripe_subscription_id` | text | yes |  |  |
| `status` | text | no | `'active'::text` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `granted_by` | text | yes |  | Admin email that granted this by hand. Null for anything bought. |
| `offer_price_id` | uuid | yes |  |  |
| `product_price_id` | uuid | yes |  |  |
| `session_granted_at` | timestamptz | yes |  | When a post-purchase session was handed out for this grant. Set once; the compare-and-set … |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE`
- `FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (offer_price_id) REFERENCES offer_prices(id) ON DELETE RESTRICT`
- `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE`
- `FOREIGN KEY (product_price_id) REFERENCES product_prices(id) ON DELETE RESTRICT`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((source = ANY (ARRAY['purchase'::text, 'bump'::text, 'oto'::text, 'grant'::text, 'app'::text])))`
- `CHECK ((status = ANY (ARRAY['active'::text, 'trialing'::text, 'canceled'::text, 'past_due'::text])))`
- `CHECK (((product_id IS NOT NULL) OR (app_id IS NOT NULL)))`

**Indexes:**

- `CREATE INDEX ownership_product_price_idx ON public.ownership USING btree (product_price_id) WHERE (product_price_id IS NOT NULL)`
- `CREATE INDEX ownership_offer_price_idx ON public.ownership USING btree (offer_price_id) WHERE (offer_price_id IS NOT NULL)`
- `CREATE INDEX ownership_subscription_idx ON public.ownership USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL)`

---

### `page_counts`

*6 rows · 32 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `store_id` | uuid | no |  |  |
| `day` | date | no |  |  |
| `path` | text | no |  |  |
| `source` | text | no |  |  |
| `hits` | integer | no | `0` |  |
| `product` | text | no | `''::text` |  |

**Keys:** `PRIMARY KEY (store_id, day, path, source, product)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

---

### `page_sections`

*74 rows · 536 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `owner_type` | text | no |  | product \| offer \| store \| checkout \| email. The last three are keyed by the store id a… |
| `owner_id` | uuid | no |  |  |
| `section_key` | text | no |  |  |
| `position` | integer | no | `0` |  |
| `enabled` | boolean | no | `true` |  |
| `style` | text | no | `'paper'::text` |  |
| `accent` | text | yes |  |  |
| `variant` | text | yes |  |  |
| `content` | jsonb | no | `'{}'::jsonb` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `background` | jsonb | yes |  | Optional {type,color,image,size,position,repeat,overlay} over the band preset. Null means … |
| `css_id` | text | yes |  | Optional DOM id for this band, so #it can be linked to. Sanitised on write. |
| `css_class` | text | yes |  | Optional class list for this band, for page-level custom CSS. Sanitised on write. |
| `layout` | jsonb | yes |  | How the band holds its content: {width: boxed\|full\|custom, maxWidth, padX, padY}. Null m… |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (owner_type, owner_id, section_key)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((owner_type = ANY (ARRAY['product'::text, 'offer'::text, 'store'::text, 'checkout'::text, 'email'::text])))`

**Indexes:**

- `CREATE INDEX page_sections_owner_idx ON public.page_sections USING btree (owner_type, owner_id, "position")`

---

### `page_settings`

*2 rows · 128 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `owner_type` | text | no |  |  |
| `owner_id` | uuid | no |  |  |
| `custom_css` | text | no | `''::text` |  |
| `custom_js` | text | no | `''::text` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `snippets` | jsonb | no | `'[]'::jsonb` | Code snippets for this page alone: [{name, place, code, on, onCheckout}]. Same shape as th… |
| `meta_title` | text | no | `''::text` | The <title> and og:title for this page. Empty falls back to the product or offer name, the… |
| `meta_description` | text | no | `''::text` |  |
| `share_image_path` | text | no | `''::text` | Storage path of the 1200x630 card behind a shared link. Empty falls back to the page's cov… |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (owner_type, owner_id)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((owner_type = ANY (ARRAY['product'::text, 'offer'::text, 'store'::text, 'checkout'::text, 'email'::text])))`

---

### `pending_app_entitlements`

*130 rows · 168 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `app_id` | uuid | no |  |  |
| `email` | text | no |  |  |
| `entitlement_key` | text | yes |  |  |
| `status` | text | no | `'active'::text` |  |
| `stripe_subscription_id` | text | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, app_id, email)`

**Foreign keys:**

- `FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((status = ANY (ARRAY['active'::text, 'trialing'::text, 'canceled'::text, 'past_due'::text])))`

**Indexes:**

- `CREATE INDEX pending_app_entitlements_email_idx ON public.pending_app_entitlements USING btree (store_id, email)`

---

### `product_courses`

*4 rows · 72 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `product_id` | uuid | no |  |  |
| `course_id` | uuid | no |  |  |
| `sort_order` | integer | no | `0` |  |

**Keys:** `PRIMARY KEY (product_id, course_id)`

**Foreign keys:**

- `FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE`
- `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE`

**Indexes:**

- `CREATE INDEX product_courses_course_idx ON public.product_courses USING btree (course_id)`

---

### `product_prices`

*5 rows · 48 kB · RLS enabled*

> The ways to buy one product. products.price_cents and compare_at_cents are a mirror of the first non-archived row here, written by product_prices_sync and by nothing else. Mirrors offer_prices exactly — see 0048.

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `product_id` | uuid | no |  |  |
| `label` | text | yes |  |  |
| `billing_type` | text | no |  |  |
| `interval` | text | yes |  |  |
| `interval_count` | integer | no | `1` |  |
| `trial_days` | integer | yes |  |  |
| `price_cents` | integer | no |  |  |
| `compare_at_cents` | integer | yes |  |  |
| `sort_order` | integer | no | `0` |  |
| `archived` | boolean | no | `false` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`

**Foreign keys:**

- `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((interval_count >= 1))`
- `CHECK (((billing_type <> 'one_time'::text) OR (trial_days IS NULL)))`
- `CHECK ((price_cents >= 0))`
- `CHECK (((billing_type <> 'recurring'::text) OR ("interval" IS NOT NULL)))`
- `CHECK (((trial_days IS NULL) OR (trial_days >= 0)))`
- `CHECK (("interval" = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text])))`
- `CHECK ((compare_at_cents >= 0))`
- `CHECK (((compare_at_cents IS NULL) OR (compare_at_cents >= price_cents)))`
- `CHECK ((billing_type = ANY (ARRAY['one_time'::text, 'recurring'::text])))`

**Indexes:**

- `CREATE INDEX product_prices_product_idx ON public.product_prices USING btree (product_id, sort_order, created_at)`

---

### `products`

*4 rows · 64 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `slug` | text | no |  |  |
| `title` | text | no |  |  |
| `tagline` | text | yes |  |  |
| `description` | text | yes |  |  |
| `type` | text | yes |  |  |
| `price_cents` | integer | no |  |  |
| `compare_at_cents` | integer | yes |  |  |
| `currency` | text | no | `'usd'::text` |  |
| `stripe_product_id_test` | text | yes |  |  |
| `stripe_price_id_test` | text | yes |  |  |
| `stripe_product_id_live` | text | yes |  | The Stripe Product every recurring price of this product bills against. Written on first u… |
| `stripe_price_id_live` | text | yes |  |  |
| `media_mode` | text | yes |  |  |
| `media_path` | text | yes |  |  |
| `media_embed_url` | text | yes |  |  |
| `cover_image_url` | text | yes |  |  |
| `bump_offer_id` | uuid | yes |  |  |
| `upsell_offer_id` | uuid | yes |  |  |
| `status` | text | no | `'draft'::text` |  |
| `sort_order` | integer | no | `0` |  |
| `is_placeholder` | boolean | no | `false` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `cover_path` | text | yes |  |  |
| `activecampaign_tag_id` | text | yes |  | ActiveCampaign tag id applied to the buyer on purchase. Null = no tag. |
| `activecampaign_abandoned_tag_id` | text | yes |  | Tag applied when checkout for THIS product starts, removed when it is paid. |
| `bump_alt_offer_id` | uuid | yes |  | A second price shown beside bump_offer_id, turning the tickbox into a choice. Null means o… |
| `upsell_alt_offer_id` | uuid | yes |  | A second price shown beside upsell_offer_id as a second one-click button. Null means one p… |
| `checkout_note` | text | yes |  |  |
| `checkout_bullets` | jsonb | no | `'[]'::jsonb` |  |
| `bump_price_ids` | jsonb | no | `'[]'::jsonb` | Which of the bump offer's prices this product shows, in order. Empty means the headline pr… |
| `upsell_price_ids` | jsonb | no | `'[]'::jsonb` |  |
| `offer_id` | uuid | yes |  | The offer whose ways to pay this product is sold on. Null means the product's own one-time… |
| `bump_product_id` | uuid | yes |  | The product offered as this checkout's order bump. Mutually exclusive with bump_offer_id; … |
| `upsell_product_id` | uuid | yes |  |  |
| `ad_event_name` | text | yes |  | Meta trackCustom event name fired on the upsell page for this funnel. Set by the ads team.… |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, slug)`

**Foreign keys:**

- `FOREIGN KEY (bump_alt_offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (bump_offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (bump_product_id) REFERENCES products(id) ON DELETE SET NULL`
- `FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`
- `FOREIGN KEY (upsell_alt_offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (upsell_offer_id) REFERENCES offers(id) ON DELETE SET NULL`
- `FOREIGN KEY (upsell_product_id) REFERENCES products(id) ON DELETE SET NULL`

**Check constraints:**

- `CHECK (((bump_product_id IS NULL) OR (bump_product_id <> id)))`
- `CHECK (((ad_event_name IS NULL) OR ((char_length(btrim(ad_event_name)) >= 1) AND (char_length(btrim(ad_event_name)) <= 40))))`
- `CHECK (((bump_alt_offer_id IS NULL) OR (bump_alt_offer_id <> bump_offer_id)))`
- `CHECK (((upsell_offer_id IS NULL) OR (upsell_product_id IS NULL)))`
- `CHECK ((jsonb_typeof(upsell_price_ids) = 'array'::text))`
- `CHECK (((bump_offer_id IS NULL) OR (bump_product_id IS NULL)))`
- `CHECK ((jsonb_typeof(bump_price_ids) = 'array'::text))`
- `CHECK ((compare_at_cents >= 0))`
- `CHECK ((media_mode = ANY (ARRAY['upload'::text, 'embed'::text])))`
- `CHECK ((price_cents >= 0))`
- `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))`
- `CHECK ((type = ANY (ARRAY['pdf'::text, 'audio'::text, 'video'::text, 'app'::text, 'course'::text])))`
- `CHECK (((upsell_alt_offer_id IS NULL) OR (upsell_alt_offer_id <> upsell_offer_id)))`
- `CHECK (((upsell_product_id IS NULL) OR (upsell_product_id <> id)))`

**Indexes:**

- `CREATE INDEX products_store_status_idx ON public.products USING btree (store_id, status)`

---

### `progress`

*1 rows · 64 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `user_id` | uuid | no |  |  |
| `product_id` | uuid | yes |  |  |
| `lesson_id` | uuid | yes |  |  |
| `completed` | boolean | no | `false` |  |
| `position_seconds` | integer | yes |  |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `completed_source` | text | yes |  |  |
| `manual_override` | boolean | no | `false` |  |
| `course_id` | uuid | yes |  |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, user_id, lesson_id)`

**Foreign keys:**

- `FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE`
- `FOREIGN KEY (lesson_id) REFERENCES course_items(id) ON DELETE CASCADE`
- `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE`
- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

**Check constraints:**

- `CHECK ((completed_source = ANY (ARRAY['manual'::text, 'video'::text, 'download'::text, 'dwell'::text])))`

**Indexes:**

- `CREATE INDEX progress_course_idx ON public.progress USING btree (user_id, course_id)`

---

### `stores`

*1 rows · 112 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `slug` | text | no |  |  |
| `name` | text | no |  |  |
| `settings` | jsonb | no | `'{}'::jsonb` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (slug)`

---

### `templates`

*0 rows · 32 kB · RLS enabled*

> Designs saved from the builder. Same shape as a built-in: an array of Block, plus the band it was drawn on. Sanitized in, normalized out.

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `name` | text | no |  |  |
| `group` | text | no | `'Saved'::text` |  |
| `blocks` | jsonb | no | `'[]'::jsonb` |  |
| `band` | jsonb | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `kind` | text | no | `'template'::text` | template = inserting drops a copy; global = inserting drops a link, and editing changes ev… |

**Keys:** `PRIMARY KEY (id)`

**Check constraints:**

- `CHECK ((kind = ANY (ARRAY['template'::text, 'global'::text])))`

**Indexes:**

- `CREATE INDEX templates_store_idx ON public.templates USING btree (store_id, "group", name)`
- `CREATE INDEX templates_kind_idx ON public.templates USING btree (store_id, kind, name)`

---

### `trial_history`

*2 rows · 64 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `email` | text | no |  |  |
| `grant_key` | text | no |  |  |
| `first_trial_at` | timestamptz | no | `now()` |  |
| `created_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, email, grant_key)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Indexes:**

- `CREATE INDEX trial_history_lookup ON public.trial_history USING btree (store_id, email, grant_key)`

---

### `users`

*8 rows · 64 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no |  |  |
| `store_id` | uuid | no |  |  |
| `email` | text | no |  |  |
| `username` | text | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `is_admin` | boolean | no | `false` | Admin granted through the admin UI. ADMIN_EMAILS is the separate, higher break-glass list … |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, email)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

**Indexes:**

- `CREATE INDEX users_admin_idx ON public.users USING btree (store_id) WHERE is_admin`

---

### `visitors`

*75 rows · 112 kB · RLS enabled*

| Column | Type | Null | Default | Note |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `store_id` | uuid | no |  |  |
| `anon_id` | text | no |  |  |
| `landing_url` | text | yes |  |  |
| `referrer` | text | yes |  |  |
| `utm` | jsonb | no | `'{}'::jsonb` |  |
| `click_ids` | jsonb | no | `'{}'::jsonb` |  |
| `user_agent` | text | yes |  |  |
| `ip_hash` | text | yes |  |  |
| `first_seen_at` | timestamptz | no | `now()` |  |
| `last_seen_at` | timestamptz | no | `now()` |  |
| `created_at` | timestamptz | no | `now()` |  |

**Keys:** `PRIMARY KEY (id)`; `UNIQUE (store_id, anon_id)`

**Foreign keys:**

- `FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`

---

---

## Appendix: the raw DDL

The complete `pg_dump --schema-only` output for the `public` schema is beside
this file at [`database-schema.sql`](database-schema.sql) — 2,725 lines,
including every default, constraint, index, trigger and function body exactly
as Postgres reports them. Use it when you need the literal definition; use the
tables above when you need to understand the shape.

To regenerate both from the live database:

```bash
docker exec supabase-db-fuv6argrk5j8ogd4y3hi5tu0 \
  pg_dump -U postgres -d postgres --schema-only --schema=public \
  --no-owner --no-privileges > database-schema.sql
```
