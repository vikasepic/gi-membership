-- Long-form sales-page content for an upsell.
--
-- A short upsell needs a headline and bullets. A sales page needs stats, a
-- problem, benefits, testimonials, a price comparison and an FAQ — and which
-- of those a given launch uses varies, so a column per section would mean a
-- migration per launch.
--
-- One jsonb column instead, with a known shape written by the admin form. Not
-- free-form: lib/oto-sections.ts parses simple pipe-separated lines into it, so
-- the editor stays a textarea rather than becoming a JSON editor, and the
-- template can trust what it reads.
--
--   {
--     "stats":       [{ "value": "~2 hrs", "label": "Time required" }],
--     "benefits":    [{ "title": "…", "body": "…" }],
--     "testimonials":[{ "name": "…", "result": "…", "quote": "…" }],
--     "comparison":  [{ "option": "…", "cost": "…", "time": "…" }],
--     "faq":         [{ "q": "…", "a": "…" }],
--     "problem":     "headline\n\nparagraphs"
--   }
--
-- Every key is optional. A section with no content is not rendered, which is
-- what lets one template serve a five-section page and a fifteen-section one.

alter table offers
  add column if not exists oto_sections jsonb not null default '{}'::jsonb;

comment on column offers.oto_sections is
  'Long-form sales page sections for the `sales` upsell template. Empty sections are skipped.';

-- 'sales' joins the existing layouts.
alter table offers drop constraint if exists offers_oto_template_check;
alter table offers
  add constraint offers_oto_template_check
  check (oto_template in ('short', 'visual', 'long', 'sales', 'custom'));
