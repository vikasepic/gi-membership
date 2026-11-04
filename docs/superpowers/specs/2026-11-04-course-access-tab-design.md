# Course access tab: who has a course, add or remove one person

Asked for 3–4 Nov 2026 by the owner: "in the admin when we are checking any
course, a tab where we can see who has access to the course, a list, and add
or remove people directly from there."

## Why

Today the only way to answer "who can open this course" is to open every
member. The only way to give one person a course is to grant a whole product
or offer, which can carry other courses with it (Hidden Demand Gap Finder and
Product Validator share one product). And the only way to take a course away
is to revoke the purchase it came with, which takes everything in that
purchase.

## What the owner decided

- **Add gives exactly that one course.** No product, no offer, no other
  course comes with it.
- **Remove takes away exactly that one course**, whatever gave it. Someone who
  bought a product keeps everything else the product gives. Billing is not
  touched.
- Adding is by email. An unknown email creates the member the same way
  "Add member" does (`createMember`), signing in by magic link. No email is
  sent by this feature, same as Add member today.
- **A new purchase lifts a removal** (owner, 4 Nov). Someone removed from a
  course who then pays for a product or offer that includes it gets the
  course back, so nobody is charged for something they cannot open. A renewal
  of something they already hold does not count: a monthly charge never
  undoes a removal.

## My calls (marked so the owner can check them)

- A person removed from a course stays listed at the bottom of the tab under
  **Removed**, with **Give back**. Only Give back or a new purchase lifts it.
- An admin grant from the member page (Grant product, Grant offer) does not
  lift a removal. It is not a purchase, and Give back is one click away.
- The tab is called **Access** and sits after Cover & files.
- No new labels on the member page. It already lists a member's courses
  through `coursesForUser`, so a hand-added course appears there and a removed
  one disappears there, with no extra work.

## How it works

### Data: one new table (migration 0098)

```
course_access
  store_id    uuid not null references stores(id)
  user_id     uuid not null references users(id) on delete cascade
  course_id   uuid not null references courses(id) on delete cascade
  kind        text not null check (kind in ('grant', 'remove'))
  granted_by  text not null          -- admin email, as ownership.granted_by
  created_at  timestamptz not null default now()
  primary key (user_id, course_id)
```

One row per person and course, so a person is either hand-added or removed,
never both. Lock it the way 0067 locked every table: `revoke all ... from anon,
authenticated` AND `enable row level security` with no policies. 0067's
default-privileges revoke only covers tables created by the role that ran it,
so 0098 must do both itself. `notify pgrst, 'reload schema';`
at the end. Applied to production by hand before the push.

Check `stores`/`users` table and column names against 0001 before writing
the migration; the shape above is the intent.

### The one rule, in `coursesForUser` (lib/courses.ts)

Every access check already goes through `coursesForUser` or
`userOwnsCourse` (library, lesson pages, media routes, progress API, member
page). Change only there:

  courses = (from products owned + from offers held + course_access 'grant')
            minus course_access 'remove'
  then, as today, only published courses.

A `remove` row wins over every source. A `grant` row is the same as owning the
course.

Trap: `coursesForUser` returns `[]` early when the member owns no product or
offer (lib/courses.ts:214). Read `course_access` before that line, or a
hand-added course on its own is never seen.

Readers that go straight to `ownership` and are deliberately left alone
(builder check, 4 Nov):
- lib/members.ts:70, the members list column, counts products, not courses.
- The library's "Your purchases don't have content attached yet" box
  (app/(store)/library/page.tsx:246) shows for a buyer whose every course was
  removed. My call: leave it; removing everything someone bought is rare and
  deliberate.
- `ownsProduct` gating product-level files (app/api/asset, library/actions):
  product files are not course content.
- The "More from" shelf (lib/library-apps.ts:252) keeps offering a product to
  someone hand-added to one of its courses. My call: correct, the product may
  give more than that course.

### A purchase lifts a removal

One helper, `liftRemovals(userId, { productId?, offerId? })`: delete the
user's `remove` rows for the courses that product (`product_courses`) or
offer (`offer_courses`) gives. Called right after a purchase writes or
revives its ownership row:
- `finalizeOrder`, the base product grant (lib/checkout.ts:1233).
- `grantOfferOwnership` (lib/checkout.ts:1620), every branch, whatever its
  `source`. Its only callers are purchases (bump, OTO, and the offer page,
  which passes `"grant"`: lib/offer-checkout.ts:801); admin grants go through
  `grantOfferAccess` instead. An offer granting a product lifts that
  product's courses and the offer's own.

Not called from renewals (subscription sync only moves `status`), from
`grantProduct` / `grantOfferAccess` (admin grants), or from app sync.

Best-effort, after the ownership write, like `tagAccessGranted`: the card is
already charged and a failed delete must not fail a paid order. Log it with
`console.error`; the admin can still Give back by hand.

### The tab: `app/admin/courses/[id]/(tabs)/access/page.tsx`

Header: count of people with access, and an add form (email, optional name,
"Add").

One table, everyone who can open the course now. Per row: name and email
(linking to `/admin/members/<id>`), **how** they have it, **since** (earliest
date of the sources), and **Remove**.

"How" lists every source, because a person can hold it several ways:
"Bought <product name>" (or "Granted <product name>" when the ownership row's
`source` is `grant`, as the member page already tells apart, lib/members.ts:466),
"<offer name>" (offer held), "Added by <admin>". Only
ownership rows that still give access count (status not `canceled`), the same
rule `coursesForUser` uses.

Below, **Removed** (only when there are any): name, email, removed by, when,
**Give back**.

Reading the list: ownership rows (status not canceled) whose product is in
`product_courses` for this course or whose offer is in `offer_courses` for it,
plus `course_access` rows for it. Use `allRows` (lib/traffic.ts) for the
ownership read; PostgREST truncates at 1000 silently.

### Actions (server actions, each calls `requireAdmin()` first)

- **Add (email, name):** `createMember`, then upsert `course_access`
  `(user, course, 'grant', admin email)`. Upsert means adding a removed person
  turns their row back into a grant. If they already have it through a
  purchase and have no row, still write the grant (harmless, and it survives
  a later refund; the owner asked for "add", which is a promise).
  Message: "Added x@y.com" or "x@y.com already had this course".
- **Remove (user):** if the person still has the course through a product or
  offer, upsert `(user, course, 'remove')`. If their only access was a hand
  grant, delete the row instead, so nothing lingers.
- **Give back (user):** delete the `remove` row. Their purchase gives it again.

### Not in scope

- Bulk add (paste many emails), CSV export, emailing the person.
- Changing what a product or offer contains.
- Course access through connected apps (apps do not carry courses).
- Admins: they already open every course through their own bypass; the list
  shows them only if they hold access like anyone else.

## Tests

- `coursesForUser`: a grant alone gives the course; a remove beats a product
  and beats an offer; a remove on one course leaves the product's other course
  open; a canceled purchase plus a grant still gives it.
- The list: each source is labelled; a canceled ownership is not listed;
  removed people appear only under Removed.
- `liftRemovals`: a purchase of a product that includes the course deletes
  the remove row; one that does not include it leaves the row; an offer
  granting a product lifts the product's courses; an admin `grantProduct`
  lifts nothing.
- Actions: add creates or reuses the member and upserts; remove writes
  `remove` when a purchase exists and deletes when only a grant existed; give
  back deletes.
- Integration tests follow the repo rules: `zz-` fixtures with a timestamp,
  ordered picks, cleanup in `afterAll` in FK order, inside
  `describe.skipIf(!canRun)`.

## Shipping order

1. Migration 0098 applied on production by hand, then `notify pgrst`.
2. Full suite (CI-style, `.env.local` moved aside), then the 60-second notice,
   then push.
