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

**Its sales page** — through the existing `copyPage`, which already rewrites
price labels for the destination.

**Its page settings** — `custom_css`, `custom_js`, `snippets`, `meta_title`,
`meta_description`, `share_image_path`. `copyPage` does not touch these and a
copy without them loses its SEO and any embedded script.

### The trap: price ids are referenced by id

Three columns hold **arrays of price ids**:

- `offers.page_price_ids` — which prices the sales page offers
- `products.bump_price_ids`, `products.upsell_price_ids`

The prices are copied with **new ids**, so copying these arrays verbatim leaves
the duplicate pointing at the **original's** price rows. The copy's sales page
would then show the original's prices, and buying one would charge against a
price belonging to another record.

Nothing fails. There is no foreign key on these arrays — they are `jsonb` — so
the write succeeds and the damage is silent.

**Every price id must be remapped through an old-id → new-id table built while
the prices are copied.** An id in one of these arrays that does not appear in
that table is dropped rather than carried, because a dangling reference is
worse than a missing option.

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

## Testing

- The new record carries every field of the original except the exceptions above
- Stripe ids are empty on the copy, and the original's are untouched
- The copy is draft/inactive whatever the original was
- Prices are copied, archived ones included, with new ids
- **`page_price_ids`, `bump_price_ids` and `upsell_price_ids` point at the
  COPY's prices**, and an id with no counterpart is dropped
- Sections and page settings arrive, and the original keeps its own
- A key already in use is refused before anything is written
- A duplicate of a record with no page produces a record with no page, not an
  error

## What this does not do

- **No Stripe objects.** The copy makes its own on first sale, as any new
  record does.
- **No deep copy of what it points at.** A duplicated product still names the
  same bump offer as the original; it does not duplicate that offer too.
  Duplicating a graph is a different feature and a surprising one.

## Open questions

None blocking.
