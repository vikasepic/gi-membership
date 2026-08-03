-- Order bump presentation.
--
-- The bump was a checkbox with a headline, a description and a price line: it
-- read as another form field rather than an offer, which is a poor showing for
-- the one element on the checkout that lifts order value.
--
-- Four columns, all presentation. Nothing here touches what is charged: the
-- price, the terms and the save badge stay derived from price_cents,
-- compare_at_cents, interval and trial_days, so a bump can never advertise a
-- discount the checkout does not apply.

alter table offers
  add column if not exists bump_banner  text,
  add column if not exists bump_bullets text[] not null default '{}',
  add column if not exists bump_note    text,
  add column if not exists bump_accent  text;

-- Three states, because "no banner" and "never configured" are different and
-- an existing offer must not silently lose its banner:
--   null  -> never edited; the honest default is shown ("Add to your order",
--            or "Free for N days" when there is a real trial)
--   ''    -> explicitly turned off
--   text  -> shown as written
comment on column offers.bump_banner is
  'Banner text. Null = show the derived default; empty string = no banner; otherwise shown verbatim.';

comment on column offers.bump_bullets is
  'Short proof points for the checkout. Separate from offers.bullets so the bump can be terser than the sales page.';

comment on column offers.bump_note is
  'The line tying this bump to what is being bought. Null hides the callout.';

-- Validated to a six-digit hex before it reaches a style attribute; see
-- normalizeAccent in lib/bump.ts. Null falls back to the AA-safe brand accent.
comment on column offers.bump_accent is
  'Accent colour as #rrggbb. Null uses BUMP_ACCENT_DEFAULT.';
