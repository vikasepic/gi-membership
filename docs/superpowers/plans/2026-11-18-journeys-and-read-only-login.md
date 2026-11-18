# Journeys report and read-only login: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin page that shows each buyer's first purchase, later purchases and spend, plus a read-only login that opens five admin pages and can change nothing.

**Architecture:** The role is one column (`users.is_viewer`), one pure list of paths the proxy and sidebar share, and one new guard (`requireViewer`) used only by pages and exports on that list. Every action keeps `requireAdmin`, which a viewer never passes. Journeys is a pure derivation over `loadMoneyData()`, like Members and Transactions.

**Tech Stack:** Next.js 16 (proxy.ts, server components, server actions), Supabase Postgres through the service client, vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md`

## Global Constraints

- Branch `journeys-read-only`. No push; the owner says when.
- Release order, when the owner says push: apply `0100` to production by hand with `notify pgrst, 'reload schema';` first, then the deploy notice, then the push. The proxy reads the column on every `/admin` request, so the image must never serve before the column exists.
- Migration is `0100`. Run `ls supabase/migrations | tail -1` first; if it is no longer `0099`, take the next number and say so in the ledger.
- `requireAdmin()`, `getAdminUser()` and `userIsAdmin()` must never pass for a viewer. No action, write route, View as, draft preview or course preview moves to the new guard.
- The viewer's pages are exactly: `/admin/journeys`, `/admin/orders`, `/admin/members`, `/admin/traffic`, `/admin/attribution`, matched on whole path segments.
- The proxy does one `users` lookup per `/admin` request, and none for an `ADMIN_EMAILS` account. A failed lookup denies.
- An order's value is the sum of its lines, never `total_cents`.
- Anything that grows is read with `allRows`. Values off a URL are a whitelist.
- Integration tests sit inside `describe.skipIf(!canRun)`, use fixtures prefixed `zz-` with a timestamp, order every one-row pick, and clean up in FK order in `afterAll`.
- Copy: plain words, no em dashes. UI names: "Journeys", "Read-only access", "started free", "given".
- Another session is changing `totalPaidCents` in `lib/member-money.ts` (upsell money). Touch that file only to add `isViewer`; do not edit the totals.
- Full suite before finishing: `npx vitest run --exclude 'tmp-*/**'`, gated on its exit status, then again with `.env.local` moved to the scratchpad.

## Review Focus

- **A path that only looks allowed.** `/admin/membersX`, `/admin/members/../settings`, `/Admin/Settings`, `/admin/orders/` with a trailing slash, an encoded slash. Expect: only real sub-paths of the five open; everything else goes to Journeys. Tests in Task 2.
- **Both flags, or the wrong flag.** `is_admin` and `is_viewer` both true; an `ADMIN_EMAILS` account flagged viewer. Expect: admin in both cases. Tests in Task 2.
- **An old order with no purchase line.** `host_offer_id` is null before migration 0077, so an offer order from then has only `oto` lines the ledger calls upsells. Expect: its first non-bump line is the purchase. Test in Task 5.
- **Free starts in every position.** A trial taken as an upsell on a paid order; a $0 coupon order that never pays; a trial that paid later; a refunded first order followed by a real one. Expect: as the spec's "free start" and "who counts" rules say. Tests in Task 5.
- **A viewer switched off with a tab open.** Expect: the next request is refused; the role is never remembered across requests. Test in Task 2.

---

### Task 1: The column, and the loader carries what both features read

**Files:**
- Create: `supabase/migrations/0100_viewer_role.sql`
- Modify: `lib/money-data.ts`, `docs/DATABASE.md`
- Test: `lib/money-data.integration.test.ts` (create if absent, else add to it)

**Interfaces:**
- Produces: `UserRow.isViewer: boolean`; `OwnershipRow.source: string` and `OwnershipRow.createdAt: string`; `MoneyData.courseGrants[n].createdAt: string | null`.

- [ ] **Step 1: Write the migration.** `alter table users add column if not exists is_viewer boolean not null default false;` with a comment on the column: "Read-only access to the admin's report pages. Set by an admin on the person page. is_admin and ADMIN_EMAILS win." End the file with `notify pgrst, 'reload schema';`.
- [ ] **Step 2: Apply it locally.** Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/migrations/0100_viewer_role.sql`. Expected: `ALTER TABLE`, `COMMENT`, `NOTIFY`.
- [ ] **Step 3: Write the failing integration test.** Insert a `zz-` user with `is_viewer true` and one `ownership` row with `source 'grant'`; assert `loadMoneyData()` returns that user with `isViewer === true` and that ownership row with `source === "grant"` and a `createdAt` that parses as a date.
- [ ] **Step 4: Run it.** `npx vitest run lib/money-data.integration.test.ts`. Expected: FAIL, `isViewer` undefined.
- [ ] **Step 5: Add the columns to the three selects and the mapped rows in `loadMoneyData()`.** `users`: `is_viewer`. `ownership`: `source, created_at`. `course_access`: `created_at`.
- [ ] **Step 6: Run it.** Expected: PASS. Then `npx tsc --noEmit` clean outside `tmp-*`.
- [ ] **Step 7: Add the 0100 entry to `docs/DATABASE.md`** in the style of the 0099 entry: what the column is and why it is separate from `is_admin`.
- [ ] **Step 8: Commit.** `git commit -m "Read-only role: the column, and the loader carries it"`

### Task 2: The role's boundary: path list, guards, proxy

**Files:**
- Create: `lib/viewer-paths.ts`, `lib/viewer-paths.test.ts`, `lib/proxy-viewer.test.ts`, `lib/admin-guard.test.ts` (add to it if it exists)
- Modify: `lib/admin-guard.ts`, `proxy.ts`, `AGENTS.md`

**Interfaces:**
- Produces:
  - `lib/viewer-paths.ts` (no `server-only`, imported by the proxy and a client component): `VIEWER_PATHS: readonly string[]`, `VIEWER_HOME = "/admin/journeys"`, `viewerMayOpen(pathname: string): boolean`.
  - `lib/admin-guard.ts`: `type AdminRole = "admin" | "viewer"`; `getAdminRole(): Promise<{ user: User; role: AdminRole } | null>` wrapped in React `cache()` so the layout and the page share one lookup per request; `requireViewer(): Promise<{ user: User; role: AdminRole }>` which redirects to `/login` for anyone else.

- [ ] **Step 1: Write `lib/viewer-paths.test.ts`.**

```ts
it.each(["/admin/journeys", "/admin/orders", "/admin/orders/export", "/admin/members/abc-123", "/admin/traffic/x", "/admin/attribution/visits"])("opens %s", (p) => expect(viewerMayOpen(p)).toBe(true));
it.each(["/admin", "/admin/", "/admin/settings", "/admin/membersX", "/admin/members/../settings", "/Admin/Orders", "/admin/orders%2f..%2fsettings", "/admin/subscriptions", "/admin/offers", "/api/offers", "/library"])("refuses %s", (p) => expect(viewerMayOpen(p)).toBe(false));
it("opens a trailing slash on a real page", () => expect(viewerMayOpen("/admin/orders/")).toBe(true));
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `viewerMayOpen`.** A path with a `..` segment or a `%` is refused outright; otherwise it is on the list when it equals an entry or starts with the entry plus `/`. Case-sensitive.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Write the guard tests** in `lib/admin-guard.test.ts`, mocking `@/lib/supabase/server` so `auth.getUser` and the `users` row are set per test. Cases, each asserting all four of `getAdminUser`, `userIsAdmin`, `requireAdmin`, `requireViewer`:
  - row `{ is_admin: false, is_viewer: true }`: `getAdminUser` null, `userIsAdmin` false, `requireAdmin` redirects to `/login`, `requireViewer` resolves with `role: "viewer"`.
  - row `{ is_admin: true, is_viewer: true }`: role `"admin"`.
  - an `ADMIN_EMAILS` email with row `{ is_admin: false, is_viewer: true }`: role `"admin"`, and the `users` table is not queried.
  - row both false: `requireViewer` redirects to `/login`.
  - the lookup throws: `requireViewer` redirects to `/login`.
  - `getAdminRole` asks the database again on a second request (reset the module between calls, flip the row to `is_viewer: false`, expect null).
- [ ] **Step 6: Run them.** Expected: FAIL, `requireViewer` is not exported.
- [ ] **Step 7: Implement `getAdminRole` and `requireViewer`** with one select of `is_admin, is_viewer`. Leave `isAdminInDb`, `getAdminUser`, `userIsAdmin` and `requireAdmin` reading `is_admin` only.
- [ ] **Step 8: Run them.** Expected: PASS.
- [ ] **Step 9: Write `lib/proxy-viewer.test.ts`** in the style of `lib/proxy-redirect.test.ts` (mock `@supabase/ssr` so `auth.getUser` returns a user and `from("users")…maybeSingle()` returns the row; mock `@/lib/redirect-cache` to no rules). Cases:
  - viewer on `/admin/orders`: status 200, exactly one `users` lookup.
  - viewer on `/admin/settings`, `/admin` and `/admin/membersX`: a redirect whose Location path is `/admin/journeys`.
  - viewer POST to `/admin/members/abc` (a server action post): passes the proxy (the action's own guard refuses it, Task 3).
  - neither flag: redirect to `/login`, as today.
  - `is_admin` true: 200 on `/admin/settings`.
  - the lookup throws for a viewer path: redirect to `/login`.
- [ ] **Step 10: Run it.** Expected: FAIL on the viewer cases.
- [ ] **Step 11: Change the gate in `proxy.ts`.** Select `is_admin, is_viewer` in the existing query. Admit an admin anywhere; admit a viewer when `viewerMayOpen(pathname)`; send a viewer anywhere else under `/admin` to `VIEWER_HOME` with the query cleared; everyone else to `/login` as now. Update the comment block above the gate to name the third list.
- [ ] **Step 12: Run it and the existing proxy tests.** `npx vitest run lib/proxy-viewer.test.ts lib/proxy-redirect.test.ts`. Expected: PASS.
- [ ] **Step 13: Add one rule to `AGENTS.md` under "Code that bites":** a read-only person (`users.is_viewer`) opens only the paths in `lib/viewer-paths.ts`; a new admin page is closed to them until added there; pages on the list call `requireViewer()`, and nothing that writes ever does.
- [ ] **Step 14: Commit.** `git commit -m "Read-only role: path list, guards and the proxy gate"`

### Task 3: The switch, and proof a viewer can change nothing

**Files:**
- Modify: `lib/members.ts`, `app/admin/members/actions.ts`, `lib/member-money.ts` (add `isViewer` to `MemberMoney` only), `app/admin/members/[id]/page.tsx`
- Test: `app/admin/viewer-refused.test.ts` (create), `app/admin/members/actions.test.ts` (create or add)

**Interfaces:**
- Consumes: `UserRow.isViewer` (Task 1).
- Produces: `setMemberViewer(userId: string, isViewer: boolean): Promise<void>` in `lib/members.ts`; `toggleViewerAction(formData: FormData)` in `app/admin/members/actions.ts`, form fields `userId`, `email`, `makeViewer` (`"true"`/`"false"`); `MemberMoney.isViewer: boolean`.

- [ ] **Step 1: Write `app/admin/viewer-refused.test.ts`.** Mock `@/lib/supabase/server` so the signed-in user's row is `{ is_admin: false, is_viewer: true }` and the service client records every `insert`, `update`, `upsert`, `delete` and `rpc`; mock `@/lib/stripe` so any call is recorded; mock `next/navigation` so `redirect(to)` throws `redirect:${to}`. Do **not** mock `@/lib/admin-guard`. Call each of these with plausible arguments and assert it rejects with `redirect:/login`, that no write was recorded and Stripe was not called: `refundOrderAction`, `cancelSubscriptionAction`, `extendTrialAction`, `addMemberAction`, `grantAccessAction`, `revokeAccessAction`, `toggleAdminAction`, `toggleViewerAction`, `toggleRecentBuyersHiddenAction`, `deleteMemberAction`, `viewAsMemberAction`, `changeEmailAction`. Add one control case: with the row `{ is_admin: true }`, `toggleRecentBuyersHiddenAction` does record a write, so the test can fail.
- [ ] **Step 2: Run it.** Expected: FAIL only on `toggleViewerAction` (not exported); the other eleven pass already. If any other fails, that action is missing its guard: stop and ledger it as a finding before fixing it.
- [ ] **Step 3: Write the switch's own tests** (guard mocked as admin): `makeViewer=true` calls `setMemberViewer(id, true)`; an `ADMIN_EMAILS` email is left alone; a missing `userId` writes nothing.
- [ ] **Step 4: Implement `setMemberViewer` and `toggleViewerAction`,** mirroring `setMemberAdmin` and `toggleAdminAction`, `requireAdmin()` first.
- [ ] **Step 5: Run both test files.** Expected: PASS.
- [ ] **Step 6: Carry `isViewer` into `MemberMoney`** in `deriveMembers`, and add the control to the person page's Account section beside the admin form: a form posting `toggleViewerAction` whose button reads "Give read-only access" or "Remove read-only access". Not shown when the person is an admin or an environment admin. When on, show the text "Read-only access" beside it.
- [ ] **Step 7: Run `npx vitest run lib/member-money.test.ts app/admin`.** Expected: PASS.
- [ ] **Step 8: Commit.** `git commit -m "Read-only role: the switch, and every action refuses a viewer"`

### Task 4: The five pages open to a viewer, with nothing to press

**Files:**
- Modify: `app/admin/layout.tsx`, `components/admin/sidebar.tsx`, `components/admin/sidebar.test.tsx`, `app/admin/orders/page.tsx`, `app/admin/orders/export/route.ts`, `app/admin/members/page.tsx`, `app/admin/members/export/route.ts`, `app/admin/members/[id]/page.tsx`, `app/admin/traffic/page.tsx`, `app/admin/traffic/[key]/page.tsx`, `app/admin/attribution/page.tsx`, `app/admin/attribution/scroll/page.tsx`, `app/admin/attribution/sources/page.tsx`, `app/admin/attribution/visits/page.tsx`, `app/api/deploy-notice/route.ts`
- Test: `app/admin/viewer-pages.integration.test.tsx` (create), `app/api/deploy-notice/route.test.ts` (add)

**Interfaces:**
- Consumes: `requireViewer`, `getAdminRole`, `VIEWER_PATHS` (Task 2).
- Produces: `AdminSidebar` takes `viewer?: boolean`.

- [ ] **Step 1: Sidebar test.** With `viewer`, the nav holds exactly the links whose `href` is in `VIEWER_PATHS` (Journeys arrives in Task 6, so assert against the list, not a count), no badge text and no nudge panel. Without it, the nav is unchanged.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** The sidebar filters its items through `viewerMayOpen(item.href)` when `viewer`. The layout calls `getAdminRole()`, passes `viewer`, and for a viewer skips `navCounts()` and `needsYou()`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Write `app/admin/viewer-pages.integration.test.tsx`** in the style of `app/admin/money-pages.integration.test.tsx`, with `@/lib/admin-guard` mocked so `requireViewer` returns a role the test sets and `requireAdmin` throws `redirect:/login` when the role is `"viewer"`. Seed one `zz-` member with a paid order. Render each page twice:
  - Transactions: as admin the markup contains `Refund`; as viewer it does not, and still contains `Gross` and `Export CSV`.
  - Members: as admin `Add member`; as viewer not, and still `Collected`.
  - Person page: as viewer none of `Make admin`, `Give read-only access`, `Open the store as them`, `Hide from recent buyers`, `Refund`, `Change email`, `Delete`, and no `<form`; as admin each of the first three is present. The viewer render still shows the member's email and their order.
  - Traffic and Attribution (all six pages): render as viewer without throwing.
  - Both export routes: as viewer, status 200 and `text/csv`.
- [ ] **Step 6: Run it.** Expected: FAIL (pages still call `requireAdmin`, which throws for the viewer).
- [ ] **Step 7: Implement.** Each page and both export routes call `requireViewer()` in place of `requireAdmin()` (Traffic and Attribution gain the call). Pages take `const canEdit = role === "admin"` and render every changing control only when `canEdit`: `RefundButton`, `AddMember`, `GrantMore`, the trial, cancel and revoke forms, both role switches, the recent-buyers form, View as, `ChangeEmail`, `DeleteMember`. The person page's `me` (used for `isSelf`) comes from `requireViewer().user`.
- [ ] **Step 8: Run it.** Expected: PASS.
- [ ] **Step 9: Deploy notice.** Test first: `GET /api/deploy-notice` as a viewer returns 200 with the notice; `POST` as a viewer without the cron secret is still refused. Then make `GET` use `getAdminRole()` (401 with `{ notice: null }` when null).
- [ ] **Step 10: Grep the client components these pages import for `fetch("/api`** and list each hit in the ledger with the route's guard. A read the pages need moves to `getAdminRole()`; a write stays `requireAdmin`.
- [ ] **Step 11: Run `npx vitest run app components/admin`.** Expected: PASS.
- [ ] **Step 12: Commit.** `git commit -m "Read-only role: five pages open, every control hidden"`

### Task 5: Journeys, the derivation

**Files:**
- Create: `lib/buyer-journeys.ts`, `lib/buyer-journeys.test.ts`

**Interfaces:**
- Consumes: `MoneyData` with Task 1's fields; `sourceOf` from `lib/member-money.ts`.
- Produces (named `Buyer…` because `Journey` in `lib/member-money.ts` already means a member's state):

```ts
export type JourneyRange = "all" | "90" | "30";
export function journeyRangeFrom(sp: Record<string, string | string[] | undefined>): JourneyRange; // whitelist, default "all"

export type BuyerPurchase = { orderId: string; at: string; key: string; what: string; valueCents: number; withIt: string[] };
export type BuyerLine = {
  personKey: string; email: string; purchaseNo: number | null; at: string | null; what: string;
  how: "first" | "bought with" | "later" | "renewal" | "started free" | "given";
  amountCents: number; currency: string; sourceFirst: string; sourceLast: string;
};
export type BuyerJourney = {
  personKey: string; userId: string | null; email: string; name: string | null;
  first: BuyerPurchase; later: BuyerPurchase[];
  startedFree: { what: string; at: string }[]; given: { what: string; at: string | null }[];
  totalSpentCents: number; currency: string; source: string; lines: BuyerLine[];
};
export type JourneySummaryRow = {
  key: string; what: string; buyers: number; avgFirstValueCents: number;
  boughtAgain: number; laterBy: Record<string, number>; avgTotalSpentCents: number;
};
export type Journeys = { people: BuyerJourney[]; summary: JourneySummaryRow[]; laterColumns: { key: string; what: string }[] };
export function deriveJourneys(d: MoneyData, opts: { range: JourneyRange; teamEmails: string[] }): Journeys;
```

  `key` is `offer:<id>` or `product:<id>`. `personKey` is the user id, or the lowercased order email when the order has no user. `people` is newest first purchase first; `summary` is most buyers first; `laterColumns` is most later buyers first.

- [ ] **Step 1: Write `lib/buyer-journeys.test.ts`** over hand-built `MoneyData` (a small `data({ users, orders, items, subscriptions, ownership })` helper with `now = 2026-11-18T00:00:00Z`). One test per rule, with these exact expectations:
  - **Order of purchases.** User A: Validator (product, $27) on 3 Sep; Foundations Weekend (oto, host offer = its own, $197) on 9 Nov. `first.what` "Digital Product Validator", `later` one entry "Foundations Weekend", `totalSpentCents` 22400. Summary row for the Validator: `buyers 1, boughtAgain 1, laterBy { "offer:fw": 1 }, avgFirstValueCents 2700, avgTotalSpentCents 22400`.
  - **Bump and upsell ride the order.** One order: product $27, bump $11, oto upsell $197 (host offer null). `first.valueCents` 23500, `withIt` names both, `later` empty.
  - **Value is the lines, not the total.** Same order with `totalCents: 2700`: `first.valueCents` still 23500.
  - **Two orders minutes apart are two purchases.** Orders 10 minutes apart: `later.length` 1.
  - **A free start is not a purchase.** A $0 order with a trial line whose subscription has `paidInvoices: 0`: the person is not in `people`. With only that order plus a `source: "grant"` ownership row: still not in `people`.
  - **A free start that paid is a purchase from its start.** Trial order 1 Oct, subscription `paidInvoices: 2`, two renewal orders of $47: `first.at` is 1 Oct, `first.valueCents` 0, `totalSpentCents` 9400, and the lines carry two `"renewal"` rows.
  - **A 100% coupon one-off never becomes one.** $0 order, no subscription, then a $29 order a week later: `startedFree` has one entry and `first` is the $29 order.
  - **A trial taken as an upsell.** Order: product $27 plus $0 trial line: `first.what` is the product, `withIt` includes the trial's name.
  - **Refunded orders are gone.** First order refunded, second paid: `first` is the second, and `totalSpentCents` excludes the first.
  - **Test orders are gone.** `livemode: false` order only: not in `people`.
  - **An old offer order with no host.** `hostOfferId: null`, lines: `oto` $29 then `bump` $11: `first.what` is the `oto` line's offer.
  - **Renewals are never a purchase.** A person whose only orders are renewals, with no start order in the data: not in `people`, and nothing throws.
  - **Given access is listed, not counted.** Buyer with a `grant` ownership row dated 12 Nov: `given` has it with that date; counts and spend unchanged. A course grant with `createdAt: null`: `given` entry with `at: null`.
  - **Team is left out.** A user with `isAdmin`, one with `isViewer`, one whose email is in `teamEmails`: none in `people`.
  - **No user on the order.** Two orders with `userId: null` and emails `A@x.test` and `a@x.test`: one person, `later.length` 1.
  - **Two funnels stay two rows.** Offers `fw` and `fw-mv`, one first-buyer each: two summary rows.
  - **The range filters on the first purchase.** `range: "30"` with a first purchase 40 days back and a later one 5 days back: person absent. `range: "all"`: present.
  - **`journeyRangeFrom`.** `{ range: "90" }` gives `"90"`; `{ range: "7" }`, `{ range: ["30", "90"] }` and `{}` give `"all"`.
  - **Lines for the CSV.** For user A above: two lines, `how` "first" then "later", `purchaseNo` 1 then 2, `sourceFirst` from the first order's `utmFirst`.
- [ ] **Step 2: Run it.** `npx vitest run lib/buyer-journeys.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `deriveJourneys` and `journeyRangeFrom`.** Pure, no I/O. A renewal order is one with `stripeInvoiceId`. A line is a free start when its amount is 0; it "paid" when the subscription with its `stripeSubscriptionId` has `paidInvoices > 0`. An order's purchase line is the `product` line, else the `oto` line whose offer is the host, else the first line that is not a bump. An order whose purchase line is an unpaid free start, and whose lines sum to 0, is a free start, not a purchase. Names come from `d.names` as the ledger's `nameOf` does.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Journeys: first purchase, later purchases and spend, per buyer"`

### Task 6: Journeys, the page and the download

**Files:**
- Create: `app/admin/journeys/page.tsx`, `app/admin/journeys/export/route.ts`, `app/admin/journeys/export/route.test.ts`
- Modify: `components/admin/sidebar.tsx`, `app/admin/viewer-pages.integration.test.tsx`

**Interfaces:**
- Consumes: `deriveJourneys`, `journeyRangeFrom` (Task 5); `requireViewer` (Task 2); `adminEmails()`; `Tile`, `Th`, `Empty`, `fmtDate` from `components/admin/money-ui`; `ClickableRow`.

- [ ] **Step 1: Export route test.** Mock `@/lib/admin-guard` (`requireViewer` resolves, `adminEmails` empty) and `@/lib/money-data` to return Task 5's user A. `GET /admin/journeys/export?range=all`: `content-type` is `text/csv; charset=utf-8`; first line is exactly `email,name,purchase_no,date,product,how,amount,currency,source_first,source_last`; two data rows; a product name containing `"` and `,` is quoted and doubled; `?range=nonsense` returns the same rows as `all`. A cell starting with `=`, `+`, `-` or `@` is prefixed with `'` so a spreadsheet does not run it.
- [ ] **Step 2: Run it.** Expected: FAIL, route not found.
- [ ] **Step 3: Implement the route,** following `app/admin/members/export/route.ts`, filename `journeys-YYYY-MM-DD.csv`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Add to the integration test:** the Journeys page renders as a viewer and as an admin with `Journeys`, `First purchase`, `Bought again later`, `Download CSV`, the seeded member's email, and the note `Sales made on Grow since 12 Aug 2026. Book Writer and anything sold elsewhere is not included.`; `?range=90` marks that tab `aria-current="page"`.
- [ ] **Step 6: Run it.** Expected: FAIL.
- [ ] **Step 7: Build the page.** `admin-wide`. Top: title, the note, three range tabs (All time, 90 days, 30 days), Download CSV carrying the range. Tiles: buyers, bought again later (count and share), average first purchase, average total spent. Summary table: First purchase, Buyers, Avg first purchase, Bought again later, one column per `laterColumns` entry (count and share of the row's buyers; an empty cell when 0), Avg total spent; scrolls sideways inside its own box when wide. People table: email, first purchase with date and source, bought with it, later purchases with dates, started free, given, total spent; each row opens `/admin/members/<userId>` when there is a user. `Empty` when there are no buyers in the range.
- [ ] **Step 8: Add the sidebar link** in the Customers group after Attribution: `{ href: "/admin/journeys", label: "Journeys", icon: ICON.members }`, with a one-line comment saying what it answers.
- [ ] **Step 9: Run `npx vitest run app/admin components/admin lib/buyer-journeys.test.ts`.** Expected: PASS.
- [ ] **Step 10: Look at it.** Start the dev server through the preview tool, sign in locally as an admin, open `/admin/journeys`, and check the table at desktop and phone width; then flag a local `zz-` member read-only, sign in as them, and confirm `/admin` lands on Journeys, the sidebar has five links, and the person page has no buttons. Ledger what was seen.
- [ ] **Step 11: Full suite, both ways** (Global Constraints). Expected: exit 0 twice.
- [ ] **Step 12: Commit.** `git commit -m "Journeys: the page, the download and the sidebar link"`
