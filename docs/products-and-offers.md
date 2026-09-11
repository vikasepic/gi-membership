# Products and offers — why there are two, and what to do about it

Written 16 Aug 2026, after the question "why do we even need two?". Nothing here
is built. This is the argument and the plan, so the decision can be made once
and the work can be checked against something.

---

## What is actually true today

Production holds **3 products** and **3 offers**. Of the offers, **two grant an
app subscription** (Content Engine, Funnel App) and one grants a product.

|  | Product | Offer |
|---|---|---|
| What it grants | courses, delivered by the library | a product **or** an app subscription |
| Its own page | `/p/slug`, plus a storefront card | `/o/key`, plus an OTO page |
| Ways to pay | yes, since 16 Aug | yes, since 13 Aug |
| Copy it carries | title, tagline, sales page | headline, bullets, bump copy, accept/decline labels |
| Lifecycle | owned once bought | trial / active / past_due / cancelled, with CRM tags |
| Where it is sold | its own page and checkout | a bump, an upsell, its own page |

## The split used to be defensible. It is not any more.

Until this week the line was clean: **a product had one price, an offer had
many.** Wanting to sell a course monthly meant building an offer.

Products now have the same price model — the same table shape, the same editor,
the same rules. That difference is gone, and with it the main reason to look at
the two and see two different things.

**What is left is one real difference and one accident.**

The real one: **an offer can grant something that is not in the course
catalogue.** Two of the three do. That is the Funnel App and Content Engine
integration — a signed provision call to another application, an entitlement
key kept in sync, a subscription whose cancellation has to reach a system this
one does not own. A product cannot do any of that.

The accident: **placements store an `offer_id`.** That is the only reason a
product cannot be a bump or an upsell. Not a concept — a column.

---

## The question that decides everything

**Is "access to Funnel App" the same kind of thing as "The Idea Vault"?**

From where the buyer stands, yes. Both are things they pay for and then use. The
difference is only where the door is: one opens in the library, one opens in
another web app.

From where the system stands, less so. A course grant is a row. An app grant is
a conversation with software this store does not control — provision the user,
map an entitlement key, push state on every change, and get it right when they
cancel, because the other app will happily keep serving somebody this one has
stopped billing.

So the honest answer is: **the same kind of thing to sell, a different kind of
thing to deliver.** That distinction belongs on the delivery, not on the sale.
It is the same shape as a product that grants two courses instead of one — the
selling is identical, the fulfilment differs.

Which is the argument for one catalogue.

---

## Option B, stated properly

**One thing you sell. One or more ways to pay. One or more things it grants.
Plus, separately, the copy used to pitch it somewhere.**

Concretely:

- A **product** is the sellable thing. It keeps its slug, page, card, prices.
- A product **grants** courses, or an app, or both. `product_grants` replaces
  the two-columns-and-a-type arrangement offers use today.
- An **offer** stops being a thing and becomes a **pitch**: a headline, bullets,
  accept/decline labels, an OTO layout, and which product it sells on which
  price. A bump is a pitch. An upsell is a pitch. `/o/key` is a pitch.

What that buys:

- Any product can be a bump or an upsell, because a pitch names a product.
- One place to look for "what do we sell", instead of two lists that overlap.
- One price model, one ownership row shape, one lifecycle.
- The same product can be pitched three different ways without being duplicated
  — which is the thing the old `alt_offer_id` pairing was flailing at.

What it costs — and this is the part worth being blunt about:

- **The OTO page assumes an offer.** Its layout, its templates, its copy fields,
  its token. That is the biggest single body of code to move.
- **App delivery assumes an offer.** `grantOfferOwnership`, the entitlement
  mapping, the reconciler, `pushOwnershipStateToApps` and the CRM lifecycle tags
  all key off `offer_id`.
- **`ownership` has both `offer_id` and `product_id`,** and every read of it
  would need to mean one thing rather than two.
- It is the money path. Every slice needs its own end-to-end run in test mode.

---

## The plan, in slices that each stand alone

Ordered so that value lands early and nothing is a bet on the next slice.

**Slice 1 — a placement can name a product.**
Bump, upsell and page pickers accept a product or an offer. Placement stores
which kind. Nothing merges; the wall comes down where it is actually hit.
*Removes the reported friction. Strict subset of everything below.*

**Slice 2 — a product can grant an app.**
`product_grants`, seeded from what products already grant. A product may then
deliver a course, an app, or both — and the two app offers become products.
*After this, offers grant nothing that products cannot.*

**Slice 3 — pitches become their own thing.**
A `pitches` table: headline, bullets, labels, layout, and a pointer at a product
and a price. Existing offers are copied into it. Both are read; nothing is
removed. *Reversible up to here.*

**Slice 4 — the OTO page reads a pitch.**
The upsell, its templates and its token move across. The largest slice, and the
one to do slowly.

**Slice 5 — ownership means one thing.**
Every row points at a product. App entitlement follows the product's grants.
The reconciler, the CRM tags and the apps sync all read one shape.

**Slice 6 — offers come out.**
The table, the admin screens, `/o/key` redirects to `/p/slug`.

Slices 1–3 are additive and safe to stop after. Slice 4 is the commitment point.

---

## What I would do

Slice 1 now, because it costs little and fixes the thing that prompted the
question. Then decide 2–6 on evidence: if the store keeps selling apps, the
merge is clearly right; if apps turn out to be a one-off integration that never
grows, two concepts is a defensible price for not rewriting the OTO page.

The one thing I would not do is leave it as it is *and* keep adding features to
both sides. That is how the two drift into needing a translation layer, and the
translation layer is what nobody can ever remove.

---

## Answered, 16 Aug — the merge is on

**1. More apps are coming, as many as there turn out to be.**

That settles it. App-granting is not an exception to work around; it is a shape
the store will keep doing. Every new app under the current model means another
offer that exists only because a product cannot grant an app — the two lists
drift further apart with each one, and the reason for the split gets weaker
every time it is used.

**2. "A product could grant an app too" — correct, and better than that.**

Worth one correction, because it makes the case stronger rather than weaker: an
offer today grants a product **or** an app, never both. `grant_type` is
`'product' | 'subscription'` and `grantOfferOwnership` branches on it.

So `product_grants` as a LIST is not parity with offers — it is more than offers
can do. "Buy this and get the course AND the app" is currently impossible; under
the merged model it is a second row. That is exactly the bundle case, and it
arrives free.

**3. `/o/key` is not published, and redirects should exist anyway.**

So slice 6 has nothing to break. And the redirect section is worth building on
its own merits — see slice 0 below, which is now first because it is small,
useful immediately, and removes the only external risk from the last slice.

---

## The decision

**Merge.** One catalogue of products; offers become pitches. The answers above
remove both reasons to hesitate: apps are permanent, so the distinction is not
worth keeping, and nothing outside links to `/o/key`, so the ending is clean.

The slices below stand, with one added at the front.

**Slice 0 — a redirects table in settings.**
`from` path to `to` URL, matched before the router 404s. Useful the day it
ships — any dead link, any renamed slug, any campaign URL — and it is what makes
retiring `/o/key` a redirect rather than a deletion.

Everything else is unchanged, except that slice 2 gets bigger and better: a
product grants a LIST, so a product can grant a course and an app together.

---

## Where an order's campaign comes from

Every order carries `utm_first`, `utm_last` and `referrer` (migration 0079),
snapshotted at creation from the `gi_utm` cookie the proxy maintains. The
product checkout reads the cookie in its action; the offer checkout stashes
the labels in the intent's metadata at start and reads them back at
completion, because completion also runs from the Stripe webhook; a renewal
copies them from the origin order. `lib/attribution.ts` is the one place the
rules live — seven keys, `@` refused, 120 characters. The same helper turns
them into Stripe metadata (`utm_*`, `first_utm_*`, `referrer`) on every
intent, subscription and charge, and `buyerContextFor` carries them onto
every ad event. The Orders page shows them.

The traffic dashboard buckets a page VIEW with `sourceOf` and the ORDER it
produces with `sourceOfOrder`. The two read different inputs — a view has a
query string and a click id, an order has only `utm_last` and a referrer,
because it is created after the click, not during it — but both now call one
private `bucketOf` in `lib/traffic-source.ts`, which is the only place the
ranking (campaign beats source beats a click id beats a referrer beats
`direct`) is written down. That is what makes a campaign's views and its
sales land in the same row: `sourceOf` and `sourceOfOrder` used to rank
fields independently, and a link carrying `utm_source` with no
`utm_campaign` bucketed its view as `direct` and its sale under the source
name. Routing both functions through `bucketOf` is what closes that gap, not
a convention either function has to remember on its own.

### Where visits come from, and what the four screens answer

An order's attribution above starts at checkout. Visits start earlier: a row
is written by `record_visit` (`lib/visits.ts`, migrations 0080/0081) from the
store LAYOUT, so every page is an entry point — home page included, unlike
the old `page_counts` counter, which only five paths ever called. Each new
browser (the `gi_anon` cookie) gets one row, reused across a 30-minute idle
window rather than one row per page view, and carries the landing path and
query as the link actually was, the first and last UTM seen, the referring
host, device/browser/os, and a salted IP hash that stays null until
`ATTRIBUTION_IP_SALT` is set — the safe failure, not an error. `visit_steps`
marks checkout, upsell and purchase against the visit that reached them.
Recorded for everyone, with no consent gate: a landing URL and a campaign
describe the ad, not the person. Click ids are the one thing that never
leaves this table for a client to read — `lib/visit-filter.ts` and
`lib/visit-view.ts` are the pure, non-`server-only` half of the split that
keeps them off a browser-rendered row. Full design in
`docs/superpowers/specs/2026-09-11-visit-attribution-design.md`.

Four screens under `/admin/attribution` read it back. **Campaigns**
(`/admin/attribution`) answers "which campaign, and did it sell" — one row
per source/medium/campaign/adset/ad with its visits, checkouts, orders and
revenue. **Referrers** and **Landing pages** (both on
`/admin/attribution/sources`) answer "which outside site sent them" and
"which page did they land on", `direct` its own row in the first so neither
table hides a share of traffic by omitting it. The **visit log**
(`/admin/attribution/visits`) answers "what did this one visitor do" — every
visit, one row, filterable by campaign/host/device/outcome — the closest
thing here to WP Statistics' or GA4's visitor detail view. All four start
from the day `record_visit` first ran in production; nothing earlier can be
recovered.
