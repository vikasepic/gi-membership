# Course Content Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the store owner author full courses (chapters, lessons, video, rich text, images, downloads) in admin, and let students navigate them with per-item progress and auto-completion.

**Architecture:** One self-referencing table `course_items` (rename of the empty `lessons` table) where `parent_id is null` means chapter and a set `parent_id` means lesson. Chapters and lessons share one shape, so a chapter can hold its own content. Covers live in a new public bucket; inline images and attachments stay in the existing private bucket behind the ownership-gated route.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4, self-hosted Supabase (Postgres + Storage), Vitest, TipTap (new), sanitize-html (new).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-course-content-management-design.md` — read it before starting.
- Video is **embed-only** (Vimeo/YouTube/Loom). Never add upload-video code paths.
- **No paid asset on a public path.** Covers → public bucket. Inline images + attachments → private bucket via `/api/...` ownership-gated routes only.
- DB is **snake_case**; the API boundary is **camelCase** — convert with `camelize()` from `@/lib/case`.
- Server-side data access uses `createServiceClient()` from `@/lib/supabase/server` (RLS is deferred; every query filters by `store_id`/ownership explicitly).
- All admin mutations call `await requireAdmin()` from `@/lib/admin-guard` as the first statement.
- Migrations are `supabase/migrations/000N_*.sql`, applied locally with `npx supabase db reset`.
- Tests: `npm test` (Vitest). Integration tests self-gate with `describe.skipIf` when services are absent, and clean up rows they create.
- Typecheck with `npx tsc --noEmit`; lint with `npx next lint`. Both must be clean before commit.
- **Never run `npm run build` while the dev server is running** — both write `.next` and it corrupts dev CSS.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0003_course_items.sql` | Rename + extend schema, guards, buckets, grants |
| `lib/sanitize-html.ts` | Pure: strip dangerous HTML from WYSIWYG body |
| `lib/curriculum.ts` | Tree reads (student + admin), progress rollup |
| `lib/curriculum-admin.ts` | Item CRUD, publish, reorder, delete |
| `lib/progress.ts` | Per-item completion, `manual_override` rules |
| `app/admin/products/[id]/curriculum/actions.ts` | Admin server actions |
| `components/admin/curriculum-outline.tsx` | Chapter/lesson outline + reorder buttons |
| `components/admin/item-editor.tsx` | One editor for chapter or lesson |
| `components/editor/rich-text.tsx` | TipTap wrapper |
| `app/api/media/cover/route.ts` | Cover upload → public bucket |
| `app/api/media/item/[itemId]/[index]/route.ts` | Gated attachment/image delivery |
| `app/api/progress/route.ts` | Idempotent completion endpoint |
| `components/player/tracked-embed.tsx` | YouTube/Vimeo 50% signal |
| `components/library/dwell-tracker.tsx` | 5-min visible-time signal |
| `app/(store)/library/[slug]/[itemId]/page.tsx` | Student item page |

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/0003_course_items.sql`
- Test: verified by SQL assertions in Step 3 (schema task, no unit test)

**Interfaces:**
- Consumes: existing `lessons`, `products`, `progress` tables from `0001_init.sql`
- Produces: table `course_items` with columns `id, store_id, product_id, parent_id, title, subtitle, body_html, video_embed_url, cover_path, attachments, is_published, sort_order, created_at, updated_at`; `products.chapter_label`, `products.lesson_label`, product type `'course'`; `progress.completed_source`, `progress.manual_override`; public bucket `public-media`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_course_items.sql`:

```sql
-- Course content: chapters + lessons as one self-referencing tree.
-- parent_id null = chapter; parent_id set = lesson under that chapter.
-- A chapter may carry its own content when it has no children.

-- Rename the empty lessons table. Postgres carries FKs (progress.lesson_id)
-- through a rename automatically.
alter table lessons rename to course_items;

-- Superseded by video_embed_url + attachments.
alter table course_items
  drop column media_mode,
  drop column media_path,
  drop column media_embed_url;

alter table course_items
  add column parent_id uuid references course_items(id) on delete cascade,
  add column subtitle text,
  add column body_html text,
  add column video_embed_url text,
  add column cover_path text,
  add column attachments jsonb not null default '[]'::jsonb,
  add column is_published boolean not null default false;

-- Depth cap: a lesson's parent must itself be a chapter (parent_id null),
-- so nesting can never exceed two levels.
create or replace function course_items_depth_guard()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'course_items: an item cannot be its own parent';
    end if;
    if exists (select 1 from course_items p
               where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'course_items: nesting deeper than chapter > lesson is not allowed';
    end if;
  end if;
  return new;
end;
$$;

create trigger course_items_depth before insert or update on course_items
  for each row execute function course_items_depth_guard();

-- Sibling ordering: two items cannot claim one position. Chapters
-- (parent_id null) need a separate partial index since null <> null.
create unique index course_items_chapter_order_uq
  on course_items (product_id, sort_order) where parent_id is null;
create unique index course_items_lesson_order_uq
  on course_items (parent_id, sort_order) where parent_id is not null;

create index course_items_parent_idx on course_items (parent_id, sort_order);

-- Per-course vocabulary + a course product type.
alter table products
  add column chapter_label text not null default 'Chapter',
  add column lesson_label  text not null default 'Lesson';

alter table products drop constraint products_type_check;
alter table products add constraint products_type_check
  check (type in ('pdf','audio','video','app','course'));

-- Per-item progress: how it completed, and whether the student took manual
-- control (after which auto-signals must never touch the row).
alter table progress
  add column completed_source text
    check (completed_source in ('manual','video','download','dwell')),
  add column manual_override boolean not null default false;

-- Public bucket for covers/thumbnails (marketing imagery shown pre-purchase).
-- Paid assets stay in the private 'paid-assets' bucket.
insert into storage.buckets (id, name, public)
values ('public-media', 'public-media', true)
on conflict (id) do nothing;

-- Same grants pattern as 0002 for the renamed/new objects.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db reset`
Expected: output includes `Applying migration 0003_course_items.sql...` and finishes without error.

- [ ] **Step 3: Verify the schema and guards**

Run:

```bash
PSQL=/opt/homebrew/opt/postgresql@16/bin/psql
URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
SID=$($PSQL "$URL" -At -c "select id from stores where slug='greater-inside';")
PID=$($PSQL "$URL" -At -c "select id from products where slug='field-guide';")
# chapter + lesson insert should succeed
CH=$($PSQL "$URL" -At -c "insert into course_items (store_id,product_id,title,sort_order,is_published) values ('$SID','$PID','Ch1',0,true) returning id;")
LS=$($PSQL "$URL" -At -c "insert into course_items (store_id,product_id,parent_id,title,sort_order,is_published) values ('$SID','$PID','$CH','L1',0,true) returning id;")
echo "chapter=$CH lesson=$LS"
# third level must FAIL
$PSQL "$URL" -c "insert into course_items (store_id,product_id,parent_id,title,sort_order) values ('$SID','$PID','$LS','L2',0);" 2>&1 | grep -c "nesting deeper"
# duplicate sibling position must FAIL
$PSQL "$URL" -c "insert into course_items (store_id,product_id,title,sort_order) values ('$SID','$PID','Ch1 dup',0);" 2>&1 | grep -c "course_items_chapter_order_uq"
$PSQL "$URL" -c "delete from course_items where product_id='$PID';"
```

Expected: `chapter=<uuid> lesson=<uuid>`, then `1` (depth rejected), then `1` (duplicate position rejected).

- [ ] **Step 4: Fix the code that referenced the old table**

`lib/library.ts` still queries `lessons` and its now-dropped `media_*` columns, so the
library page breaks the moment the migration lands. In `lib/library.ts`:

Replace the `Lesson` type with a re-export of the new shape:

```typescript
import type { CourseItem } from "@/lib/curriculum";
export type Lesson = CourseItem;
```

In `getOwnedProduct`, replace the lessons query with:

```typescript
  const { data: ls } = await db
    .from("course_items")
    .select("id, product_id, parent_id, title, subtitle, body_html, video_embed_url, cover_path, attachments, is_published, sort_order")
    .eq("product_id", product.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });
  return { product, lessons: camelize<Lesson[]>(ls ?? []) };
```

Note: `lib/curriculum.ts` is created in Task 3. Until then, inline the type in
`lib/library.ts` rather than importing it, then switch to the import in Task 3.

- [ ] **Step 5: Verify nothing regressed**

Run: `npx tsc --noEmit && npm test`
Expected: TSC clean; all existing suites pass (17 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_course_items.sql lib/library.ts
git commit -m "feat: course_items schema (chapter/lesson tree, guards, public bucket)"
```

---

### Task 2: HTML sanitizer

**Files:**
- Create: `lib/sanitize-html.ts`
- Test: `lib/sanitize-html.test.ts`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces: `sanitizeBodyHtml(dirty: string): string` — strips `<script>`, event handlers, `<iframe>`, `javascript:` URLs; keeps headings, `<p>`, `<strong>`, `<em>`, `<ul>/<ol>/<li>`, `<a href>`, `<img src alt>`, `<blockquote>`, `<code>`

- [ ] **Step 1: Install the dependency**

Run: `npm i sanitize-html && npm i -D @types/sanitize-html`
Expected: installs without error.

- [ ] **Step 2: Write the failing test**

Create `lib/sanitize-html.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sanitizeBodyHtml } from "@/lib/sanitize-html";

describe("sanitizeBodyHtml", () => {
  it("keeps formatting tags used by the editor", () => {
    const html = "<h2>Title</h2><p><strong>bold</strong> and <em>italic</em></p><ul><li>one</li></ul>";
    expect(sanitizeBodyHtml(html)).toBe(html);
  });

  it("keeps links and images with their attributes", () => {
    const html = '<a href="https://example.com">link</a><img src="/api/media/item/1/0" alt="pic" />';
    const out = sanitizeBodyHtml(html);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('src="/api/media/item/1/0"');
    expect(out).toContain('alt="pic"');
  });

  it("strips script tags and their contents", () => {
    expect(sanitizeBodyHtml('<p>hi</p><script>alert(1)</script>')).toBe("<p>hi</p>");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeBodyHtml('<img src="x" onerror="alert(1)" />');
    expect(out).not.toContain("onerror");
  });

  it("strips iframes (video is a separate embed field)", () => {
    expect(sanitizeBodyHtml('<iframe src="https://evil.com"></iframe>')).toBe("");
  });

  it("strips javascript: urls", () => {
    const out = sanitizeBodyHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("returns an empty string for null-ish input", () => {
    expect(sanitizeBodyHtml("")).toBe("");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/sanitize-html.test.ts`
Expected: FAIL — cannot find module `@/lib/sanitize-html`.

- [ ] **Step 4: Write the implementation**

Create `lib/sanitize-html.ts`:

```typescript
import sanitize from "sanitize-html";

// WYSIWYG body is authored in admin and rendered to students — the one place
// arbitrary HTML enters the app. Sanitize on SAVE (server side) so stored
// content is always safe, regardless of what the editor or a paste produced.
export function sanitizeBodyHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitize(dirty, {
    allowedTags: [
      "p", "br", "h2", "h3", "h4",
      "strong", "em", "u", "s",
      "ul", "ol", "li",
      "blockquote", "code", "pre",
      "a", "img", "hr",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title"],
    },
    // http/https only, plus our own relative gated media paths.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/sanitize-html.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/sanitize-html.ts lib/sanitize-html.test.ts package.json package-lock.json
git commit -m "feat: server-side HTML sanitizer for lesson bodies"
```

---

### Task 3: Curriculum types and reads

**Files:**
- Create: `lib/curriculum.ts`
- Test: `lib/curriculum.test.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/server`, `camelize` from `@/lib/case`, `getStoreId` from `@/lib/store`
- Produces:
  - `type CourseItem = { id, productId, parentId: string|null, title, subtitle: string|null, bodyHtml: string|null, videoEmbedUrl: string|null, coverPath: string|null, attachments: Attachment[], isPublished: boolean, sortOrder: number }`
  - `type Attachment = { path: string; name: string; size: number; mime: string }`
  - `type CurriculumNode = CourseItem & { children: CourseItem[] }`
  - `buildTree(items: CourseItem[]): CurriculumNode[]` (pure, exported for tests)
  - `rollupProgress(items: CourseItem[], completedIds: Set<string>): { done: number; total: number }` (pure)
  - `listCurriculum(productId: string, opts?: { includeDrafts?: boolean }): Promise<CurriculumNode[]>` — defaults to published-only; admin callers must pass `{ includeDrafts: true }` to see drafts
  - `getCourseItem(itemId: string): Promise<CourseItem | null>`

- [ ] **Step 1: Write the failing test**

Create `lib/curriculum.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildTree, rollupProgress, type CourseItem } from "@/lib/curriculum";

const item = (over: Partial<CourseItem> & { id: string }): CourseItem => ({
  productId: "p1",
  parentId: null,
  title: "t",
  subtitle: null,
  bodyHtml: null,
  videoEmbedUrl: null,
  coverPath: null,
  attachments: [],
  isPublished: true,
  sortOrder: 0,
  ...over,
});

describe("buildTree", () => {
  it("nests lessons under their chapter in sort order", () => {
    const tree = buildTree([
      item({ id: "l2", parentId: "c1", sortOrder: 1 }),
      item({ id: "c1", sortOrder: 0 }),
      item({ id: "l1", parentId: "c1", sortOrder: 0 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("c1");
    expect(tree[0].children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("orders chapters by sortOrder", () => {
    const tree = buildTree([item({ id: "b", sortOrder: 1 }), item({ id: "a", sortOrder: 0 })]);
    expect(tree.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("keeps a childless chapter as a content node with no children", () => {
    const tree = buildTree([item({ id: "c1" })]);
    expect(tree[0].children).toEqual([]);
  });

  it("drops an orphan whose parent is absent", () => {
    const tree = buildTree([item({ id: "l1", parentId: "missing" })]);
    expect(tree).toEqual([]);
  });
});

describe("rollupProgress", () => {
  it("counts a childless chapter and every lesson, but not a chapter with children", () => {
    const items = [
      item({ id: "c1" }),
      item({ id: "l1", parentId: "c1" }),
      item({ id: "l2", parentId: "c1" }),
      item({ id: "c2" }),
    ];
    expect(rollupProgress(items, new Set(["l1"]))).toEqual({ done: 1, total: 3 });
  });

  it("ignores unpublished items", () => {
    const items = [item({ id: "c1" }), item({ id: "l1", parentId: "c1", isPublished: false })];
    expect(rollupProgress(items, new Set())).toEqual({ done: 0, total: 1 });
  });

  it("reports zero of zero for an empty course", () => {
    expect(rollupProgress([], new Set())).toEqual({ done: 0, total: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/curriculum.test.ts`
Expected: FAIL — cannot find module `@/lib/curriculum`.

- [ ] **Step 3: Write the implementation**

Create `lib/curriculum.ts`:

```typescript
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";

// Chapters and lessons are one self-referencing tree: parent_id null = chapter,
// set = lesson. A chapter with no children is itself a content node.

export type Attachment = { path: string; name: string; size: number; mime: string };

export type CourseItem = {
  id: string;
  productId: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  bodyHtml: string | null;
  videoEmbedUrl: string | null;
  coverPath: string | null;
  attachments: Attachment[];
  isPublished: boolean;
  sortOrder: number;
};

export type CurriculumNode = CourseItem & { children: CourseItem[] };

export const ITEM_COLUMNS =
  "id, product_id, parent_id, title, subtitle, body_html, video_embed_url, cover_path, attachments, is_published, sort_order";

const bySort = (a: CourseItem, b: CourseItem) => a.sortOrder - b.sortOrder;

// Orphans — a parentId pointing at a missing chapter — are excluded by
// construction: they attach to no chapter, so they render nowhere.
export function buildTree(items: CourseItem[]): CurriculumNode[] {
  return items
    .filter((i) => i.parentId === null)
    .sort(bySort)
    .map((c) => ({
      ...c,
      children: items.filter((i) => i.parentId === c.id).sort(bySort),
    }));
}

// A chapter WITH children is a container, not a completable unit. Countable
// items are every lesson plus every childless chapter.
export function rollupProgress(
  items: CourseItem[],
  completedIds: Set<string>,
): { done: number; total: number } {
  const published = items.filter((i) => i.isPublished);
  const parentIds = new Set(published.map((i) => i.parentId).filter(Boolean) as string[]);
  const countable = published.filter((i) => i.parentId !== null || !parentIds.has(i.id));
  return {
    done: countable.filter((i) => completedIds.has(i.id)).length,
    total: countable.length,
  };
}

// Default: published items only (fail safe). Admin callers must opt in with
// includeDrafts: true to see unpublished items. This prevents draft lessons
// from accidentally leaking to paying students.
export async function listCurriculum(
  productId: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<CurriculumNode[]> {
  const db = createServiceClient();
  let q = db.from("course_items").select(ITEM_COLUMNS).eq("product_id", productId);
  if (!opts.includeDrafts) q = q.eq("is_published", true);
  const { data, error } = await q.order("sort_order", { ascending: true });
  if (error) throw new Error(`listCurriculum: ${error.message}`);
  return buildTree(camelize<CourseItem[]>(data ?? []));
}

export async function getCourseItem(itemId: string): Promise<CourseItem | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("course_items")
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(`getCourseItem: ${error.message}`);
  return data ? camelize<CourseItem>(data) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/curriculum.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/curriculum.ts lib/curriculum.test.ts
git commit -m "feat: curriculum tree reads and progress rollup"
```

---

### Task 4: Curriculum admin CRUD and reordering

**Files:**
- Create: `lib/curriculum-admin.ts`
- Test: `lib/curriculum-admin.test.ts`

**Interfaces:**
- Consumes: `CourseItem`, `ITEM_COLUMNS` from `@/lib/curriculum`; `createServiceClient`; `getStoreId` from `@/lib/store`; `sanitizeBodyHtml` from `@/lib/sanitize-html`
- Produces:
  - `nextSortOrder(siblings: { sortOrder: number }[]): number` (pure)
  - `swapOrder<T extends { id: string; sortOrder: number }>(siblings: T[], id: string, dir: "up" | "down"): { id: string; sortOrder: number }[]` (pure — returns the two rows to write, or `[]` at a boundary)
  - `type ItemInput = { title: string; subtitle: string|null; bodyHtml: string|null; videoEmbedUrl: string|null; isPublished: boolean }`
  - `createItem(productId: string, parentId: string|null, input: ItemInput): Promise<string>`
  - `updateItem(itemId: string, input: ItemInput): Promise<void>`
  - `deleteItem(itemId: string): Promise<void>`
  - `moveItem(itemId: string, dir: "up"|"down"): Promise<void>`
  - `setCover(itemId: string, coverPath: string): Promise<void>`
  - `addAttachment(itemId: string, a: Attachment): Promise<void>`
  - `removeAttachment(itemId: string, path: string): Promise<void>`
  - `countChildren(itemId: string): Promise<number>`

- [ ] **Step 1: Write the failing test**

Create `lib/curriculum-admin.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { nextSortOrder, swapOrder } from "@/lib/curriculum-admin";

describe("nextSortOrder", () => {
  it("starts at zero for the first item", () => {
    expect(nextSortOrder([])).toBe(0);
  });
  it("appends after the highest existing position", () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 3 }])).toBe(4);
  });
});

describe("swapOrder", () => {
  const rows = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ];

  it("swaps an item with the one above it", () => {
    expect(swapOrder(rows, "b", "up")).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
    ]);
  });

  it("swaps an item with the one below it", () => {
    expect(swapOrder(rows, "b", "down")).toEqual([
      { id: "b", sortOrder: 2 },
      { id: "c", sortOrder: 1 },
    ]);
  });

  it("returns nothing when already first", () => {
    expect(swapOrder(rows, "a", "up")).toEqual([]);
  });

  it("returns nothing when already last", () => {
    expect(swapOrder(rows, "c", "down")).toEqual([]);
  });

  it("returns nothing for an unknown id", () => {
    expect(swapOrder(rows, "zzz", "up")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/curriculum-admin.test.ts`
Expected: FAIL — cannot find module `@/lib/curriculum-admin`.

- [ ] **Step 3: Write the implementation**

Create `lib/curriculum-admin.ts`:

```typescript
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";
import { sanitizeBodyHtml } from "@/lib/sanitize-html";
import { ITEM_COLUMNS, type Attachment, type CourseItem } from "@/lib/curriculum";

export type ItemInput = {
  title: string;
  subtitle: string | null;
  bodyHtml: string | null;
  videoEmbedUrl: string | null;
  isPublished: boolean;
};

export function nextSortOrder(siblings: { sortOrder: number }[]): number {
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.sortOrder)) + 1;
}

// Returns only the rows that must be written. Empty at a boundary so callers
// can no-op without special-casing.
export function swapOrder<T extends { id: string; sortOrder: number }>(
  siblings: T[],
  id: string,
  dir: "up" | "down",
): { id: string; sortOrder: number }[] {
  const ordered = [...siblings].sort((a, b) => a.sortOrder - b.sortOrder);
  const i = ordered.findIndex((s) => s.id === id);
  if (i === -1) return [];
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return [];
  return [
    { id: ordered[i].id, sortOrder: ordered[j].sortOrder },
    { id: ordered[j].id, sortOrder: ordered[i].sortOrder },
  ];
}

async function siblingsOf(productId: string, parentId: string | null): Promise<CourseItem[]> {
  const db = createServiceClient();
  let q = db.from("course_items").select(ITEM_COLUMNS).eq("product_id", productId);
  q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
  const { data } = await q;
  return camelize<CourseItem[]>(data ?? []);
}

export async function createItem(
  productId: string,
  parentId: string | null,
  input: ItemInput,
): Promise<string> {
  const db = createServiceClient();
  const sort = nextSortOrder(await siblingsOf(productId, parentId));
  const { data, error } = await db
    .from("course_items")
    .insert({
      store_id: await getStoreId(),
      product_id: productId,
      parent_id: parentId,
      title: input.title,
      subtitle: input.subtitle,
      body_html: sanitizeBodyHtml(input.bodyHtml ?? ""),
      video_embed_url: input.videoEmbedUrl,
      is_published: input.isPublished,
      sort_order: sort,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createItem: ${error.message}`);
  return data.id as string;
}

export async function updateItem(itemId: string, input: ItemInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("course_items")
    .update({
      title: input.title,
      subtitle: input.subtitle,
      body_html: sanitizeBodyHtml(input.bodyHtml ?? ""),
      video_embed_url: input.videoEmbedUrl,
      is_published: input.isPublished,
    })
    .eq("id", itemId);
  if (error) throw new Error(`updateItem: ${error.message}`);
}

export async function deleteItem(itemId: string): Promise<void> {
  const db = createServiceClient();
  // Children cascade via the FK; progress rows cascade via progress.lesson_id.
  const { error } = await db.from("course_items").delete().eq("id", itemId);
  if (error) throw new Error(`deleteItem: ${error.message}`);
}

export async function countChildren(itemId: string): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("course_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", itemId);
  return count ?? 0;
}

export async function moveItem(itemId: string, dir: "up" | "down"): Promise<void> {
  const db = createServiceClient();
  const current = await db
    .from("course_items")
    .select("id, product_id, parent_id, sort_order")
    .eq("id", itemId)
    .single();
  if (current.error || !current.data) throw new Error("moveItem: item not found");
  const row = camelize<CourseItem>(current.data);
  const writes = swapOrder(await siblingsOf(row.productId, row.parentId), itemId, dir);
  if (writes.length === 0) return;
  // Park one row at a free position first — the sibling unique index rejects a
  // direct swap.
  await db.from("course_items").update({ sort_order: -1 }).eq("id", writes[0].id);
  await db.from("course_items").update({ sort_order: writes[1].sortOrder }).eq("id", writes[1].id);
  await db.from("course_items").update({ sort_order: writes[0].sortOrder }).eq("id", writes[0].id);
}

export async function setCover(itemId: string, coverPath: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("course_items").update({ cover_path: coverPath }).eq("id", itemId);
  if (error) throw new Error(`setCover: ${error.message}`);
}

export async function addAttachment(itemId: string, a: Attachment): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("course_items").select("attachments").eq("id", itemId).single();
  const list = ((data?.attachments as Attachment[]) ?? []).concat(a);
  const { error } = await db.from("course_items").update({ attachments: list }).eq("id", itemId);
  if (error) throw new Error(`addAttachment: ${error.message}`);
}

export async function removeAttachment(itemId: string, path: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("course_items").select("attachments").eq("id", itemId).single();
  const list = ((data?.attachments as Attachment[]) ?? []).filter((a) => a.path !== path);
  const { error } = await db.from("course_items").update({ attachments: list }).eq("id", itemId);
  if (error) throw new Error(`removeAttachment: ${error.message}`);
  await db.storage.from("paid-assets").remove([path]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/curriculum-admin.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/curriculum-admin.ts lib/curriculum-admin.test.ts
git commit -m "feat: curriculum admin CRUD, reorder and attachments"
```

---

### Task 5: Progress and auto-completion rules

**Files:**
- Create: `lib/progress.ts`
- Test: `lib/progress.test.ts`

**Interfaces:**
- Consumes: `createServiceClient`, `getStoreId`
- Produces:
  - `type CompletionSource = "manual" | "video" | "download" | "dwell"`
  - `shouldApply(existing: { completed: boolean; manualOverride: boolean } | null, source: CompletionSource, completed: boolean): boolean` (pure)
  - `setItemCompletion(userId, productId, itemId, completed: boolean, source: CompletionSource): Promise<void>`
  - `completedItemIds(userId: string, productId: string): Promise<Set<string>>`

- [ ] **Step 1: Write the failing test**

Create `lib/progress.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { shouldApply } from "@/lib/progress";

describe("shouldApply", () => {
  it("applies an auto signal when there is no existing row", () => {
    expect(shouldApply(null, "video", true)).toBe(true);
  });

  it("applies a manual completion when there is no existing row", () => {
    expect(shouldApply(null, "manual", true)).toBe(true);
  });

  it("ignores an auto signal for an already-complete item", () => {
    expect(shouldApply({ completed: true, manualOverride: false }, "dwell", true)).toBe(false);
  });

  it("ignores every auto signal once the student took manual control", () => {
    expect(shouldApply({ completed: false, manualOverride: true }, "video", true)).toBe(false);
    expect(shouldApply({ completed: false, manualOverride: true }, "dwell", true)).toBe(false);
    expect(shouldApply({ completed: false, manualOverride: true }, "download", true)).toBe(false);
  });

  it("always honours a manual toggle, including un-completing", () => {
    expect(shouldApply({ completed: true, manualOverride: false }, "manual", false)).toBe(true);
    expect(shouldApply({ completed: false, manualOverride: true }, "manual", true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/progress.test.ts`
Expected: FAIL — cannot find module `@/lib/progress`.

- [ ] **Step 3: Write the implementation**

Create `lib/progress.ts`:

```typescript
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

export type CompletionSource = "manual" | "video" | "download" | "dwell";

// Manual intent wins permanently: once a student touches the checkbox (either
// direction) auto-signals must never move it again, or un-completing would be
// instantly reverted by the next dwell/video signal.
export function shouldApply(
  existing: { completed: boolean; manualOverride: boolean } | null,
  source: CompletionSource,
  completed: boolean,
): boolean {
  if (source === "manual") return true;
  if (!existing) return completed;
  if (existing.manualOverride) return false;
  return completed && !existing.completed;
}

export async function setItemCompletion(
  userId: string,
  productId: string,
  itemId: string,
  completed: boolean,
  source: CompletionSource,
): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("progress")
    .select("id, completed, manual_override")
    .eq("user_id", userId)
    .eq("lesson_id", itemId)
    .maybeSingle();

  const existing = data
    ? { completed: data.completed as boolean, manualOverride: data.manual_override as boolean }
    : null;
  if (!shouldApply(existing, source, completed)) return;

  const patch = {
    completed,
    completed_source: source,
    manual_override: source === "manual" ? true : (existing?.manualOverride ?? false),
  };

  if (data) {
    await db.from("progress").update(patch).eq("id", data.id);
  } else {
    await db.from("progress").insert({
      store_id: await getStoreId(),
      user_id: userId,
      product_id: productId,
      lesson_id: itemId,
      ...patch,
    });
  }
}

export async function completedItemIds(userId: string, productId: string): Promise<Set<string>> {
  const db = createServiceClient();
  const { data } = await db
    .from("progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("completed", true)
    .not("lesson_id", "is", null);
  return new Set((data ?? []).map((r) => r.lesson_id as string));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/progress.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/progress.ts lib/progress.test.ts
git commit -m "feat: per-item progress with manual-override precedence"
```

---

### Task 6: Media routes — public covers, gated item media

**Files:**
- Create: `lib/media.ts`
- Create: `app/api/media/cover/route.ts`
- Create: `app/api/media/item/[itemId]/[index]/route.ts`
- Test: `lib/media.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/admin-guard`; `getCourseItem` from `@/lib/curriculum`; `ownsProduct` from `@/lib/library`; `createServiceClient`
- Produces:
  - `validateUpload(file: { type: string; size: number }, kind: "cover" | "attachment"): { ok: true } | { ok: false; error: string }` (pure)
  - `publicCoverUrl(coverPath: string | null): string | null`
  - `uploadCover(itemId: string, file: File): Promise<string>` — returns storage path in `public-media`
  - `uploadAttachment(itemId: string, file: File): Promise<Attachment>` — stores in private `paid-assets`
  - `GET /api/media/item/[itemId]/[index]` — 401 unauthenticated, 403 non-owner, 302 to a 60s signed URL otherwise

- [ ] **Step 1: Write the failing test**

Create `lib/media.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateUpload } from "@/lib/media";

describe("validateUpload", () => {
  it("accepts a jpeg cover", () => {
    expect(validateUpload({ type: "image/jpeg", size: 500_000 }, "cover")).toEqual({ ok: true });
  });

  it("rejects a non-image cover", () => {
    const r = validateUpload({ type: "application/pdf", size: 1000 }, "cover");
    expect(r.ok).toBe(false);
  });

  it("rejects a cover over 5MB", () => {
    const r = validateUpload({ type: "image/png", size: 6_000_000 }, "cover");
    expect(r.ok).toBe(false);
  });

  it("accepts a pdf attachment", () => {
    expect(validateUpload({ type: "application/pdf", size: 1_000_000 }, "attachment")).toEqual({ ok: true });
  });

  it("rejects an executable attachment", () => {
    const r = validateUpload({ type: "application/x-msdownload", size: 1000 }, "attachment");
    expect(r.ok).toBe(false);
  });

  it("rejects an attachment over 100MB", () => {
    const r = validateUpload({ type: "application/pdf", size: 200_000_000 }, "attachment");
    expect(r.ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ type: "image/png", size: 0 }, "cover").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/media.test.ts`
Expected: FAIL — cannot find module `@/lib/media`.

- [ ] **Step 3: Write the implementation**

Create `lib/media.ts`:

```typescript
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Attachment } from "@/lib/curriculum";

// Covers are marketing imagery shown before purchase -> PUBLIC bucket.
// Attachments and inline lesson images are paid content -> PRIVATE bucket,
// reachable only through the ownership-gated route.
const COVER_MAX = 5 * 1024 * 1024;
const ATTACH_MAX = 100 * 1024 * 1024;
const ATTACH_TYPES = [
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function validateUpload(
  file: { type: string; size: number },
  kind: "cover" | "attachment",
): { ok: true } | { ok: false; error: string } {
  if (!file.size) return { ok: false, error: "File is empty" };
  if (kind === "cover") {
    if (!file.type.startsWith("image/")) return { ok: false, error: "Cover must be an image" };
    if (file.size > COVER_MAX) return { ok: false, error: "Cover must be under 5MB" };
    return { ok: true };
  }
  if (!ATTACH_TYPES.includes(file.type)) return { ok: false, error: "Unsupported file type" };
  if (file.size > ATTACH_MAX) return { ok: false, error: "File must be under 100MB" };
  return { ok: true };
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_");

export function publicCoverUrl(coverPath: string | null): string | null {
  if (!coverPath) return null;
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-media/${coverPath}`;
}

export async function uploadCover(itemId: string, file: File): Promise<string> {
  const db = createServiceClient();
  const path = `items/${itemId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("public-media").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadCover: ${error.message}`);
  return path;
}

export async function uploadAttachment(itemId: string, file: File): Promise<Attachment> {
  const db = createServiceClient();
  const path = `items/${itemId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("paid-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadAttachment: ${error.message}`);
  return { path, name: file.name, size: file.size, mime: file.type };
}

export async function signedItemAsset(path: string, ttl = 60): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.storage.from("paid-assets").createSignedUrl(path, ttl);
  return data?.signedUrl ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/media.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Write the gated delivery route**

Create `app/api/media/item/[itemId]/[index]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourseItem } from "@/lib/curriculum";
import { ownsProduct } from "@/lib/library";
import { signedItemAsset } from "@/lib/media";

// Attachments and inline lesson images are paid content. Every request
// re-checks the signed-in user owns the parent product, then 302s to a fresh
// 60s signed URL. Nothing paid is ever on a public path.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string; index: string }> },
) {
  const { itemId, index } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const item = await getCourseItem(itemId);
  if (!item) return new NextResponse("Not found", { status: 404 });

  if (!(await ownsProduct(user.id, item.productId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const attachment = item.attachments[Number(index)];
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const url = await signedItemAsset(attachment.path, 60);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
```

- [ ] **Step 6: Write the cover upload route**

Create `app/api/media/cover/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { validateUpload, uploadCover } from "@/lib/media";
import { setCover } from "@/lib/curriculum-admin";

export async function POST(req: Request) {
  await requireAdmin();
  const form = await req.formData();
  const itemId = form.get("itemId");
  const file = form.get("file");
  if (typeof itemId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const check = validateUpload({ type: file.type, size: file.size }, "cover");
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const path = await uploadCover(itemId, file);
  await setCover(itemId, path);
  return NextResponse.json({ ok: true, path });
}
```

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/media.ts lib/media.test.ts app/api/media
git commit -m "feat: cover upload (public) and ownership-gated item media"
```

---

### Task 7: Admin curriculum outline

**Files:**
- Create: `app/admin/products/[id]/curriculum/actions.ts`
- Create: `components/admin/curriculum-outline.tsx`
- Modify: `app/admin/products/[id]/page.tsx` (render the outline below the product form)

**Interfaces:**
- Consumes: `listCurriculum` from `@/lib/curriculum`; `createItem`, `moveItem`, `deleteItem`, `countChildren` from `@/lib/curriculum-admin`; `requireAdmin`
- Produces: server actions `addChapterAction(formData)`, `addLessonAction(formData)`, `moveItemAction(formData)`, `deleteItemAction(formData)`; component `<CurriculumOutline productId nodes chapterLabel lessonLabel />`

- [ ] **Step 1: Write the server actions**

Create `app/admin/products/[id]/curriculum/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createItem, moveItem, deleteItem } from "@/lib/curriculum-admin";

export async function addChapterAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const title = String(formData.get("title") || "Untitled");
  const id = await createItem(productId, null, {
    title,
    subtitle: null,
    bodyHtml: null,
    videoEmbedUrl: null,
    isPublished: false,
  });
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}/curriculum/${id}`);
}

export async function addLessonAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const parentId = String(formData.get("parentId"));
  const id = await createItem(productId, parentId, {
    title: String(formData.get("title") || "Untitled"),
    subtitle: null,
    bodyHtml: null,
    videoEmbedUrl: null,
    isPublished: false,
  });
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}/curriculum/${id}`);
}

export async function moveItemAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  await moveItem(String(formData.get("itemId")), formData.get("dir") === "up" ? "up" : "down");
  revalidatePath(`/admin/products/${productId}`);
}

export async function deleteItemAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  await deleteItem(String(formData.get("itemId")));
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}`);
}
```

- [ ] **Step 2: Write the outline component**

Create `components/admin/curriculum-outline.tsx`:

```tsx
import Link from "next/link";
import type { CurriculumNode } from "@/lib/curriculum";
import { addChapterAction, addLessonAction, moveItemAction } from "@/app/admin/products/[id]/curriculum/actions";

const pad = (n: number) => String(n + 1).padStart(2, "0");

function MoveButtons({ productId, itemId }: { productId: string; itemId: string }) {
  return (
    <span className="flex items-center gap-1">
      {(["up", "down"] as const).map((dir) => (
        <form action={moveItemAction} key={dir}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="dir" value={dir} />
          <button
            className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-fg"
            aria-label={`Move ${dir}`}
          >
            {dir === "up" ? "↑" : "↓"}
          </button>
        </form>
      ))}
    </span>
  );
}

export function CurriculumOutline({
  productId,
  nodes,
  chapterLabel,
  lessonLabel,
}: {
  productId: string;
  nodes: CurriculumNode[];
  chapterLabel: string;
  lessonLabel: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Curriculum</h2>
        <form action={addChapterAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="title" value={`New ${chapterLabel}`} />
          <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            + Add {chapterLabel}
          </button>
        </form>
      </div>

      {nodes.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No {chapterLabel.toLowerCase()}s yet. Add one to start building this course.
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {nodes.map((ch, ci) => (
          <li key={ch.id} className="rounded-xl border border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-3">
                <span className="font-display text-muted">{pad(ci)}</span>
                <Link href={`/admin/products/${productId}/curriculum/${ch.id}`} className="hover:underline">
                  {ch.title}
                </Link>
                <span className="text-xs text-muted">
                  {ch.children.length > 0
                    ? `${ch.children.length} ${lessonLabel.toLowerCase()}s`
                    : "content only"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className={ch.isPublished ? "text-xs text-navy" : "text-xs text-muted"}>
                  {ch.isPublished ? "Published" : "Draft"}
                </span>
                <MoveButtons productId={productId} itemId={ch.id} />
              </span>
            </div>

            <ol className="flex flex-col border-t border-border">
              {ch.children.map((ls, li) => (
                <li key={ls.id} className="flex items-center justify-between gap-3 px-4 py-2 pl-10">
                  <span className="flex items-center gap-3 text-sm">
                    <span className="font-display text-muted">{pad(li)}</span>
                    <Link
                      href={`/admin/products/${productId}/curriculum/${ls.id}`}
                      className="hover:underline"
                    >
                      {ls.title}
                    </Link>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={ls.isPublished ? "text-xs text-navy" : "text-xs text-muted"}>
                      {ls.isPublished ? "Published" : "Draft"}
                    </span>
                    <MoveButtons productId={productId} itemId={ls.id} />
                  </span>
                </li>
              ))}
            </ol>

            <form action={addLessonAction} className="border-t border-border px-4 py-2 pl-10">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="parentId" value={ch.id} />
              <input type="hidden" name="title" value={`New ${lessonLabel}`} />
              <button className="text-sm text-primary hover:underline">+ Add {lessonLabel}</button>
            </form>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 3: Render it on the product page**

In `app/admin/products/[id]/page.tsx`, add these imports at the top:

```tsx
import { CurriculumOutline } from "@/components/admin/curriculum-outline";
import { listCurriculum } from "@/lib/curriculum";
```

Change the data fetch to also load the curriculum:

```tsx
  const [product, offers, nodes] = await Promise.all([
    getProductById(id),
    listOfferOptions(),
    listCurriculum(id, { includeDrafts: true }),
  ]);
```

Then render the outline immediately after `<ProductForm ... />`:

```tsx
      <CurriculumOutline
        productId={product.id}
        nodes={nodes}
        chapterLabel={product.chapterLabel ?? "Chapter"}
        lessonLabel={product.lessonLabel ?? "Lesson"}
      />
```

- [ ] **Step 4: Add the vocabulary fields to the product type and form**

In `lib/types.ts`, add to `Product`:

```typescript
  chapterLabel: string;
  lessonLabel: string;
```

In `lib/store.ts` and `lib/admin.ts`, append `, chapter_label, lesson_label` to `PRODUCT_COLUMNS`.

In `app/admin/actions.ts`, add to the zod schema:

```typescript
  chapterLabel: z.string().trim().min(1).default("Chapter"),
  lessonLabel: z.string().trim().min(1).default("Lesson"),
```

and to the `ProductInput` object built in `saveProduct`:

```typescript
    chapterLabel: v.chapterLabel,
    lessonLabel: v.lessonLabel,
```

In `lib/admin.ts` `ProductInput` type add `chapterLabel: string; lessonLabel: string;` and in `toRow()` add `chapter_label: input.chapterLabel, lesson_label: input.lessonLabel,`.

In `components/admin/product-form.tsx`, add inside the offer-slots fieldset area:

```tsx
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Call chapters" hint="e.g. Module, Week, Part">
          <input name="chapterLabel" defaultValue={product?.chapterLabel ?? "Chapter"} className={input} />
        </Field>
        <Field label="Call lessons" hint="e.g. Session, Day, Video">
          <input name="lessonLabel" defaultValue={product?.lessonLabel ?? "Lesson"} className={input} />
        </Field>
      </div>
```

- [ ] **Step 5: Verify in the browser**

Run the dev server, log in as an admin, open `/admin/products/<any product id>`.
Expected: a Curriculum section appears; "+ Add Chapter" creates a chapter and redirects to its editor; ↑/↓ reorder chapters; vocabulary fields save and the labels change.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npx tsc --noEmit && npx next lint
git add app/admin components/admin lib/types.ts lib/store.ts lib/admin.ts
git commit -m "feat: admin curriculum outline with reorder and vocabulary"
```

---

### Task 8: Item editor with WYSIWYG

**Files:**
- Create: `components/editor/rich-text.tsx`
- Create: `components/admin/item-editor.tsx`
- Create: `app/admin/products/[id]/curriculum/[itemId]/page.tsx`
- Modify: `app/admin/products/[id]/curriculum/actions.ts` (add `saveItemAction`, `uploadAttachmentAction`, `removeAttachmentAction`)

**Interfaces:**
- Consumes: `getCourseItem` from `@/lib/curriculum`; `updateItem`, `addAttachment`, `removeAttachment`, `countChildren` from `@/lib/curriculum-admin`; `validateUpload`, `uploadAttachment`, `publicCoverUrl` from `@/lib/media`
- Produces: `<RichText name value />` (hidden input carrying HTML, so the editor works inside a plain server-action form); `<ItemEditor item productId chapterLabel lessonLabel childCount />`

- [ ] **Step 1: Install TipTap**

Run: `npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image`
Expected: installs without error.

- [ ] **Step 2: Write the editor wrapper**

Create `components/editor/rich-text.tsx`:

```tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useState } from "react";

// Keeps its HTML in a hidden input so the surrounding <form action={serverAction}>
// submits it like any other field. Output is sanitized server-side on save.
export function RichText({ name, value }: { name: string; value: string }) {
  const [html, setHtml] = useState(value ?? "");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value ?? "",
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose-editor min-h-48 w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none focus:border-primary",
      },
    },
  });

  if (!editor) return null;

  const Btn = ({ on, active, children }: { on: () => void; active: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={on}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border px-2 py-1">
        <Btn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>Bold</Btn>
        <Btn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>Italic</Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>H2</Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>H3</Btn>
        <Btn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>List</Btn>
        <Btn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>1. List</Btn>
        <Btn on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>Quote</Btn>
        <Btn
          on={() => {
            const url = window.prompt("Link URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
        >
          Link
        </Btn>
      </div>
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
```

- [ ] **Step 3: Add the remaining server actions**

Append to `app/admin/products/[id]/curriculum/actions.ts`:

```typescript
import { updateItem, addAttachment, removeAttachment } from "@/lib/curriculum-admin";
import { validateUpload, uploadAttachment } from "@/lib/media";

export async function saveItemAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const itemId = String(formData.get("itemId"));
  const raw = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v : null;
  };
  await updateItem(itemId, {
    title: String(formData.get("title") || "Untitled"),
    subtitle: raw("subtitle"),
    bodyHtml: raw("bodyHtml"),
    videoEmbedUrl: raw("videoEmbedUrl"),
    isPublished: formData.get("isPublished") === "on",
  });
  revalidatePath(`/admin/products/${productId}/curriculum/${itemId}`);
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}`);
}

export async function uploadAttachmentAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const itemId = String(formData.get("itemId"));
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const check = validateUpload({ type: file.type, size: file.size }, "attachment");
    if (check.ok) await addAttachment(itemId, await uploadAttachment(itemId, file));
  }
  revalidatePath(`/admin/products/${productId}/curriculum/${itemId}`);
}

export async function removeAttachmentAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const itemId = String(formData.get("itemId"));
  await removeAttachment(itemId, String(formData.get("path")));
  revalidatePath(`/admin/products/${productId}/curriculum/${itemId}`);
}
```

- [ ] **Step 4: Write the item editor component**

Create `components/admin/item-editor.tsx`:

```tsx
import Link from "next/link";
import { RichText } from "@/components/editor/rich-text";
import { inputClass as input, Field } from "@/components/admin/form-controls";
import { publicCoverUrl } from "@/lib/media";
import type { CourseItem } from "@/lib/curriculum";
import {
  saveItemAction,
  deleteItemAction,
  uploadAttachmentAction,
  removeAttachmentAction,
} from "@/app/admin/products/[id]/curriculum/actions";

// YouTube and Vimeo expose playback position cross-origin; other providers do
// not, so their items complete on the dwell timer instead. Say so in the UI
// rather than letting it look broken.
function trackingNote(url: string | null): string {
  if (!url) return "";
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(url)
    ? "Progress tracking: supported — completes at 50% watched."
    : "Progress tracking: unsupported for this provider — completes on time-on-page instead.";
}

export function ItemEditor({
  item,
  productId,
  kindLabel,
  childCount,
}: {
  item: CourseItem;
  productId: string;
  kindLabel: string;
  childCount: number;
}) {
  const cover = publicCoverUrl(item.coverPath);
  return (
    <div className="flex flex-col gap-8">
      <form action={saveItemAction} className="flex flex-col gap-6">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="itemId" value={item.id} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={`${kindLabel} title`} required>
            <input name="title" defaultValue={item.title} required className={input} />
          </Field>
          <Field label="Subtitle" hint="optional">
            <input name="subtitle" defaultValue={item.subtitle ?? ""} className={input} />
          </Field>
        </div>

        <Field label="Video URL" hint="Vimeo, YouTube or Loom — embed only">
          <input name="videoEmbedUrl" defaultValue={item.videoEmbedUrl ?? ""} className={input} />
        </Field>
        {item.videoEmbedUrl && (
          <p className="-mt-3 text-xs text-muted">{trackingNote(item.videoEmbedUrl)}</p>
        )}

        <Field label="Body">
          <RichText name="bodyHtml" value={item.bodyHtml ?? ""} />
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={item.isPublished}
            className="size-4 accent-[var(--primary)]"
          />
          Published (visible to students)
        </label>

        <div className="flex items-center gap-4">
          <button className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg hover:bg-primary-hover">
            Save changes
          </button>
          <Link href={`/admin/products/${productId}`} className="text-sm text-muted hover:text-fg">
            Back to curriculum
          </Link>
        </div>
      </form>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Cover image</span>
        {cover && <img src={cover} alt="" className="h-32 w-auto rounded-lg border border-border" />}
        <form action="/api/media/cover" method="post" encType="multipart/form-data" className="flex flex-col gap-3">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="file" name="file" accept="image/*" className="text-sm" />
          <button className="w-fit rounded-full border border-border px-5 py-2 text-sm hover:border-primary">
            Upload cover
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Attachments</span>
        {item.attachments.length === 0 && <p className="text-sm text-muted">No files yet.</p>}
        <ul className="flex flex-col gap-2">
          {item.attachments.map((a) => (
            <li key={a.path} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="truncate">{a.name}</span>
              <form action={removeAttachmentAction}>
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="path" value={a.path} />
                <button className="text-xs text-muted hover:text-primary">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={uploadAttachmentAction} className="flex flex-col gap-3">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="file" name="file" className="text-sm" />
          <button className="w-fit rounded-full border border-border px-5 py-2 text-sm hover:border-primary">
            Add file
          </button>
        </form>
      </section>

      <form action={deleteItemAction} className="border-t border-border pt-6">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="itemId" value={item.id} />
        <button className="text-sm text-muted hover:text-primary">
          Delete this {kindLabel.toLowerCase()}
          {childCount > 0 && ` and its ${childCount} child item(s) and their progress`}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Write the editor page**

Create `app/admin/products/[id]/curriculum/[itemId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseItem } from "@/lib/curriculum";
import { countChildren } from "@/lib/curriculum-admin";
import { getProductById } from "@/lib/admin";
import { ItemEditor } from "@/components/admin/item-editor";

export default async function ItemEditorPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const [item, product] = await Promise.all([getCourseItem(itemId), getProductById(id)]);
  if (!item || !product) notFound();

  const kindLabel = item.parentId === null
    ? (product.chapterLabel ?? "Chapter")
    : (product.lessonLabel ?? "Lesson");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/products/${id}`} className="kicker w-fit text-muted hover:text-fg">
          ← {product.title}
        </Link>
        <h1 className="text-2xl">{item.title}</h1>
      </div>
      <ItemEditor
        item={item}
        productId={id}
        kindLabel={kindLabel}
        childCount={await countChildren(itemId)}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify in the browser**

Open a chapter from the curriculum outline. Type a body with bold + a heading, paste a YouTube URL (note appears), upload a cover, add a file, tick Published, Save.
Expected: returns to the outline showing "Published"; reopening shows every value persisted.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
npx tsc --noEmit && npx next lint
git add components/editor components/admin/item-editor.tsx app/admin/products package.json package-lock.json
git commit -m "feat: course item editor with WYSIWYG, cover and attachments"
```

---

### Task 9: Student curriculum and item pages

**Files:**
- Modify: `app/(store)/library/[slug]/page.tsx` (replace single-media view with curriculum when items exist)
- Create: `app/(store)/library/[slug]/[itemId]/page.tsx`
- Create: `lib/curriculum-student.ts`

**Interfaces:**
- Consumes: `listCurriculum`, `getCourseItem`, `rollupProgress` from `@/lib/curriculum`; `completedItemIds` from `@/lib/progress`; `getOwnedProduct` from `@/lib/library`
- Produces: `flattenPlayable(nodes): CourseItem[]` (pure — reading order: childless chapters and lessons, chapters-with-children excluded); `neighbours(flat, itemId): { prev, next }`; `firstIncomplete(flat, completedIds): CourseItem | null`

- [ ] **Step 1: Write the failing test**

Create `lib/curriculum-student.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { flattenPlayable, neighbours, firstIncomplete } from "@/lib/curriculum-student";
import type { CurriculumNode, CourseItem } from "@/lib/curriculum";

const base = (id: string, parentId: string | null = null): CourseItem => ({
  id, productId: "p", parentId, title: id, subtitle: null, bodyHtml: null,
  videoEmbedUrl: null, coverPath: null, attachments: [], isPublished: true, sortOrder: 0,
});
const node = (id: string, children: CourseItem[] = []): CurriculumNode => ({ ...base(id), children });

describe("flattenPlayable", () => {
  it("returns lessons in reading order and skips chapters that have children", () => {
    const tree = [node("c1", [base("l1", "c1"), base("l2", "c1")]), node("c2", [base("l3", "c2")])];
    expect(flattenPlayable(tree).map((i) => i.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("includes a childless chapter as its own playable item", () => {
    const tree = [node("c1", [base("l1", "c1")]), node("c2")];
    expect(flattenPlayable(tree).map((i) => i.id)).toEqual(["l1", "c2"]);
  });
});

describe("neighbours", () => {
  const flat = [base("a"), base("b"), base("c")];
  it("returns previous and next across the whole course", () => {
    expect(neighbours(flat, "b")).toEqual({ prev: flat[0], next: flat[2] });
  });
  it("returns null at the boundaries", () => {
    expect(neighbours(flat, "a").prev).toBeNull();
    expect(neighbours(flat, "c").next).toBeNull();
  });
});

describe("firstIncomplete", () => {
  it("returns the first item not yet completed", () => {
    const flat = [base("a"), base("b"), base("c")];
    expect(firstIncomplete(flat, new Set(["a"]))?.id).toBe("b");
  });
  it("returns null when everything is complete", () => {
    const flat = [base("a")];
    expect(firstIncomplete(flat, new Set(["a"]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/curriculum-student.test.ts`
Expected: FAIL — cannot find module `@/lib/curriculum-student`.

- [ ] **Step 3: Write the implementation**

Create `lib/curriculum-student.ts`:

```typescript
import type { CurriculumNode, CourseItem } from "@/lib/curriculum";

// Reading order across the whole course. A chapter WITH children is a
// container and has no page of its own; a childless chapter is content.
export function flattenPlayable(nodes: CurriculumNode[]): CourseItem[] {
  const out: CourseItem[] = [];
  for (const ch of nodes) {
    if (ch.children.length === 0) out.push(ch);
    else out.push(...ch.children);
  }
  return out;
}

export function neighbours(
  flat: CourseItem[],
  itemId: string,
): { prev: CourseItem | null; next: CourseItem | null } {
  const i = flat.findIndex((x) => x.id === itemId);
  if (i === -1) return { prev: null, next: null };
  return { prev: flat[i - 1] ?? null, next: flat[i + 1] ?? null };
}

export function firstIncomplete(flat: CourseItem[], completed: Set<string>): CourseItem | null {
  return flat.find((i) => !completed.has(i.id)) ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/curriculum-student.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write the student item page**

Create `app/(store)/library/[slug]/[itemId]/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProduct } from "@/lib/library";
import { listCurriculum, getCourseItem } from "@/lib/curriculum";
import { flattenPlayable, neighbours } from "@/lib/curriculum-student";
import { completedItemIds } from "@/lib/progress";
import { CompletionControls } from "@/components/library/completion-controls";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const owned = await getOwnedProduct(user.id, slug);
  if (!owned) redirect("/library");

  const item = await getCourseItem(itemId);
  if (!item || item.productId !== owned.product.id || !item.isPublished) {
    redirect(`/library/${slug}`);
  }

  const nodes = await listCurriculum(owned.product.id);
  const flat = flattenPlayable(nodes);
  const { prev, next } = neighbours(flat, itemId);
  const done = await completedItemIds(user.id, owned.product.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4">
      <Link href={`/library/${slug}`} className="kicker w-fit text-muted hover:text-fg">
        ← {owned.product.title}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{item.title}</h1>
        {item.subtitle && <p className="text-muted">{item.subtitle}</p>}
      </div>

      {item.videoEmbedUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border">
          <iframe
            src={item.videoEmbedUrl}
            className="h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {item.bodyHtml && (
        <div
          className="flex flex-col gap-4 leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:text-xl [&_h3]:text-lg [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
          dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
        />
      )}

      {item.attachments.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="kicker text-muted">Downloads</h2>
          <ul className="flex flex-col gap-2">
            {item.attachments.map((a, i) => (
              <li key={a.path}>
                <a
                  href={`/api/media/item/${item.id}/${i}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm hover:border-primary"
                  data-gi-download={item.id}
                >
                  <span>{a.name}</span>
                  <span className="text-muted">Download</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CompletionControls
        itemId={item.id}
        productId={owned.product.id}
        completed={done.has(item.id)}
        videoUrl={item.videoEmbedUrl}
        nextHref={next ? `/library/${slug}/${next.id}` : `/library/${slug}`}
      />

      <nav className="flex items-center justify-between border-t border-border pt-6 text-sm">
        {prev ? (
          <Link href={`/library/${slug}/${prev.id}`} className="text-muted hover:text-fg">← {prev.title}</Link>
        ) : <span />}
        {next ? (
          <Link href={`/library/${slug}/${next.id}`} className="text-primary hover:underline">{next.title} →</Link>
        ) : <span />}
      </nav>
    </div>
  );
}
```

- [ ] **Step 6: Update the course page to show the curriculum**

In `app/(store)/library/[slug]/page.tsx`, after loading `owned`, add:

```tsx
  const nodes = await listCurriculum(owned.product.id);
  const doneIds = await completedItemIds(user.id, owned.product.id);
  const flat = flattenPlayable(nodes);
  const roll = rollupProgress(nodes.flatMap((n) => [n, ...n.children]), doneIds);
  const resume = firstIncomplete(flat, doneIds);
```

Render this block above the existing single-media section, and skip the old media block entirely when `nodes.length > 0`:

```tsx
      {nodes.length > 0 && (
        <section className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{roll.done} of {roll.total} complete</span>
            {resume && (
              <Link
                href={`/library/${product.slug}/${resume.id}`}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Continue → {resume.title}
              </Link>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: roll.total ? `${(roll.done / roll.total) * 100}%` : "0%" }}
            />
          </div>
          <ol className="flex flex-col gap-3">
            {nodes.map((ch) => (
              <li key={ch.id} className="rounded-2xl border border-border bg-surface">
                <div className="flex items-center justify-between px-5 py-4">
                  {ch.children.length === 0 ? (
                    <Link href={`/library/${product.slug}/${ch.id}`} className="hover:underline">
                      {product.chapterLabel} · {ch.title}
                    </Link>
                  ) : (
                    <span>{product.chapterLabel} · {ch.title}</span>
                  )}
                  <span className="text-xs text-muted">
                    {ch.children.filter((c) => doneIds.has(c.id)).length}/{ch.children.length || 1}
                  </span>
                </div>
                {ch.children.length > 0 && (
                  <ol className="flex flex-col border-t border-border">
                    {ch.children.map((ls) => (
                      <li key={ls.id}>
                        <Link
                          href={`/library/${product.slug}/${ls.id}`}
                          className="flex items-center gap-3 px-5 py-3 pl-8 text-sm hover:bg-surface-2"
                        >
                          <span className={doneIds.has(ls.id) ? "text-primary" : "text-muted"}>
                            {doneIds.has(ls.id) ? "✓" : "○"}
                          </span>
                          {ls.title}
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
```

- [ ] **Step 7: Create a minimal CompletionControls so this task stands alone**

Task 10 replaces this with the full signal version. For now it is manual-only, so
this task typechecks and ships independently.

Create `components/library/completion-controls.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompletionControls({
  itemId,
  productId,
  completed,
  nextHref,
}: {
  itemId: string;
  productId: string;
  completed: boolean;
  videoUrl: string | null;
  nextHref: string;
}) {
  const router = useRouter();
  const [isDone, setIsDone] = useState(completed);

  async function toggle() {
    const next = !isDone;
    await fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, productId, completed: next, source: "manual" }),
    }).catch(() => {});
    setIsDone(next);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
      <button
        onClick={toggle}
        className={
          isDone
            ? "rounded-full border border-border px-5 py-2.5 text-sm text-muted hover:text-fg"
            : "rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        }
      >
        {isDone ? "Mark as not complete" : "Mark complete"}
      </button>
      {isDone && <a href={nextHref} className="text-sm text-primary hover:underline">Next →</a>}
    </div>
  );
}
```

The `/api/progress` endpoint it calls is created in Task 10; until then the fetch
fails silently and the button still updates optimistically.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npx tsc --noEmit && npx next lint
git add lib/curriculum-student.ts lib/curriculum-student.test.ts components/library "app/(store)/library"
git commit -m "feat: student curriculum view and item pages"
```

---

### Task 10: Auto-completion signals

**Files:**
- Create: `app/api/progress/route.ts`
- Create: `components/library/completion-controls.tsx`

**Interfaces:**
- Consumes: `setItemCompletion` from `@/lib/progress`; `ownsProduct` from `@/lib/library`
- Produces: `POST /api/progress` accepting `{ itemId, productId, completed, source }`, idempotent; `<CompletionControls itemId productId completed videoUrl nextHref />` firing the video, download and dwell signals

- [ ] **Step 1: Write the endpoint**

Create `app/api/progress/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ownsProduct } from "@/lib/library";
import { setItemCompletion, type CompletionSource } from "@/lib/progress";

const SOURCES: CompletionSource[] = ["manual", "video", "download", "dwell"];

// Idempotent: clients may fire freely. setItemCompletion decides whether the
// signal is allowed to move the row (manual_override wins permanently).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string; productId?: string; completed?: boolean; source?: CompletionSource;
  };
  const { itemId, productId, completed, source } = body;
  if (!itemId || !productId || typeof completed !== "boolean" || !source || !SOURCES.includes(source)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!(await ownsProduct(user.id, productId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await setItemCompletion(user.id, productId, itemId, completed, source);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the client controls**

Create `components/library/completion-controls.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DWELL_MS = 5 * 60 * 1000; // 5 minutes of VISIBLE time

export function CompletionControls({
  itemId,
  productId,
  completed,
  videoUrl,
  nextHref,
}: {
  itemId: string;
  productId: string;
  completed: boolean;
  videoUrl: string | null;
  nextHref: string;
}) {
  const router = useRouter();
  const [isDone, setIsDone] = useState(completed);
  const sent = useRef(false);

  async function send(next: boolean, source: "manual" | "video" | "download" | "dwell") {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, productId, completed: next, source }),
    }).catch(() => {});
    setIsDone(next);
    router.refresh();
  }

  // Dwell: 5 minutes of visible time. The timer pauses when the tab is hidden,
  // so an abandoned open tab can never complete a course.
  useEffect(() => {
    if (isDone) return;
    let elapsed = 0;
    let last = Date.now();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") elapsed += Date.now() - last;
      last = Date.now();
      if (elapsed >= DWELL_MS && !sent.current) {
        sent.current = true;
        void send(true, "dwell");
      }
    }, 5000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, itemId]);

  // Download: any attachment click on this page completes the item.
  useEffect(() => {
    if (isDone) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-gi-download]");
      if (el && !sent.current) {
        sent.current = true;
        void send(true, "download");
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, itemId]);

  // Video: YouTube and Vimeo expose progress cross-origin; other providers do
  // not, and simply fall through to the dwell timer.
  useEffect(() => {
    if (isDone || !videoUrl) return;
    const isVimeo = /vimeo\.com/i.test(videoUrl);
    const isYouTube = /youtube\.com|youtu\.be/i.test(videoUrl);
    if (!isVimeo && !isYouTube) return;

    const onMessage = (e: MessageEvent) => {
      if (sent.current) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // Vimeo player.js timeupdate payload
        if (d?.event === "timeupdate" && typeof d?.data?.percent === "number" && d.data.percent >= 0.5) {
          sent.current = true;
          void send(true, "video");
        }
        // YouTube iframe API state payload
        if (d?.event === "infoDelivery" && d?.info?.currentTime && d?.info?.duration) {
          if (d.info.currentTime / d.info.duration >= 0.5) {
            sent.current = true;
            void send(true, "video");
          }
        }
      } catch {
        /* not our message */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, videoUrl, itemId]);

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
      <button
        onClick={() => send(!isDone, "manual")}
        className={
          isDone
            ? "rounded-full border border-border px-5 py-2.5 text-sm text-muted hover:text-fg"
            : "rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        }
      >
        {isDone ? "Mark as not complete" : "Mark complete"}
      </button>
      {isDone && (
        <a href={nextHref} className="text-sm text-primary hover:underline">
          Next →
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Enable video progress messages**

In `app/(store)/library/[slug]/[itemId]/page.tsx`, the iframe `src` must opt into the provider APIs. Replace the `src={item.videoEmbedUrl}` expression with:

```tsx
          src={
            /youtube\.com|youtu\.be/i.test(item.videoEmbedUrl)
              ? `${item.videoEmbedUrl}${item.videoEmbedUrl.includes("?") ? "&" : "?"}enablejsapi=1`
              : item.videoEmbedUrl
          }
```

- [ ] **Step 4: Verify manually**

As a student who owns the course: open an item, click "Mark complete" → the outline shows ✓; click "Mark as not complete" → it clears and **stays cleared** (auto-signals must not revert it). Download an attachment on a fresh item → it completes.

- [ ] **Step 5: Run the whole suite, typecheck, lint and commit**

```bash
npm test && npx tsc --noEmit && npx next lint
git add app/api/progress components/library "app/(store)/library"
git commit -m "feat: auto-completion via video, download and dwell signals"
```

---

## Verification

- `npm test` — all suites green, including the existing Stripe integration tests
- `npx tsc --noEmit` and `npx next lint` clean
- Author a two-chapter course (one chapter with lessons, one chapter holding its own content), publish it, then view it as an owning student on desktop and mobile, light and dark
- Confirm a non-owner receives 403 from `/api/media/item/<id>/0`
- Confirm draft items never appear in the student curriculum
