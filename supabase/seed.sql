-- Seed one store, the Content Engine app registry row + offer, and a clearly
-- marked placeholder $27 product. Deterministic UUIDs so re-seed is stable and
-- app code / tests can reference them. Idempotent.

-- Store ------------------------------------------------------------------
insert into stores (id, slug, name, settings)
values (
  '00000000-0000-0000-0000-000000000001',
  'greater-inside',
  'Greater Inside',
  '{"currency":"usd","support_email":"connect@vikasbendha.com"}'::jsonb
)
on conflict (id) do nothing;

-- Content Engine app registry --------------------------------------------
-- shared_secret is a placeholder; the real secret is injected from env at
-- deploy time (never commit the live secret).
insert into apps (id, store_id, key, name, base_url, entitlement_mapping, shared_secret)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'content-engine',
  'Content Engine',
  'https://app.greaterinside.com',
  '{"content-engine":"content-engine"}'::jsonb,
  'REPLACE_WITH_ENV_SECRET'
)
on conflict (id) do nothing;

-- Placeholder $27 front-end product --------------------------------------
-- The real product is not yet defined by the client; edit this in admin.
insert into products (
  id, store_id, slug, title, tagline, description, type,
  price_cents, currency, media_mode, status, is_placeholder, sort_order
)
values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-000000000001',
  'placeholder-offer',
  'Placeholder Product ($27)',
  'Replace me in admin once the real front-end offer exists.',
  'This is a placeholder for the not-yet-defined $27 digital product. Editable in admin: title, price, type, media, and its bump/upsell offer slots.',
  'pdf',
  2700,
  'usd',
  'upload',
  'published',
  true,
  0
)
on conflict (id) do nothing;

-- A few demo products so the storefront reads as a real catalog. Delete these
-- in admin once real products exist; they carry no offer slots.
insert into products (store_id, slug, title, tagline, description, type, price_cents, currency, media_mode, media_embed_url, status, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'grounding-audio', 'Grounding Audio Session', 'A 20-minute guided audio to reset your focus.', 'Demo audio product showing upload-based delivery.', 'audio', 1900, 'usd', 'upload', null, 'published', 1),
  ('00000000-0000-0000-0000-000000000001', 'deep-work-course', 'The Deep Work Course', 'Six short videos on doing the work that goes deeper.', 'Demo video product showing embed-only delivery.', 'video', 4900, 'usd', 'embed', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'published', 2),
  ('00000000-0000-0000-0000-000000000001', 'field-guide', 'The Field Guide', 'A field-tested PDF playbook you keep coming back to.', 'Demo PDF product.', 'pdf', 2700, 'usd', 'upload', null, 'published', 3)
on conflict (store_id, slug) do nothing;

-- Content Engine offer: $47/mo, 7-day trial ------------------------------
insert into offers (
  id, store_id, key, name, grant_type, grant_app_id, grant_entitlement_key,
  billing_type, interval, interval_count, trial_days,
  price_cents, currency, headline, description, bullets,
  accept_label, decline_label
)
values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-000000000001',
  'content-engine-monthly',
  'Content Engine — Monthly (7-day trial)',
  'subscription',
  '00000000-0000-0000-0000-0000000000a1',
  'content-engine',
  'recurring',
  'month',
  1,
  7,
  4700,
  'usd',
  'Add Content Engine free for 7 days',
  'Keep the momentum going. Try Content Engine free for a week, then $47/mo. Cancel anytime.',
  '["7 days free, then $47/mo","Cancel anytime","Signed straight into the app"]'::jsonb,
  'Start my 7-day trial',
  'No thanks, maybe later'
)
on conflict (id) do nothing;

-- Attach the Content Engine offer to both slots of the placeholder product.
-- Order bump on checkout; full-page OTO if the bump is declined.
update products
set bump_offer_id   = '00000000-0000-0000-0000-0000000000c1',
    upsell_offer_id = '00000000-0000-0000-0000-0000000000c1'
where id = '00000000-0000-0000-0000-0000000000b1';

-- Built-in apps ----------------------------------------------------------
-- Internal apps run inside this codebase (lib/builtin-apps/registry.ts). No
-- host, no secret: access is the ownership row, read directly.
insert into apps (id, store_id, key, name, kind, entitlement_mapping, channels, active)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001',
   'micro-product-builder', 'Micro-Product Builder', 'internal', '{}'::jsonb, '{}'::text[], true),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001',
   'hook-generator', 'Viral Hook Generator', 'internal', '{}'::jsonb, '{}'::text[], true)
on conflict (id) do nothing;
