# Home page as steps

Approved by the owner on 5 Oct 2026 from mockup A of the Home Page Redesign canvas
("Find the idea. Build the product. Get it seen."), after asking that the top
image not lead with one product and that new offers keep working.

## What it is

- **Step list.** It lives in `stores.settings.homeSteps` (Settings › Home steps). The default is three steps: Idea, Build, Get seen.
  - Each step has a short name for the staircase, a heading and one line.
  - Each step has an id. It is made once and never edited.
- **Each offer and product names its step** by that id: `offers.home_step` and `products.home_step` (migration 0093). The "Home page step" select sits beside Home page position on the offer form and beside Status on the product form.
- **Two storefront blocks** draw the same list. It is built by `buildHomeSteps` (`lib/home-steps.ts`) and resolved into `store.steps` by both `app/(store)/page.tsx` and `lib/storefront-preview.ts`.
  - **Step sections:** each step's words beside its products, then "Everything else".
  - **Step staircase:** one column per step, each a shade deeper, every product the same size, with at most N pictures per step and "+N more" linking to the step.

## Rules

- **Nothing disappears.** No step, or the id of a step since removed, puts the thing under "Everything else". The admin selects keep a removed step's id selected (labelled as removed), so saving an offer for another reason does not move it.
- **Empty steps hide.** Numbering happens after that, so the page never says "Step 1, Step 3".
- **Which things appear:**
  - Offers with a Home order and published products, the same set the catalogue and memberships blocks use.
  - Offers come first in a step, by Home order, then products in catalogue order.
  - A product an offer on the page already sells is listed once.
- **Owned things are not sold again.** They read "In your library" and link into it.
- **A page that uses either step block gets the 1240px store width** (`store-wide`), as the library does. Other built pages keep their column, so the live page did not change shape on deploy.
- **The page itself is a draft.** It is written into the store bands' `draft` column and goes live only through Publish in `/admin/home`.

## Why the list is in settings, not in a block

Offers point at a step from their own admin page. The builder's list control gives items no ids, so a block-held list could only be referenced by name or position, and renaming or reordering a step would silently move products. Settings saves are live rather than drafted. That is acceptable for a list that changes rarely, and it is the same as every other setting.
