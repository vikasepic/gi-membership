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

## Open questions for the owner

1. Will there be more connected apps, or are Content Engine and Funnel App the
   set? This decides whether app-granting is a first-class shape or an exception.
2. Does an offer ever need to sell something a product could not — a bundle
   across two products, say, or access without a catalogue entry?
3. Is `/o/key` an address anybody has published? If those links are in ads or
   emails, slice 6 needs redirects rather than deletions.
