# Template library — brief

The goal, in the store owner's words: **"Add from library" opens a popup showing
previews of every design; you pick one and it drops into the page, then you
build from there.** Elementor's Templates panel and its saved-blocks library,
in this builder.

Two rules set at the outset:

- **Containers and blocks only.** No new block type unless it is 1000% needed.
  A design that cannot be expressed with a container, an image, a heading, text,
  a button and a divider is a design worth arguing about before it is a block
  worth writing. This is the same conclusion `lib/cards-to-blocks.ts` reached
  from the other direction: parts you can add and remove beat a block with
  forty controls.
- **Nothing is live until it is placed.** The library is a shelf. A template
  changes a page only when someone inserts it and saves. Everything on the
  shelf must nevertheless be in genuine working condition — a preview that
  renders but inserts broken is worse than no library.

---

## What a template is

An array of `Block` — exactly the JSON the page already stores. Nothing new.

That single decision carries most of the design:

- A template can be authored by building it in the builder and reading the JSON
  back out, rather than hand-writing block trees.
- Inserting is `insertBlock` in a loop, with `reid` so two copies of one
  template on one page do not share ids.
- A template that renders in the library preview renders on the page, because
  it is the same component doing both.

## Where templates live

**Built-ins: in code.** `lib/templates/*.ts`, one file per design, each
exporting a `Template { id, name, group, blocks }`. Version controlled,
reviewable in a diff, ships with the app, cannot be lost by a bad migration.

**Saved by the owner: in the database.** "Save this section as a template" is
the second half of what Elementor offers, and it cannot be a code file. A
`templates` table, store-scoped, holding the same JSON. Phase 3.

Both read through one `listTemplates()` so the popup never knows the
difference.

## Previews: rendered, never screenshotted

Screenshots go stale the day a block's default changes, and they need a
pipeline to produce. Instead render the template's real blocks into a fixed-
width box and scale it down with a transform.

The preview is then a test of the template as well as a picture of it, and the
library cannot show something the page will not draw.

This also settles the container question already fixed once in
`components/admin/block-editor.tsx`: the preview box must declare
`@container`, or every grid inside it collapses to one column and every
template previews as a stacked list.

## Phases

1. **The shelf.** `Add from library` in the builder's Add panel → popup →
   groups down the side, rendered previews in a grid, click to insert at the
   current drop point. Ships with a handful of real templates so it is
   exercised, not scaffolded.
2. **The designs.** Build the owner's screenshots as templates, one at a time,
   containers and blocks only. Each is a file plus a test that it inserts,
   round-trips through `normalizeBlocks`, and renders something.
3. **Saved and global.** "Save as template" writing to the database, then
   global blocks — which are a different thing from templates and should not be
   conflated: a template is a copy taken once, a global block stays linked, so
   editing it changes every page that uses it. That needs a reference in the
   page JSON and a resolve step at render, not just another row.

## Constraints that already apply

- **Nothing nests past one level.** `findBlock` descends into a row's columns
  and no further. A design needing a container inside a container cannot be
  built today — say so when one appears rather than faking it.
- **A row holds at most `MAX_COLUMNS` (6) columns.**
- **Never fabricate a trust signal.** Template copy is placeholder copy, and
  the rules in `STARTER_PROPS` apply: no invented testimonials, no buyer
  counts, no round numbers beside a noun. A figure is `00`, a quote reads as an
  instruction.
- **Every template's blocks must survive `normalizeBlocks`.** If a round trip
  changes them, the design changes on reload.
- **`blockRendersNothing` must not eat them.** It drops empty blocks on save.

## Open question for the first session

How the authoring loop is verified. Either the owner opens the library and says
what is wrong with each design, or the builder gains an export so a design can
be built once in the UI and read out as a file. The second is more work up
front and much faster per design after that — with a dozen screenshots waiting,
it likely pays for itself immediately.
