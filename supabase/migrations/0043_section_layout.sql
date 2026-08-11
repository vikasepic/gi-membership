-- How wide a band's content is, and how much air it sits in.
--
-- Every band has been `px-6 py-12 md:py-16` around an inner `max-w-[1040px]`
-- since the page existed. That is a good measure for prose and the wrong one
-- for a design whose ground runs to the screen edge — a photograph that stands
-- on the band's edge, a colour that bleeds past the reading column. Until now
-- the only way to reach past 1040px was a negative margin on a block, which is
-- a trick: it works, and it leaves a number nobody typed sitting in the
-- inspector for the next person to wonder about.
--
-- One jsonb column rather than four scalars, because these four values are one
-- decision — "how does this band hold its content" — and they are read
-- together, written together, and never queried apart.
--
-- Null is not a default; it IS the current behaviour. A band that has never
-- been touched stores nothing and renders exactly what it rendered before this
-- migration, which is the only safe way to add a layout knob to live pages.

alter table page_sections
  add column if not exists layout jsonb;

comment on column page_sections.layout is
  'How the band holds its content: {width: boxed|full|custom, maxWidth, padX, padY}. '
  'Null means the built-in measure — 1040px, px-6, py-12/md:py-16 — exactly as before.';
