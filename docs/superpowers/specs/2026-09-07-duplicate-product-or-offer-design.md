# Duplicate a product or an offer

**Date:** 7 September 2026
**Status:** approved in chat, awaiting implementation plan

## The problem

Selling the same thing a second way means rebuilding it. Content Engine is
being split into three offers that differ only in which channels they grant and
what they cost — and the only way to make the second and third is to retype
every field, re-enter both prices, and rebuild an eleven-section sales page
block by block.

`copyPage` already moves sections between two records that exist. Nothing
creates the record.

The gap shows up as soon as anyone tests a price, runs a campaign variant, or
splits a product. It is a two-minute job that takes an afternoon.

## Design

A **Duplicate** action on any product and any offer. It asks for the new
address up front, copies everything the record is made of, and leaves the copy
switched off.

### It asks for the key first

The dialog asks for the new slug (product) or key (offer) before it does
anything, pre-filled with a suggestion derived from the original —
`content-engine` → `content-engine-copy`.

Asking first rather than suffixing silently: the slug **is** the public URL, it
is unique per store, and a copy nobody renamed is a copy called
`content-engine-copy` on a live link. One extra field costs a moment; a wrong
URL costs a redeploy and any ad already pointing at it.

Validation is the rule the record already has —
`lib/offer-key.ts`'s `offerKeyProblem` for an offer, and the products' own slug
rule for a product — checked before anything is written, with the same wording
the main form uses. A key already in use is refused by name rather than as a
constraint violation.

### What it copies

**The record**, every column, except:

| Not copied | Why |
|---|---|
| `id`, `created_at`, `updated_at` | It is a new row |
| `slug` / `key` | The one thing the person was asked for |
| `stripe_product_id_*`, `stripe_price_id_*` | A duplicate is not the same product to Stripe. Sharing an id would point two records at one Stripe object and the first sale through either would rewrite the other's |
| `status` / `active` | The copy arrives as **draft**, and inactive |

**Its prices** — every row in `product_prices` / `offer_prices`, archived ones
included. An archived price is part of the record's history and dropping it
would make the copy quietly different from the thing it was copied from.

**Its courses** (products) — the rows in `product_courses`. The attachment
lives in a join table rather than on the product row, so nothing that copies
columns finds it, and a copy without it grants an empty library: the buyer pays
and receives nothing. The same courses, shared, not copies of them.

**Its sales page** — through the existing `copyPage`, which already rewrites
price labels for the destination.

**Its page settings** — `custom_css`, `custom_js`, `snippets`, `meta_title`,
`meta_description`, `share_image_path`. `copyPage` does not touch these and a
copy without them loses its SEO and any embedded script.

### The trap: price ids are referenced by id — but not all of them are ours

Three columns hold **arrays of price ids**, and they do **not** all mean the
same thing. This section said they did, and the first implementation followed
it faithfully; the correction is below.

**Names this record's own prices — must be remapped:**

- `offers.page_price_ids` — which of the offer's own prices its sales page
  offers. `app/(store)/p/[slug]/page.tsx` reads it against `soldOn.prices`.

**Names ANOTHER record's prices — must be carried verbatim:**

- `products.bump_price_ids`, `products.upsell_price_ids` — "Which of the bump
  offer's prices this product shows, in order" (migration 0049). They hold the
  price ids of the placement's offer *or product* (0056: "a placement names
  either an offer or a product, so the ids belong to whichever one it named"),
  never of the product carrying the column — the constraint
  `products_bump_is_not_self` makes naming itself impossible.

The prices are copied with **new ids**, so copying the *first* kind verbatim
leaves the duplicate pointing at the **original's** price rows: the copy's sales
page would show the original's prices, and there is no foreign key on these
arrays — they are `jsonb` — so the write succeeds and the damage is silent.

Remapping the *second* kind is the same bug in the other direction, and worse.
Those ids belong to a record the copy shares with the original (see "No deep
copy of what it points at"), so the old-id → new-id table built from this
record's own prices contains none of them and every one is dropped, writing
`[]`. An empty list is not inert: `lib/offer-prices.ts`'s `shownPrices` falls
back to the offer's **first live price**, so a product whose bump deliberately
showed the yearly comes out selling the monthly — a different add-on at a
different price, with no error and nothing on screen.

So: **the arrays that name this record's own prices are remapped through an
old-id → new-id table built while the prices are copied; the arrays that name a
shared record's prices are carried unchanged.** An id being remapped that does
not appear in that table is dropped rather than carried, because a dangling
reference is worse than a missing option. `lib/duplicate-write.ts` says which
column is which, per kind, in `priceIdColumns`.

The remapped columns are **seeded empty in the INSERT**, not carried and then
rewritten. The rewrite is a best-effort step, and an insert holding the
original's ids plus a rewrite that fails is exactly the silent state above.

The same division applies one level deeper. A "Ways to pay" block stores its
chosen `priceIds` inside `page_sections.content`, and `copyPage` carries content
verbatim. A block with **no `offerId`** sells whatever the page sells — which on
an offer's page is the prices that were just copied, so it is remapped; on a
product's page it is the sold-on offer's prices, which are shared. A block
**naming an offer** is a shared reference and is left alone.

### What it does not copy

Ownership, orders, order items and trial history. They belong to the original
and to the people in them. A duplicate has no customers.

### Where it lands

Straight into the editor on the copy, so the first thing anyone sees is the new
record with its new name, ready to rename properly.

## Errors

The whole thing is several writes and there is no transaction across them
through PostgREST. If the record is created and the prices fail, the result is a
draft product with no prices — visible, obviously wrong, and deletable.

So: **create the record first, and let everything after it be best-effort with
its failures reported.** The alternative — copying sections first — would leave
orphaned `page_sections` rows behind on failure, which nothing in the admin can
see or clean up, because that join is by convention and not by foreign key.

The reply says what was copied and what was not, rather than claiming success.
That obliges every best-effort step to be able to TELL. `getPageSettings`
answers a read failure with the same empty settings it gives a record that has
none, so the settings step asks whether the row exists before believing there is
nothing to copy — otherwise a transient failure reports a clean copy of a page
that has lost its SEO and its custom code.

One warning is not a failure at all. A **coded** upsell page is registered
against `offers.key` (`components/oto/registry.tsx`) and an unregistered key
falls back to the default layout, so an offer with `oto_template = "custom"`
produces a copy whose upsell page is a different page. That is inherent to
changing the key, and the person is told rather than finding out on a page a
buyer has already paid to reach.

## Testing

- The new record carries every field of the original except the exceptions above
- Stripe ids are empty on the copy, and the original's are untouched
- The copy is draft/inactive whatever the original was
- Prices are copied, archived ones included, with new ids
- **`page_price_ids` points at the COPY's prices**, and an id with no
  counterpart is dropped — and it is `[]` in the INSERT, not the original's ids
- **`bump_price_ids` and `upsell_price_ids` are unchanged on the copy**, from a
  fixture built the way a save builds it: a real bump offer with prices of its
  own, and the array naming one of THOSE
- A Ways to pay block with no offer named points at the copy's prices; one
  naming another offer is untouched
- The copy grants the same courses
- Sections and page settings arrive, and the original keeps its own
- A key already in use is refused before anything is written
- A duplicate of a record with no page produces a record with no page, not an
  error — and no page on the copy
- A best-effort step that fails reaches the caller as a warning, and a settings
  read that fails is not reported as a clean copy
- Duplicating an offer with a coded upsell page warns that the copy will not
  get it

## What this does not do

- **No Stripe objects.** The copy makes its own on first sale, as any new
  record does.
- **No deep copy of what it points at.** A duplicated product still names the
  same bump offer as the original; it does not duplicate that offer too.
  Duplicating a graph is a different feature and a surprising one.

## Open questions

None blocking.
