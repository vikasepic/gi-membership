# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Buyers of low-ticket digital products from Greater Inside (Ajit Nawalkha's
audience): a mix of coaches, consultants, creators and solo founders. Confirmed
decision: **the pages lead with the offer and its mechanism, not with a
persona.** The list is broad enough that a page addressed to one segment
excludes the rest, so each reader should recognise themselves in the mechanism
rather than in a description of themselves.

Their situation on the upsell surface specifically: they paid for a small
digital product seconds ago, their card is on file, and they are in a short
window of "I am going to fix this" motivation.

## Product Purpose

A store and upsell funnel at `grow.greaterinside.com` selling low-ticket digital
products, which then offers a subscription to Content Engine ($47/month after a
7-day trial). Success is a completed purchase followed by an accepted upsell,
without the buyer feeling sold to twice.

## Positioning

Content Engine tracks the reels and carousels already performing in the buyer's
niche, extracts the hooks behind them, and drafts new carousels in the buyer's
own voice. The claim a neighbouring product could not truthfully copy: it starts
from what is *already working in that specific niche* rather than from a blank
page or a generic template.

## Operating Context

- The upsell page is reached **only** after a successful payment, via a signed,
  single-use, short-TTL token. It is never linked, never crawled, never revisited.
- The buyer's card is already saved, so accepting is one click with no card entry.
- Buyers arrive from a checkout on the same domain, seconds earlier.
- Products and offers are edited in an admin; page content is data, not code.
- Content Engine is a separate app the buyer is signed into from their library.

## Capabilities and Constraints

- Offer content is per-offer data: headline, description, bullets, body copy,
  stats, problem, benefits, testimonials, comparison rows, FAQ, image, video.
  **Any section may be empty and must then be skipped.**
- Four upsell layouts exist, selected per offer in admin, plus a `custom` slot
  for a coded page keyed to one offer.
- Accept/decline is one shared server action across every layout. Layout may
  never own the money path.
- Tailwind v4 with semantic tokens in `app/globals.css`; light and dark themes.
- No image assets exist for Content Engine. Offers carry an optional image or
  video URL that is usually empty.

## Brand Commitments

- Store identity, binding on store surfaces: terracotta `#c8653d` (primary and
  CTA), navy `#11325b`, plum `#832a63`, cream `#fafaf8` ground, ink `#0b0b0d`.
  Inter for display, Poppins for body.
- **Confirmed decision: upsell/OTO pages are campaign surfaces and may hold
  their own visual world**, distinct from the store, provided the seam from
  checkout does not read as a different company.
- **Anti-reference, confirmed: playful / consumer.** No mascotry, no big rounded
  friendly shapes, no illustration-led warmth, no bright candy palette.
- Anti-reference, from rejected work: restrained typographic pages that read as
  tasteful and convert nothing. Two attempts were rejected as "all just text, no
  colours, no sections".
- **Standing commitment: the conventional long-form info-product sales page,
  executed at full fidelity.** Offered a dealt direction and two challengers,
  the client chose the category standard deliberately. It is not a fallback and
  is not to be re-litigated or quietly stylised: no irony, no smuggled quirk.
- **Craft bar: `greaterinside.com/book-writer/mindvalley`** — the client's own
  launch page. Same section order, same density, same proof-heavy rhythm, built
  to that finish. Chosen because it already converts for this audience and keeps
  the upsell continuous with their other launches.

## Evidence on Hand

- Real product copy for the Content Engine upsell, written by the client:
  stats, problem, six named capabilities (Competitor tracking, Hook Bank,
  Carousel drafts, Paste a post, Planning board, Weekly digest), a four-row
  price comparison, six FAQs. Loaded into the offer record.
- **No testimonials exist.** None may be invented; the section stays empty until
  the client supplies real quotes with permission.
- **No product screenshots or imagery exist** for Content Engine. Any visual
  weight must come from typography, colour, and composition, or from assets the
  client later supplies.
- Live prices: product $4.99, Content Engine $47/month with a 7-day trial.

## Product Principles

1. **An offer is never shown to someone who already has it.** Enforced in code;
   design must not reintroduce it.
2. **The decline is as findable as the accept.** A hidden decline converts once
   and refunds twice.
3. **Say the charge out loud**, including what happens when a trial ends. Silent
   day-8 billing is the complaint this category earns.
4. **Content is data.** Every layout must survive missing sections, long copy,
   and no imagery without looking broken.
5. **One click, no re-entry.** The card is on file; nothing may imply otherwise.

## Accessibility & Inclusion

WCAG AA contrast for all text, verified numerically rather than by eye. Every
animation needs a reduced-motion path. The FAQ uses native `<details>` so it
works before hydration and is keyboard accessible without JavaScript.
