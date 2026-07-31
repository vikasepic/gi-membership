-- Per-offer upsell page design.
--
-- `oto_template` picks the layout. 'custom' hands rendering to a component
-- registered against the offer's key in components/oto/registry.tsx — that is
-- the escape hatch for a launch that needs a bespoke page, without every
-- ordinary offer needing a developer.
--
-- The extra content columns exist because the three templates need more than
-- the bump does: a bump is one checkbox, an upsell page is a page.

alter table offers
  add column if not exists oto_template  text not null default 'visual',
  add column if not exists oto_body      text,
  add column if not exists oto_video_url text;

-- Constrained rather than free text: an unknown template would render nothing,
-- and the failure would appear on the highest-value page in the funnel, after
-- someone has already paid.
alter table offers
  drop constraint if exists offers_oto_template_check;
alter table offers
  add constraint offers_oto_template_check
  check (oto_template in ('short', 'visual', 'long', 'custom'));

comment on column offers.oto_template is
  'Layout for /checkout/oto: short | visual | long | custom (custom = coded component keyed on offers.key).';
comment on column offers.oto_body is
  'Long-form copy for the long template. Blank lines separate paragraphs.';
comment on column offers.oto_video_url is
  'Embed URL for the visual template. Falls back to image_url when empty.';
