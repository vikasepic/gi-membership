# Offers grant courses

Approved in chat with the owner on 14 Oct 2026.

## What

An offer can give any number of courses directly, without a product in between.

- Offers → Grants gets a "Courses" checklist, the same as a product's.
- It works on every offer: with a product grant, an app grant, or on its own.
- Grant type gains a third choice, **Courses only**, for an offer that gives
  nothing else. Saving one with no course ticked is refused with a message.

## Data (migration 0095)

- `offer_courses (offer_id, course_id, sort_order)`, like `product_courses`.
- `offers.grant_type` allows `course`.
- `ownership_check` also accepts a row that names only `offer_id` (the row a
  courses-only offer writes). One such row per member and offer
  (`ownership_user_offer_courses_uq`).
- Applied to production by hand before the deploy.

## Access

A member reaches a course when they own a product that includes it (unchanged)
**or** hold a live (`active`, `trialing`, `past_due`) ownership row for an offer
that includes it. `coursesForUser` answers both; the library, course and lesson
pages, media, progress and the admin member page all read it.

Refunds and cancellations already mark rows by `offer_id` or subscription, so
an offer's courses go when the offer does.

Not changed: product-granted courses still ignore the row's status.

## Buying

`grantOfferOwnership` writes a row with `offer_id` (no product, no app) for a
courses-only offer; product and app offers already write rows carrying
`offer_id`. A courses-only offer is eligible to buy unless the member already
holds a live row for it.

## Known edge

A product row keeps one `offer_id`. If a member gets the same product through
two offers, the second overwrites the first, and courses attached only to the
first offer stop showing. Courses-only offers do not have this problem.
