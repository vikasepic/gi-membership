-- Editable copy for a bespoke upsell page.
--
-- The Content Engine page had every string written into the React component, so
-- the only way to change a headline was a code change and a deploy. That is
-- fine for layout and wrong for copy: copy is the thing that gets rewritten
-- most often and by the person least able to deploy.
--
-- One jsonb map of key -> string (or string[]). Keys are declared in
-- lib/oto-content.ts alongside their label, type and DEFAULT. An absent key
-- falls back to that default, so the page is never blank, an offer that has
-- never been edited looks exactly as it does today, and a key added later
-- starts life with sensible copy rather than an empty box.

alter table offers
  add column if not exists oto_page jsonb not null default '{}'::jsonb;

comment on column offers.oto_page is
  'Overrides for the bespoke upsell page copy. Key -> string or string[]. Missing keys use the default in lib/oto-content.ts.';
