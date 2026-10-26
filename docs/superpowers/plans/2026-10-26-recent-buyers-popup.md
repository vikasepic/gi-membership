# Recent Buyers Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A card in the bottom corner of offer, product, upsell and home pages naming a real recent buyer (first name, flag, product, real age), with store-wide timing settings, a per-item switch and a per-member hide switch.

**Architecture:** A pure selector (`lib/recent-buyers.ts`) turns purchase rows into cards. A server loader reads those rows; a public GET route caches them per page for 60 s, drops the viewer's own purchase and returns only what a card shows. A client component on each page fetches after load and cycles the cards. Nothing on the server render path waits on any of it.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before writing route or page code), Supabase/PostgREST, zod, vitest + jsdom, Tailwind v4, new dependency `country-flag-icons` (MIT) for SVG flags.

**Spec:** `docs/superpowers/specs/2026-10-26-recent-buyers-popup-design.md`. Approved mockup: `.superpowers/brainstorm/71362-1793004164/content/card-style-v2.html` row 2.

## Global Constraints

- Real purchases only: `orders.status = 'paid'`, `orders.livemode = true`, `orders.stripe_invoice_id is null` (renewals carry an invoice id; key on that, never on a missing PaymentIntent).
- Window: purchases from the last **14 days**, at most **20** cards, newest first.
- Never in a response: email, user id, order id, amount, city. Card fields only.
- Excluded buyers: `users.is_admin = true`, `users.hide_from_recent_buyers = true`, the signed-in viewer.
- Excluded items: switch off, offer `active = false`, product `status <> 'published'`.
- Settings: gap 5 to 120 s (default 12), card shown 3 to 15 s (default 6), home `"on"`/`"off"` (default `"on"`). Gap is the quiet time between one card leaving and the next arriving, so a card can never overlap the next one and no cross-field check is needed (this replaces spec row 22).
- Per-item switch defaults **on** for existing and new offers and products (owner, 26 Oct).
- Pages: `/o/[key]`, `/p/[slug]`, `/checkout/oto`, `/`. Never checkout, thank-you, library, account, login, legal, admin, or the builder canvas. `?preview=1` shows it.
- Flags are SVG images from `country-flag-icons`, never emoji (Windows draws emoji flags as letters).
- Copy: "enrolled in" for courses and one-off products, "joined" for offers that grant an app or bill on an interval. Never "bought" (a trial moved no money). "✓ Verified". No em dashes in any visible string.
- Every visible failure mode is silent: on any error the page shows no card and nothing else changes (AGENTS.md: pages that take money).
- Migration `0096` (check `ls supabase/migrations | tail -1` and open specs first). Applied to production by the owner before the push, then `notify pgrst, 'reload schema';`.
- Full suite before every push, gated on the runner's own exit status; 60-second deploy notice before every push to `main`.

## Review Focus

1. A name in a non-Latin script or with an apostrophe or accent ("José", "O'Neil", "李明") shows exactly as typed, first letter capitalised only for all-lower or all-caps Latin. Test in Task 4.
2. A bottom bar that appears after the page loads (Foundations Weekend's seat bar is page custom JS and shows on scroll) still pushes the card up. Clearance is measured before every card, not once. Test in Task 7.
3. `sessionStorage` throwing (Safari private window) leaves the cards working, just without visit memory. Test in Task 7.
4. One person who got the same course through `/p/x` and through an offer granting it appears once on the product page. Test in Task 4.
5. A purchase timestamp slightly ahead of the visitor's clock reads "just now", never "in 2 minutes" or a negative number. Test in Task 7.

---

### Task 1: Per-item switch and member hide column

**Files:**
- Create: `supabase/migrations/0096_recent_buyers.sql`
- Modify: `lib/types.ts`, `lib/store.ts` (OFFER_COLUMNS, PRODUCT_COLUMNS and their row mappers), `lib/admin.ts` (ProductInput, updateProduct), `app/admin/actions.ts` (saveProduct), `app/admin/offers/actions.ts`, `components/admin/offer-form.tsx`, `components/admin/product-form.tsx`, `docs/DATABASE.md`
- Test: `app/admin/offers/offer-prices-save.test.ts`, `lib/product-rules.test.ts`

Follow commit `32cbcb0` (home steps): it added a column to both offers and products and threaded it through exactly these files.

**Interfaces:**
- Produces: columns `offers.show_recent_buyers boolean not null default true`, `products.show_recent_buyers boolean not null default true`, `users.hide_from_recent_buyers boolean not null default false` (on `public.users`). Fields `Offer.showRecentBuyers: boolean`, `Product.showRecentBuyers: boolean`. Form field name `showRecentBuyers` (checkbox, posts `"on"`).

- [ ] **Step 1: Write the migration.** Header comment in the style of `0093_home_steps.sql`: why, and "Apply to production BEFORE the image that reads these columns: OFFER_COLUMNS and PRODUCT_COLUMNS select them." Three `add column if not exists`, ending `notify pgrst, 'reload schema';`. Apply locally: `docker exec -i supabase_db_grow_membership psql -U postgres < supabase/migrations/0096_recent_buyers.sql`.
- [ ] **Step 2: Failing tests.** In `offer-prices-save.test.ts`: `it("saves the recent buyers switch off when the box is unticked")` posts the form without `showRecentBuyers` and expects the update payload `show_recent_buyers: false`; a second posts `"on"` and expects `true`. In `product-rules.test.ts`, the same pair for the product input parser.
- [ ] **Step 3: Run** `npx vitest run app/admin/offers/offer-prices-save.test.ts lib/product-rules.test.ts`. Expected: the four new tests FAIL.
- [ ] **Step 4: Implement.** Offer schema field `showRecentBuyers: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean())` (same as `active`). Checkbox on both forms labelled "Show recent buyers", hint "Real buyers from the last two weeks, on this page and in the home page mix". Select and map the column in `lib/store.ts`.
- [ ] **Step 5: Run** the same command. Expected: PASS. Then `npx tsc --noEmit 2>&1 | grep -v '^tmp-'` is empty.
- [ ] **Step 6: DATABASE.md** entry for 0096, then commit: `git add supabase/migrations/0096_recent_buyers.sql lib/types.ts lib/store.ts lib/admin.ts app/admin/actions.ts app/admin/offers/actions.ts components/admin/offer-form.tsx components/admin/product-form.tsx docs/DATABASE.md app/admin/offers/offer-prices-save.test.ts lib/product-rules.test.ts`.

### Task 2: Hide a member from recent buyers

**Files:**
- Modify: `app/admin/members/actions.ts`, `app/admin/members/[id]/page.tsx`
- Test: `app/admin/members/recent-buyers-hide.test.ts` (new)

**Interfaces:**
- Consumes: `users.hide_from_recent_buyers` (Task 1).
- Produces: `toggleRecentBuyersHiddenAction(formData: FormData): Promise<void>` reading `userId` and `hidden` (`"true"`/`"false"`).

- [ ] **Step 1: Failing test**, mocking `requireAdmin`, `next/cache` and the service client the way `app/admin/errors/actions.test.ts` does: `it("hides one member and only that member")` expects `update({ hide_from_recent_buyers: true })` then `eq("id", "u1")`; `it("does nothing without a user id")` expects no update.
- [ ] **Step 2: Run** `npx vitest run app/admin/members/recent-buyers-hide.test.ts`. Expected: FAIL, action not a function.
- [ ] **Step 3: Implement** the action (requireAdmin, update, `revalidatePath` of the member page) and a form beside the admin toggle on the member page: button "Hide from recent buyers" / "Show in recent buyers", with the current state in muted text.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** the three files.

### Task 3: Settings group "Recent buyers"

**Files:**
- Modify: `lib/settings-schema.ts`, `components/admin/settings-screen.tsx`
- Test: `lib/settings.test.ts`

**Interfaces:**
- Produces: settings keys `recentBuyersGapSeconds: number`, `recentBuyersShowSeconds: number`, `recentBuyersHome: "on" | "off"`; group key `"recentBuyers"`, label "Recent buyers", placed after `"steps"`.

The home switch is a `<select>` (On / Off), not a checkbox: an absent checkbox reaches the per-group save as `undefined`, which parses to the default, and the default is on, so a checkbox could never be turned off.

- [ ] **Step 1: Failing tests** in `lib/settings.test.ts`: defaults are `12`, `6`, `"on"`; `"4"` for the gap fails with "5 seconds at least"; `"121"` fails with "120 seconds at most"; `"2"` and `"16"` for shown fail with "3 seconds at least" / "15 seconds at most"; `"off"` parses to `"off"`; `"maybe"` fails.
- [ ] **Step 2: Run** `npx vitest run lib/settings.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `z.coerce.number().int().min(5, "5 seconds at least").max(120, "120 seconds at most").default(12)`, likewise 3/15/6, `z.enum(["on", "off"]).default("on")`. Add the group to `SETTINGS_GROUPS` and `GROUP_FIELDS`, and a `RecentBuyersFields` component with two number inputs (hints "quiet time between cards" and "how long each card stays up") and the select (hint "a mix of every product whose own switch is on").
- [ ] **Step 4: Run** `npx vitest run lib/settings.test.ts app/admin/settings`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: The selector

**Files:**
- Create: `lib/recent-buyers.ts`
- Test: `lib/recent-buyers.test.ts`

Pure: no database, no clock of its own, no `server-only`.

**Interfaces:**
- Produces:
  ```ts
  export type BuyerScope = { kind: "offer"; id: string } | { kind: "product"; id: string } | { kind: "home" };
  export type PurchaseRow = {
    orderId: string; userId: string; createdAt: string; // ISO
    username: string | null; country: string | null;
    itemKind: "purchase" | "bump" | "oto";
    offerId: string | null; productId: string | null; grantProductId: string | null;
    itemName: string; imageUrl: string | null; verb: "enrolled in" | "joined";
  };
  export type BuyerCard = {
    firstName: string; initial: string; country: string | null;
    verb: "enrolled in" | "joined"; itemName: string; imageUrl: string | null; at: string;
  };
  export const WINDOW_DAYS = 14;
  export const MAX_CARDS = 20;
  export function displayFirstName(username: string | null): string | null;
  export function selectRecentBuyers(rows: PurchaseRow[], scope: BuyerScope, now: Date, viewerId?: string | null): BuyerCard[];
  ```
  Rows reaching the selector are already filtered by the loader for status, livemode, renewals, admins, hidden members and switches; the selector owns the rules that need no database.

- [ ] **Step 1: Failing tests** for `displayFirstName`: `"priya sharma"` → `"Priya"`; `"PRIYA"` → `"Priya"`; `"McKenzie Hart"` → `"McKenzie"`; `"José Luis"` → `"José"`; `"O'Neil"` → `"O'Neil"`; `"李明"` → `"李明"`; `"jane@gmail.com"`, `""`, `null`, `"J"`, `"test"`, `"Test User"`, `"asdf"`, `"user123"` → `null`.
- [ ] **Step 2: Failing tests** for `selectRecentBuyers` (fixture builder `row(over)`; `now = new Date("2026-10-26T12:00:00Z")`):
  - drops a row 15 days old, keeps one 13 days 23 hours old;
  - newest first;
  - caps at 20 from 25 rows;
  - drops a row whose name is `null` after `displayFirstName`;
  - drops the viewer's own rows;
  - offer scope keeps only `offerId === id`;
  - product scope keeps `productId === id` **and** `grantProductId === id`; the same `userId` arriving both ways gives one card, the newer;
  - offer and product scopes: one card per `userId`, the newest;
  - home scope: one card per `orderId`, preferring `itemKind "purchase"` over `"bump"`/`"oto"`, then one per `userId`;
  - `initial` is the first letter of `firstName`, uppercased;
  - no field outside `BuyerCard` appears on the output (`Object.keys` equals the type's seven keys).
- [ ] **Step 3: Run** `npx vitest run lib/recent-buyers.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Latin test `/^[\p{Script=Latin}'’-]+$/u`; recase only when the word is all-lower or all-upper. Reject list: `test`, `testing`, `asdf`, `admin`, `user`, `customer`, `na`, `n/a`, anything with a digit, length under 2.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 5: The loader

**Files:**
- Create: `lib/recent-buyers-data.ts` (`import "server-only"`)
- Test: `lib/recent-buyers-data.integration.test.ts`

**Interfaces:**
- Consumes: `PurchaseRow`, `BuyerScope`, `WINDOW_DAYS` (Task 4); columns from Task 1; `publicCoverUrl` from `lib/media-url.ts`.
- Produces: `loadPurchaseRows(scope: BuyerScope, now: Date): Promise<PurchaseRow[]>`.

Reads with the service client: paid, live, non-renewal orders since `now - WINDOW_DAYS`, their `order_items` with an offer or product, the buyer's `username`, `country`, `is_admin`, `hide_from_recent_buyers`, and the item's offer (`name`, `image_url`, `active`, `show_recent_buyers`, `grant_product_id`, `grant_app_id`, `interval`) or product (`title`, `cover_path`, `status`, `show_recent_buyers`). Country: `orders.buyer_country`, else `users.country`. Picture: offer `image_url` (through `publicCoverUrl`), else the granted product's cover, else the product's cover, else `null`. Verb `"joined"` when the offer has `grant_app_id` or `interval`, otherwise `"enrolled in"`. Drops admins, hidden members, switched-off, inactive and unpublished items. Order by `created_at desc`. For the product scope, fetch items with that `product_id` plus items whose offer grants it. Never throws: any error logs `[recent-buyers]` and returns `[]`.

- [ ] **Step 1: Failing integration test** inside `describe.skipIf(!canRun)` (copy the guard from an existing `*.integration.test.ts`). Fixtures prefixed `zz-rb-${Date.now()}`, cleaned in `afterAll` in FK order (order_items, orders, offers, products, users). Cases: a paid live order appears; a refunded one, a `livemode false` one, a renewal (has `stripe_invoice_id`), an admin's and a hidden member's do not; an item with `show_recent_buyers false` does not; product scope returns the buyer of an offer whose `grant_product_id` is the product; `buyer_country` wins over `users.country`.
- [ ] **Step 2: Run** `npx vitest run lib/recent-buyers-data.integration.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `loadPurchaseRows`.
- [ ] **Step 4: Run.** Expected: PASS. Then move `.env.local` aside and run it again: expected SKIPPED, not failed (AGENTS.md: local green is not CI green).
- [ ] **Step 5: Commit.**

### Task 6: The public route

**Files:**
- Create: `app/api/recent-buyers/route.ts`
- Modify: `package.json`, `package-lock.json` (`npm install country-flag-icons`)
- Test: `app/api/recent-buyers/route.test.ts`

**Interfaces:**
- Consumes: `loadPurchaseRows` (Task 5), `selectRecentBuyers`, `BuyerCard` (Task 4), the settings keys (Task 3) read with the non-throwing settings read the checkout uses.
- Produces: `GET /api/recent-buyers?offer=<uuid> | ?product=<uuid> | ?home=1` returning
  ```ts
  { gapMs: number; showMs: number; cards: Array<BuyerCard & { flagSvg: string | null }> }
  ```

Query parameters are a whitelist (AGENTS.md): exactly one of the three, ids must match a UUID pattern; anything else gets `{ cards: [] }` with the default timings. `home` with the home setting `"off"` returns no cards. Rows are cached in a module-level `Map` per scope key for 60 s; the viewer (`createClient().auth.getUser()`, failure means no viewer) is removed after the cache, so one cache entry serves everyone. `flagSvg` comes from `country-flag-icons/string/3x2` keyed by the upper-cased ISO code, `null` when unknown. Response header `Cache-Control: no-store` (the viewer filter makes it per-person). Any thrown error returns status 200 with `{ cards: [] }`.

- [ ] **Step 1: Failing tests** (mock the loader, settings and auth): `?offer=not-a-uuid` and `?offer=a&product=b` give no cards and never call the loader; `?home=1` with home `"off"` gives no cards; two calls within 60 s call the loader once; a viewer's own row is absent while another viewer still sees it; `"IN"` gives a `flagSvg` starting `<svg`, `"XX"` gives `null`; a loader that throws gives 200 and `cards: []`; the JSON contains none of `email`, `userId`, `orderId`.
- [ ] **Step 2: Run** `npx vitest run app/api/recent-buyers`. Expected: FAIL.
- [ ] **Step 3: Install and implement.** `npm install country-flag-icons`, then the route.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**, including `package.json` and `package-lock.json`.

### Task 7: The card

**Files:**
- Create: `components/recent-buyers.tsx` (`"use client"`), `lib/recent-buyers-time.ts`
- Test: `components/recent-buyers.test.tsx`, `lib/recent-buyers-time.test.ts`

**Interfaces:**
- Consumes: the route's response shape (Task 6).
- Produces: `<RecentBuyers scope={{ offer: string } | { product: string } | { home: true }} />`; `timeAgo(at: string, now: Date): string`; `bottomClearance(win: Window): number`.

Behaviour: fetch after mount; no fetch until the page has loaded; first card after 4 s; each card shows for `showMs`, then `gapMs` of nothing; the list plays twice, then stops. Closing a card stops cards for the visit (`sessionStorage["rb-closed"] = "1"`, every access in try/catch). Before each card, `bottomClearance` samples `document.elementsFromPoint` at the bottom edge (left, middle and right) and returns the height of the tallest `position: fixed` or `sticky` element touching the bottom (0 when none); the card sits that many pixels plus 12 above the bottom. Desktop (≥ 768px): bottom-left, 420px wide. Phone: full width minus 24px. Rise animation only under `prefers-reduced-motion: no-preference`. No `aria-live`; the card is `aria-hidden` except the close button (`aria-label="Close"`, 44 × 44 px). Class names prefixed `rb-` with styles scoped to them, so page custom CSS cannot reach them through generic classes. Visuals from the approved mockup: product picture 60px (52px on a phone) with a radius of 14, a green check badge, a fallback initial in a navy circle when `imageUrl` is null, the flag beside the name, the time in terracotta, "✓ Verified" in green. Never rendered inside the builder canvas: the editor does not mount it.

- [ ] **Step 1: Failing tests for `timeAgo`:** 30 s → "just now"; a timestamp 90 s in the future → "just now"; 1 min → "1 minute ago"; 59 min → "59 minutes ago"; 61 min → "1 hour ago"; 5 h → "5 hours ago"; 26 h → "1 day ago"; 13 d → "13 days ago".
- [ ] **Step 2: Failing component tests** (jsdom, fake timers, `fetch` mocked): nothing before 4 s; the first card's name after 4 s; gone after `showMs`; the next after `gapMs`; stops after two passes of a two-card list (four cards, then none at 10× the cycle); closing writes `rb-closed` and no further card appears; a `sessionStorage` whose `getItem` throws still shows cards; `cards: []` renders nothing; a fetch rejection renders nothing and throws nothing; a fixed 64px bar added to the page after the first card makes the second card's `bottom` 76px; null `flagSvg` renders no flag element.
- [ ] **Step 3: Run** `npx vitest run components/recent-buyers.test.tsx lib/recent-buyers-time.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** both files. The flag SVG string comes from the package, not a visitor, so it is set as inner HTML of a 22 × 16 span.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 8: Put it on the four pages, and say so in the privacy policy

**Files:**
- Modify: `app/(store)/o/[key]/page.tsx`, `app/(store)/p/[slug]/page.tsx`, `app/(store)/checkout/oto/page.tsx`, `app/(store)/page.tsx`, the privacy policy source (find it from `app/(store)/privacy/page.tsx`)

**Interfaces:**
- Consumes: `<RecentBuyers />` (Task 7).

- [ ] **Step 1: Mount.** Offer page: `<RecentBuyers scope={{ offer: offer.id }} />`. Product page: `{{ product: product.id }}`. Upsell page: the upsell offer's id. Home: `{{ home: true }}`. On every page, also when `preview` is set; the builder canvas renders through its own path and must not gain it (confirm by opening the editor after Step 3).
- [ ] **Step 2: Privacy line.** Show the owner this wording and wait for a yes before adding it: "On our sales pages we show recent purchases from the last two weeks: the buyer's first name, their country's flag and what they bought. We never show surnames, email addresses, cities or amounts. Ask us at {privacyEmail} and we will remove you."
- [ ] **Step 3: Look at it.** With local data shaped like production (paid orders across three offers in the last week, one with a seat-bar page, one upsell), open each page at 1280 × 800 and 390 × 844 in the in-app browser. Check: the card clears the Foundations Weekend seat bar and the upsell sticky bar on the phone; nothing on the page moves when it appears; it never appears on `/checkout/offer`. Screenshot each.
- [ ] **Step 4: Commit.**

### Task 9: Ship

- [ ] **Step 1:** `npx tsc --noEmit 2>&1 | grep -v '^tmp-'` empty; `npx eslint` on every changed file clean.
- [ ] **Step 2:** Full suite: `npx vitest run --exclude 'tmp-*/**'`; check `$?`. Any non-integration failure stops the ship. Integration timeouts must be shown to fail identically on `main` before they are waved through.
- [ ] **Step 3:** Hand the owner `supabase/migrations/0096_recent_buyers.sql` to apply to production, followed by `notify pgrst, 'reload schema';`. Confirm with a read: `select column_name from information_schema.columns where table_name in ('offers','products','users') and column_name in ('show_recent_buyers','hide_from_recent_buyers');` returns three rows. Do not push before this.
- [ ] **Step 4:** Deploy notice, wait 60 s, re-fetch origin, push. `gh run list --branch main --limit 1` until success; wait for the new image on the box.
- [ ] **Step 5:** On production at 390px: Foundations Weekend, 90-Day AI, Book to Bestseller, home. Confirm the API returns no email or ids: `curl -s 'https://grow.greaterinside.com/api/recent-buyers?home=1' | grep -c '@'` prints `0`.
- [ ] **Step 6:** Lessons worth keeping go to `docs/lessons.md` in the same push.
