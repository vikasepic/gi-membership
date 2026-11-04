# Course Access Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Access" tab on every admin course page that lists who can open the course and lets an admin add one person to that one course, remove one person from it, or give it back.

**Architecture:** One new table, `course_access`, holds per-person exceptions: `grant` (has the course with no purchase) or `remove` (does not have it, whatever they bought). `coursesForUser` in lib/courses.ts is the single access rule every reader already goes through; it learns the two kinds. A new lib/course-access.ts holds the list, the three admin writes and `liftRemovals`, which the two purchase paths in lib/checkout.ts call so paying for a course always opens it.

**Tech Stack:** Next.js 16 app router (server components + server actions), Supabase/PostgREST via `createServiceClient`, vitest integration tests against the local Supabase stack.

**Spec:** docs/superpowers/specs/2026-11-04-course-access-tab-design.md

## Global Constraints

- Migration number is `0098` (`ls supabase/migrations | tail -1` is 0097 today; re-check before writing).
- `course_access` gets `revoke all ... from anon, authenticated` AND `enable row level security` with no policies, then `notify pgrst, 'reload schema';`.
- Every server action calls `requireAdmin()` first (lib/admin-guard.ts) and uses the returned `email` as `granted_by` (fallback `"admin"`, as app/admin/members/actions.ts does).
- No email is sent by this feature. Billing is never touched.
- Ownership counts only when `status` is not `canceled`, the same rule `coursesForUser` uses.
- Read ownership for the list with `allRows` (lib/traffic.ts); PostgREST truncates at 1000 silently.
- `liftRemovals` is best-effort after the card is charged: catch, `console.error`, never throw.
- Integration tests: `zz-` fixtures with a timestamp, ordered picks, cleanup in FK order, everything inside `describe.skipIf(!canRun)`.
- Prose in UI copy and comments: no em dashes.

## Review Focus

1. A member who owns nothing at all and is hand-added: `coursesForUser` returns early today (lib/courses.ts, "productIds.length === 0 && offerIds.length === 0"). They must still get the course. Test in Task 2.
2. A hand grant on a draft course must not open it; the published filter applies to grants too. Test in Task 2.
3. A person holding the course two ways (product and offer): one Remove hides it, one Give back restores it, and the list shows both sources on one row. Test in Task 3.
4. Re-adding a removed person flips their row to `grant`: they appear in the main list again and no longer under Removed. Test in Task 3.
5. A purchase of a product that does NOT include the removed course must leave the removal alone. Test in Task 4.

---

### Task 1: Migration 0098 `course_access`

**Files:**
- Create: `supabase/migrations/0098_course_access.sql`
- Modify: `docs/DATABASE.md` (add the 0098 entry in the same style as 0095–0097)

**Interfaces:**
- Produces: table `course_access (store_id uuid, user_id uuid, course_id uuid, kind text, granted_by text, created_at timestamptz)`, primary key `(user_id, course_id)`, index on `(course_id)`.

- [ ] **Step 1: Write the migration** with the shape in the spec's "Data" section. FKs: `store_id references stores(id)`, `user_id references users(id) on delete cascade`, `course_id references courses(id) on delete cascade`. `kind` check `in ('grant','remove')`. `granted_by text not null`. Then `create index course_access_course_idx on course_access (course_id);`, the revoke, `alter table course_access enable row level security;`, and `notify pgrst, 'reload schema';`. Header comment: what it is for and a pointer to the spec.

- [ ] **Step 2: Apply locally**

Run: `docker exec -i supabase_db_grow_membership psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/0098_course_access.sql`
Expected: `CREATE TABLE`, `CREATE INDEX`, `REVOKE`, `ALTER TABLE`, `NOTIFY`, no errors.

- [ ] **Step 3: Verify the lock**

Run: `docker exec supabase_db_grow_membership psql -U postgres -At -c "select has_table_privilege('anon','course_access','select'), has_table_privilege('authenticated','course_access','select'), relrowsecurity from pg_class where relname='course_access'"`
Expected: `f|f|t`

- [ ] **Step 4: Add the DATABASE.md entry, commit**

```bash
git add supabase/migrations/0098_course_access.sql docs/DATABASE.md
git commit -m "course_access: one person's exception to a course, added or removed"
```

---

### Task 2: `coursesForUser` honours grant and remove

**Files:**
- Modify: `lib/courses.ts` (`coursesForUser`)
- Test: `lib/course-access.integration.test.ts` (create; Task 3 and 4 add to it)

**Interfaces:**
- Consumes: `course_access` from Task 1.
- Produces: unchanged signature `coursesForUser(userId: string): Promise<Course[]>`; `userOwnsCourse` follows automatically.

- [ ] **Step 1: Write the failing tests.** Fixture helpers in the file: `course(status = "published")`, `product()` (shape as lib/checkout.integration.test.ts:255, no bump), `link(productId, courseId)` into `product_courses`, `offer()` (courses-only, shape as lib/offer-courses.integration.test.ts), `owns(row)` into `ownership`, `access(courseId, kind)` into `course_access` with `granted_by: "zz-test"`. `afterEach` deletes in FK order: `course_access`, `ownership`, `product_courses`, `offer_courses`, `users`, `products`, `offers`, `courses`.

```ts
describe("coursesForUser with course_access", () => {
  it("a grant alone opens the course for someone who owns nothing", ...)
    // access(c, "grant") -> ids(coursesForUser(user)) toEqual [c]
  it("a grant does not open a draft course", ...)
    // course("draft"), access grant -> toEqual []
  it("a remove beats a product", ...)
    // product P gives c; owns P; access(c,"remove") -> toEqual []
  it("a remove beats an offer", ...)
    // offer O gives c via offer_courses; owns O; remove -> toEqual []
  it("a remove on one course leaves the product's other course open", ...)
    // P gives a and b; remove a -> toEqual [b]
  it("a canceled purchase plus a grant still opens it", ...)
    // owns P status canceled; grant c -> toEqual [c]
});
```

- [ ] **Step 2: Run, confirm they fail**

Run: `npx vitest run lib/course-access.integration.test.ts`
Expected: the grant tests and remove tests FAIL (grant returns `[]`, removes still return the course). The canceled-plus-grant test also fails.

- [ ] **Step 3: Implement.** Read `course_access` (`course_id, kind`) for the user BEFORE the early return; the early return becomes "no products, no offers and no grants". Fetch granted courses with `db.from("courses").select(COURSE_COLUMNS).in("id", grantIds)` alongside the two existing reads, add them to `byId`, then delete every removed id from `byId` before returning. Published filter stays as is. Update the function's comment with one paragraph on the two kinds and the spec path.

- [ ] **Step 4: Run, confirm they pass**, then run `npx vitest run lib/offer-courses.integration.test.ts lib/course-content.integration.test.ts` to see existing callers unchanged.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/courses.ts lib/course-access.integration.test.ts
git commit -m "A course can be given to or taken from one person, whatever they bought"
```

---

### Task 3: lib/course-access.ts, the list and the three writes

**Files:**
- Create: `lib/course-access.ts`
- Test: `lib/course-access.integration.test.ts`

**Interfaces:**
- Consumes: `coursesForUser` (Task 2), `createMember` (lib/members.ts), `getStoreId` (lib/store), `allRows` (lib/traffic.ts).
- Produces:

```ts
export type CourseAccessRow = { userId: string; email: string; name: string | null; how: string[]; since: string };
export type CourseRemovedRow = { userId: string; email: string; name: string | null; removedBy: string; at: string };
export async function listCourseAccess(courseId: string): Promise<{ people: CourseAccessRow[]; removed: CourseRemovedRow[] }>;
export async function addCourseAccess(args: { courseId: string; email: string; fullName: string | null; by: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }>;
export async function removeCourseAccess(args: { courseId: string; userId: string; by: string }): Promise<void>;
export async function giveBackCourseAccess(args: { courseId: string; userId: string }): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

```ts
describe("listCourseAccess", () => {
  it("labels every source on one row", ...)
    // owns P (source "purchase") giving c, owns offer O giving c, grant c
    // -> people[0].how toEqual [`Bought ${P.title}`, O.name, "Added by zz-test"]
  it("says Granted for an admin-granted product", ...)
    // owns P with source "grant", no offer_id -> how toEqual [`Granted ${P.title}`]
  it("leaves out a canceled purchase", ...)            // people toEqual []
  it("puts a removed person under Removed only", ...)
    // owns P giving c; remove c -> people [], removed[0] matches { userId, removedBy: "zz-test" }
  it("since is the earliest source date", ...)
});

describe("add, remove, give back", () => {
  it("add creates the member and grants just that course", ...)
    // new zz- email -> ok, message `Added ${email}`; coursesForUser ids toEqual [c]
  it("add reports someone who already had it", ...)
    // owns P giving c -> message `${email} already had this course`; a grant row now exists
  it("re-adding a removed person puts them back in the list", ...)
    // remove then add -> removed toEqual [], people has them
  it("remove writes a remove row when a purchase gives it", ...)
  it("remove deletes the row when only a hand grant gave it", ...)
    // grant, remove -> no course_access row at all
  it("one remove hides a course held two ways, one give back restores it", ...)
    // owns P and O both giving c; remove -> coursesForUser []; giveBack -> [c]
});
```

- [ ] **Step 2: Run, confirm they fail** (`Cannot find module '@/lib/course-access'`).

Run: `npx vitest run lib/course-access.integration.test.ts`

- [ ] **Step 3: Implement.** Labels, exactly: an ownership row with `offer_id` reads as the offer's `name`; a row with only `product_id` reads `Bought <title>` unless `source = 'grant'`, then `Granted <title>`; a grant row reads `Added by <granted_by>`. Ownership read: `product_id in (product_courses for course)` or `offer_id in (offer_courses for course)`, status not canceled, through `allRows`, ordered by `created_at`. Users come from `users` (`id, email, username`); `name` is `username`. People sorted by name then email. `addCourseAccess` lowercases via `createMember`, upserts `(store_id, user_id, course_id, kind: "grant", granted_by: by)` on conflict `user_id,course_id`; "already had" means the person had the course through a purchase before the upsert. `removeCourseAccess` upserts `kind: "remove"` when a non-canceled purchase still gives the course, otherwise deletes the row. `giveBackCourseAccess` deletes only a `remove` row.

- [ ] **Step 4: Run, confirm they pass**

Run: `npx vitest run lib/course-access.integration.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/course-access.ts lib/course-access.integration.test.ts
git commit -m "Who has a course, and adding or removing one person"
```

---

### Task 4: A purchase lifts a removal

**Files:**
- Modify: `lib/course-access.ts` (add `liftRemovals`)
- Modify: `lib/checkout.ts` (after the base grant in `finalizeOrder` near line 1249, and at the end of each branch of `grantOfferOwnership`, ~1620–1760)
- Test: `lib/course-access.integration.test.ts`

**Interfaces:**
- Produces: `export async function liftRemovals(userId: string, from: { productId?: string | null; offerId?: string | null }): Promise<void>`; never throws.

- [ ] **Step 1: Write the failing tests**

```ts
describe("a purchase lifts a removal", () => {
  it("lifts a removal for a course the product includes", ...)
    // remove c; liftRemovals(user, { productId: P }) -> no remove row
  it("leaves a removal for a course the product does not include", ...)
    // remove c; P2 gives only d; liftRemovals(user, { productId: P2 }) -> remove row still there
  it("an offer that grants a product lifts the product's courses and its own", ...)
    // offer grant_type "product" grant_product_id P (P gives a), offer_courses gives b;
    // remove a and b; grantOfferOwnership(storeId, user, await getOffer(O), "grant", null) -> no remove rows
  it("an admin grantProduct lifts nothing", ...)
    // remove c; grantProduct({ userId, productId: P, grantedBy: "zz-test" }) -> remove row still there
});
```

- [ ] **Step 2: Run, confirm the lift tests fail** (`liftRemovals` not exported; offer test keeps rows).

- [ ] **Step 3: Implement `liftRemovals`** (course ids from `product_courses` for `productId` and `offer_courses` for `offerId`, delete `remove` rows for the user in those ids; whole body in try/catch with `console.error("liftRemovals", ...)`), then call it in lib/checkout.ts: `finalizeOrder` after the base product insert with `{ productId }`; `grantOfferOwnership` once per branch after its ownership write with `{ productId: offer.grantProductId, offerId: offer.id }`. Comment at each call: why (a buyer is never charged for a course they cannot open; renewals do not come through here). Do not touch `grantProduct` or `grantOfferAccess`.

- [ ] **Step 4: Run, confirm they pass**, plus `npx vitest run lib/offer-courses.integration.test.ts lib/checkout.integration.test.ts`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/course-access.ts lib/checkout.ts lib/course-access.integration.test.ts
git commit -m "Paying for a course gives it back to someone who was removed from it"
```

---

### Task 5: The Access tab

**Files:**
- Create: `app/admin/courses/[id]/(tabs)/access/page.tsx` (server component)
- Create: `app/admin/courses/[id]/(tabs)/access/actions.ts` (`"use server"`)
- Create: `components/admin/course-access.tsx` (`"use client"` add form)
- Modify: `components/admin/course-tabs.tsx` (TABS: `{ href: "/access", label: "Access" }` after Cover & files; update the "three jobs" comment)

**Interfaces:**
- Consumes: everything Task 3 produces.
- Produces: actions `addCourseAccessAction(prev: CourseAccessState, fd: FormData): Promise<CourseAccessState>` (`CourseAccessState = { error?: string; message?: string }`), `removeCourseAccessAction(fd: FormData)`, `giveBackCourseAccessAction(fd: FormData)`. Form fields: `courseId`, `userId`, `email`, `fullName`. Each action: `requireAdmin()`, call the lib function, `revalidatePath(`/admin/courses/${courseId}/access`)`.

- [ ] **Step 1: Build the page.** Header line: "<n> people can open this course" (one: "1 person"). Below it the add form, modelled on components/admin/add-member.tsx (`useActionState`, `useSlowSave`, `inputClass`, same error/message boxes): email (required) and full name (optional), button "Add". Then a table: name (or email when no name) linking to `/admin/members/<userId>`, email, How (sources joined with ", "), Since (date), and a Remove button posting `removeCourseAccessAction`. When `removed` is non-empty, a "Removed" heading and a table: name, email, removed by, when, and "Give back". Empty main list: "Nobody has this course yet." If the course is a draft, one muted line: "This course is a draft, so nobody on this list can open it until it is published."

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v '^tmp-'`
Expected: no output.

- [ ] **Step 3: Verify in the browser.** Start the dev server with preview_start, open a local published course's Access tab as admin (see the visual-verification memory for the forged-cookie route), add a `zz-` email, confirm it appears with "Added by …"; Remove it, confirm the row is gone and not under Removed (hand grant only); add a person who owns a product giving the course, Remove, confirm they sit under Removed; Give back, confirm they return. Screenshot the tab with both tables. Delete the zz- rows afterwards.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/courses/[id]/(tabs)/access" components/admin/course-access.tsx components/admin/course-tabs.tsx
git commit -m "Access tab: who has a course, add or remove one person"
```

---

### Task 6: Ship (only on the owner's word)

- [ ] **Step 1: Full suite, CI-style.** Move `.env.local` to the scratchpad, run `npx vitest run --exclude 'tmp-*/**'; echo "exit $?"`, move it back. Expected: `exit 0`.
- [ ] **Step 2: Commit the spec and this plan** with the work.
- [ ] **Step 3: Migration on production by hand**: `ssh root@187.127.154.67 "docker exec -i supabase-db-fuv6argrk5j8ogd4y3hi5tu0 psql -U postgres -v ON_ERROR_STOP=1" < supabase/migrations/0098_course_access.sql`, then the Task 1 Step 3 privilege check against production. Expected: `f|f|t`.
- [ ] **Step 4: Push procedure from AGENTS.md**: `git fetch` and confirm no one else's commits on origin/main, deploy notice (bearer `GI_CRON_SECRET`, never printed), wait 62s, `git push origin main`, wait for image `r11f09w16h8afmpt0ilxey2q:<sha>` in `docker ps`, `gh run list --branch main --limit 1` green.
- [ ] **Step 5: Smoke on production**: open one course's Access tab and check the count matches a hand query of ownership for that course.
