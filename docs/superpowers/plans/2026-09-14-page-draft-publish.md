# Draft and publish for pages: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save in the page editor and section builder writes a draft; Publish (one section or the whole page) makes it live; the eye icon previews drafts on the real page.

**Architecture:** One nullable `draft jsonb` column on `page_sections` and `page_settings`, plus `published_at` on sections. Every public read stays exactly as it is (live columns only); the editor and `?preview=1` read `draft ?? live`. A single Postgres function copies drafts into the live columns in one transaction.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase Postgres + PostgREST (`.rpc`), React 19, vitest (jsdom for components; integration suites gated on `SUPABASE_SERVICE_ROLE_KEY`).

**Spec:** `docs/superpowers/specs/2026-09-14-page-draft-publish-design.md`

## Global Constraints

- Migration is `supabase/migrations/0084_page_drafts.sql`; run `ls supabase/migrations | tail -1` first and renumber if 0084 is taken.
- Every public route (`/p/[slug]`, `/o/[key]`, `/`, `/checkout`, `/checkout/oto`) reads live content by default. Drafts reach a visitor only through `?preview=1` **and** an admin session or a valid preview token.
- A preview fires no `recordPageHit`, no `TrackView`, no pixel/GA event, no attribution POST.
- A row with `published_at is null` is invisible to live reads and to `hasPageSections` by default.
- `publish_page_drafts` is one transaction; a failure rolls back everything.
- The stale-write guard (`baseUpdatedAt`) stays on draft saves. Publish returns each section's new `updated_at` and the editor adopts it.
- Global designs (`saveGlobalBlocksAction`) stay live-on-save. Do not touch.
- `seedFromStarter`, `seedPage` stay live. Do not touch.
- Copy in the UI, verbatim: builder buttons `Back`, `Save`, `Publish`; page bar `Publish page`; rail tag `Draft`; menu item `Discard draft`; panel note `Saved as a draft. Publish the page to make it live.`; preview bar `Preview. Drafts shown. Not live.`; success `Published.`; draft-product success `Page published. The product itself is still a draft, so buyers can't see it yet.`
- No em dashes in any new prose, comments or copy. Use commas, colons, periods.
- Integration tests: `describe.skipIf(!canRun)`, random-uuid owners, cleanup in `afterAll`, every query that picks one row is ordered.
- Run the FULL suite (`npx vitest run`, gate on its own exit status) and `npx tsc --noEmit` before every commit that touches `lib/` or `app/`.
- Never push. Pushing deploys production and needs the migration applied first (see Deploy order in the spec). The controller pushes.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0084_page_drafts.sql` | Columns, backfill, `publish_page_drafts()` |
| `lib/pages.ts` | Reads with `{ draft }` / `{ includeDrafts }`; `writeDraft`, `publishPage`, `discardDraft`, `copyPage` as drafts, `copyPageRows` verbatim |
| `lib/page-sections.ts` | `SectionRow.hasDraft` |
| `lib/templates-store.ts` | `globalUsage` walks draft content |
| `lib/duplicate-write.ts` | uses `copyPageRows`; remaps draft content too |
| `lib/draft-preview.ts` | `isDraftPreview(searchParams, tokenKind?)` |
| `components/page/preview-bar.tsx` | the slim bar |
| `components/page/sales-page.tsx` | band `id` falls back to `section-<key>` |
| `components/analytics.tsx`, `components/attribution-tracker.tsx` | skip on `preview=1` |
| `app/(store)/p/[slug]/page.tsx`, `app/(store)/o/[key]/page.tsx`, `app/(store)/page.tsx`, `app/oto-preview/[id]/page.tsx` | preview reads |
| `app/admin/pages/actions.ts` | `publishPageAction`, `discardDraftAction`, revalidation moves |
| `components/admin/page-editor.tsx` | bar, rail tag, menu, publish/preview wiring |
| `components/admin/block-editor.tsx` | header: Back, last saved, eye, Save, Publish, ⌘S |
| `components/admin/page-seo.tsx`, `components/admin/page-settings.tsx` | draft note |
| `app/admin/**/page-editor/page.tsx`, `app/admin/home/page.tsx`, admin badge pages | `previewHref`, `includeDrafts` |
| `docs/DATABASE.md` | the new columns and function |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/0084_page_drafts.sql`
- Test: `lib/page-drafts-migration.test.ts`
- Modify: `docs/DATABASE.md` (page_sections and page_settings sections)

**Interfaces:**
- Produces: columns `page_sections.draft jsonb`, `page_sections.published_at timestamptz`, `page_settings.draft jsonb`; function `publish_page_drafts(p_owner_type text, p_owner_id uuid, p_section_key text default null) returns int`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/page-drafts-migration.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const SQL = readFileSync("supabase/migrations/0084_page_drafts.sql", "utf8");

describe("the page drafts migration", () => {
  it("has a number nothing else has taken", () => {
    const numbers = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 4));
    expect(numbers.filter((n) => n === "0084")).toHaveLength(1);
  });

  it("keeps every existing row live", () => {
    // A default of now() is what makes rows inserted by the OLD code, during
    // the window between migration and deploy, read as published.
    expect(SQL).toMatch(/published_at\s+timestamptz\s+default now\(\)/);
    expect(SQL).toContain("update page_sections set published_at = coalesce(updated_at, now())");
  });

  it("publishes in one function the service role alone may call", () => {
    expect(SQL).toContain("create or replace function publish_page_drafts(p_owner_type text, p_owner_id uuid, p_section_key text default null)");
    expect(SQL).toContain("revoke all on function publish_page_drafts(text, uuid, text) from public");
    expect(SQL).toContain("grant execute on function publish_page_drafts(text, uuid, text) to service_role");
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run lib/page-drafts-migration.test.ts`
Expected: FAIL, `ENOENT` on the SQL file.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0084_page_drafts.sql
--
-- Draft and publish for pages.
--
-- Until now every save in the page editor wrote the row the live site reads.
-- A section's pending work now sits in `draft` and the live columns do not
-- move until publish_page_drafts() copies it across. `published_at` null
-- means the row has only ever been a draft: live reads treat it as absent.
--
-- The default of now() on published_at is load-bearing for the deploy window:
-- code older than this migration inserts rows without naming the column, and
-- those inserts ARE live writes, so they must read as published.

alter table page_sections
  add column if not exists draft jsonb,
  add column if not exists published_at timestamptz default now();

update page_sections set published_at = coalesce(updated_at, now())
  where published_at is null;

alter table page_settings
  add column if not exists draft jsonb;

comment on column page_sections.draft is
  'Pending section as {enabled, style, accent, variant, content, background, css_id, css_class, layout}. Null: nothing unpublished.';
comment on column page_sections.published_at is
  'When the live columns were last written by a publish. Null: never published, invisible to live reads.';
comment on column page_settings.draft is
  'Pending {custom_css, custom_js, snippets, meta_title, meta_description, share_image_path}. Null: nothing unpublished.';

-- One transaction for a whole page. A section key narrows it to one row and
-- leaves page_settings alone; without one, the settings draft goes too.
-- Values are copied as stored: saveSection and savePageSettings validated
-- them on the way into the draft.
create or replace function publish_page_drafts(p_owner_type text, p_owner_id uuid, p_section_key text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  m int := 0;
begin
  update page_sections s set
    enabled      = coalesce((s.draft->>'enabled')::boolean, s.enabled),
    style        = coalesce(s.draft->>'style', s.style),
    accent       = s.draft->>'accent',
    variant      = s.draft->>'variant',
    content      = coalesce(s.draft->'content', s.content),
    background   = case when jsonb_typeof(s.draft->'background') = 'object' then s.draft->'background' else null end,
    css_id       = s.draft->>'css_id',
    css_class    = s.draft->>'css_class',
    layout       = case when jsonb_typeof(s.draft->'layout') = 'object' then s.draft->'layout' else null end,
    draft        = null,
    published_at = now()
  where s.owner_type = p_owner_type
    and s.owner_id = p_owner_id
    and s.draft is not null
    and (p_section_key is null or s.section_key = p_section_key);
  get diagnostics n = row_count;

  if p_section_key is null then
    update page_settings t set
      custom_css        = coalesce(t.draft->>'custom_css', t.custom_css),
      custom_js         = coalesce(t.draft->>'custom_js', t.custom_js),
      snippets          = coalesce(t.draft->'snippets', t.snippets),
      meta_title        = coalesce(t.draft->>'meta_title', t.meta_title),
      meta_description  = coalesce(t.draft->>'meta_description', t.meta_description),
      share_image_path  = coalesce(t.draft->>'share_image_path', t.share_image_path),
      draft             = null
    where t.owner_type = p_owner_type
      and t.owner_id = p_owner_id
      and t.draft is not null;
    get diagnostics m = row_count;
  end if;

  return n + m;
end;
$$;

revoke all on function publish_page_drafts(text, uuid, text) from public;
grant execute on function publish_page_drafts(text, uuid, text) to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run lib/page-drafts-migration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Apply it to the LOCAL database**

Run: `npx supabase db query --file supabase/migrations/0084_page_drafts.sql` if the local Supabase CLI is wired; otherwise `psql "$DATABASE_URL" -f supabase/migrations/0084_page_drafts.sql` using the local `DATABASE_URL` from `.env.local` (read it into a variable, never echo it). Then verify:

```bash
psql "$DATABASE_URL" -c "select column_name from information_schema.columns where table_name='page_sections' and column_name in ('draft','published_at');"
```
Expected: two rows.

- [ ] **Step 6: Document the columns**

In `docs/DATABASE.md`, under the `page_sections` column table add:

```
| `draft` | jsonb | yes |  | Pending section, same keys as the live columns in snake_case. Null: nothing unpublished. 0084 |
| `published_at` | timestamptz | yes | `now()` | Null: never published; live reads treat the row as absent. 0084 |
```

Under `page_settings` add:

```
| `draft` | jsonb | yes |  | Pending SEO and custom code. Null: nothing unpublished. 0084 |
```

And in the migrations list (the "every migration's why" section) add:

```
- **0084_page_drafts**: Save became a draft. `draft` on page_sections and page_settings, `published_at` on sections, and `publish_page_drafts()` which copies a page's (or one section's) drafts into the live columns in one transaction. Backfilled `published_at` so every row that existed stays live.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0084_page_drafts.sql lib/page-drafts-migration.test.ts docs/DATABASE.md
git commit -m "Add draft columns and publish_page_drafts()"
```

---

### Task 2: Reads that know about drafts

**Files:**
- Modify: `lib/page-sections.ts:774-801` (`SectionRow`)
- Modify: `lib/pages.ts:52-91` (`getPageSections`, `hasPageSections`), `lib/pages.ts:401-437` (`getPageSettings`, `PageSettings`)
- Test: `lib/page-drafts.integration.test.ts` (new)

**Interfaces:**
- Produces:
  - `SectionRow.hasDraft?: boolean`
  - `getPageSections(owner, ownerId, opts?: { draft?: boolean }): Promise<SectionRow[]>`
  - `hasPageSections(owner, ownerId, opts?: { includeDrafts?: boolean }): Promise<boolean>`
  - `PageSettings.hasDraft?: boolean`; `getPageSettings(owner, ownerId, opts?: { draft?: boolean }): Promise<PageSettings>`
- Consumes: Task 1 columns.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/page-drafts.integration.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getPageSections, hasPageSections, getPageSettings } from "@/lib/pages";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = () => createServiceClient();
const owners: string[] = [];
const owner = () => {
  const id = crypto.randomUUID();
  owners.push(id);
  return id;
};

/** A section row written straight to the table, so the read is tested alone. */
async function rawSection(ownerId: string, key: string, over: Record<string, unknown>) {
  const { error } = await db().from("page_sections").insert({
    store_id: await getStoreId(),
    owner_type: "product",
    owner_id: ownerId,
    section_key: key,
    position: 0,
    enabled: true,
    style: "cream",
    content: { blocks: [] },
    ...over,
  });
  if (error) throw new Error(error.message);
}

describe.skipIf(!canRun)("draft-aware reads (integration)", () => {
  it("a live read ignores the draft and a draft read prefers it", async () => {
    const id = owner();
    await rawSection(id, "hero", {
      content: { blocks: [{ type: "heading", props: { text: "LIVE" } }] },
      draft: { enabled: true, style: "navy", content: { blocks: [{ type: "heading", props: { text: "DRAFT" } }] } },
    });
    const live = (await getPageSections("product", id)).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(live.content)).toContain("LIVE");
    expect(live.style).toBe("cream");
    expect(live.hasDraft).toBe(true);

    const draft = (await getPageSections("product", id, { draft: true })).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(draft.content)).toContain("DRAFT");
    expect(draft.style).toBe("navy");
    expect(draft.hasDraft).toBe(true);
  });

  it("a never-published row is absent from a live read and from hasPageSections", async () => {
    const id = owner();
    await rawSection(id, "hero", {
      published_at: null,
      content: { blocks: [{ type: "heading", props: { text: "GHOST" } }] },
    });
    const live = (await getPageSections("product", id)).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(live.content)).not.toContain("GHOST");
    expect(await hasPageSections("product", id)).toBe(false);
    expect(await hasPageSections("product", id, { includeDrafts: true })).toBe(true);
    const draft = (await getPageSections("product", id, { draft: true })).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(draft.content)).toContain("GHOST");
  });

  it("settings read the draft only when asked", async () => {
    const id = owner();
    const { error } = await db().from("page_settings").insert({
      store_id: await getStoreId(),
      owner_type: "product",
      owner_id: id,
      custom_css: "live{}",
      draft: { custom_css: "draft{}" },
    });
    if (error) throw new Error(error.message);
    expect((await getPageSettings("product", id)).customCss).toBe("live{}");
    const d = await getPageSettings("product", id, { draft: true });
    expect(d.customCss).toBe("draft{}");
    expect(d.hasDraft).toBe(true);
  });
});

afterAll(async () => {
  if (!canRun) return;
  await db().from("page_sections").delete().in("owner_id", owners);
  await db().from("page_settings").delete().in("owner_id", owners);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run lib/page-drafts.integration.test.ts`
Expected: FAIL (`hasDraft` undefined; live read returns DRAFT; `includeDrafts` ignored).

- [ ] **Step 3: Implement**

In `lib/page-sections.ts`, add to `SectionRow` after `updatedAt`:

```ts
  /** True when the row carries unpublished work. Set by the reads in lib/pages. */
  hasDraft?: boolean;
```

In `lib/pages.ts` replace `getPageSections` and `hasPageSections`:

```ts
/** The columns a draft holds, in the table's own spelling. */
const DRAFT_KEYS = ["enabled", "style", "accent", "variant", "content", "background", "css_id", "css_class", "layout"] as const;

export async function getPageSections(
  owner: OwnerType,
  ownerId: string,
  /**
   * `draft: true` is the editor and the preview: each row is its draft laid
   * over its live columns. The default is what every visitor gets: live
   * columns only, and a row that was never published is not there at all.
   */
  opts: { draft?: boolean } = {},
): Promise<SectionRow[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("page_sections")
    .select("section_key, position, enabled, style, accent, variant, content, background, css_id, css_class, layout, updated_at, draft, published_at")
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .order("position");
  if (error) throw new Error(`getPageSections: ${error.message}`);

  const stored = new Map<string, SectionRow>();
  for (const raw of data ?? []) {
    const r = raw as Record<string, unknown>;
    const draft = r.draft as Record<string, unknown> | null;
    if (!opts.draft && r.published_at === null) continue;
    const base = opts.draft && draft ? { ...r, ...draft } : r;
    const row = camelize<SectionRow>({ ...base, draft: undefined, published_at: undefined } as never);
    stored.set(row.sectionKey, {
      ...row,
      hasDraft: draft !== null,
      content: sanitizeSectionContent((row.content ?? {}) as Record<string, unknown>),
    });
  }
  // Merge onto the canonical list rather than returning what happens to be in
  // the table: a section added to the code later must appear on existing pages.
  return defaultRows(sectionsFor(owner)).map((d) => stored.get(d.sectionKey) ?? d);
}

/** True when anyone has configured this page at all. Live rows only unless told otherwise. */
export async function hasPageSections(
  owner: OwnerType,
  ownerId: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<boolean> {
  const db = createServiceClient();
  let q = db
    .from("page_sections")
    .select("id", { count: "exact", head: true })
    .eq("owner_type", owner)
    .eq("owner_id", ownerId);
  if (!opts.includeDrafts) q = q.not("published_at", "is", null);
  const { count, error } = await q;
  if (error) return false;
  return (count ?? 0) > 0;
}
```

Note `{ ...r, ...draft }` works because the draft is stored with the table's snake_case keys (`DRAFT_KEYS`), so `camelize` sees one shape. Keep the existing sanitize-on-read comment above the loop.

In `PageSettings` add `hasDraft?: boolean;` with the comment `/** True when a draft is waiting. Only a draft read sets it. */`. Replace `getPageSettings`:

```ts
export async function getPageSettings(
  owner: OwnerType,
  ownerId: string,
  opts: { draft?: boolean } = {},
): Promise<PageSettings> {
  const db = createServiceClient();
  const read = async (columns: string) =>
    db
      .from("page_settings")
      .select(columns)
      .eq("owner_type", owner)
      .eq("owner_id", ownerId)
      .maybeSingle();

  const full = await read(`custom_css, custom_js, snippets, draft, ${SEO_COLUMNS}`);
  const { data, error } = full.error ? await read("custom_css, custom_js, snippets") : full;
  if (error || !data) return NO_PAGE_SETTINGS;
  const raw = data as Record<string, unknown>;
  const draft = (raw.draft as Record<string, unknown> | null) ?? null;
  const row = camelize<{
    customCss: string;
    customJs: string;
    snippets: unknown;
    metaTitle: string | null;
    metaDescription: string | null;
    shareImagePath: string | null;
  }>({ ...raw, ...(opts.draft && draft ? draft : {}), draft: undefined } as never);
  return {
    customCss: row.customCss ?? "",
    customJs: row.customJs ?? "",
    metaTitle: row.metaTitle ?? "",
    metaDescription: row.metaDescription ?? "",
    shareImagePath: row.shareImagePath ?? "",
    snippets: codeSnippetsSchema.safeParse(row.snippets).data ?? [],
    hasDraft: draft !== null,
  };
}
```

Keep the existing comments about coercion and the 0052 window; move them, do not delete them.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run lib/page-drafts.integration.test.ts lib/pages.integration.test.ts lib/section-read-safety.integration.test.ts && npx tsc --noEmit`
Expected: PASS. If `pages.integration.test.ts` fails on a save-then-read, leave it: Task 3 changes what save means and fixes those tests.

- [ ] **Step 5: Commit**

```bash
git add lib/pages.ts lib/page-sections.ts lib/page-drafts.integration.test.ts
git commit -m "Read drafts only when asked, and hide never-published rows from live reads"
```

---

### Task 3: Writes go to the draft; publish, discard, copy

**Files:**
- Modify: `lib/pages.ts:152-272` (`saveSection`, `updateIfUnchanged`), `:439-470` (`savePageSettings`), `:100-140` (`copyPage`)
- Modify: `lib/templates-store.ts:213-240` (`globalUsage`)
- Modify: `lib/duplicate-write.ts:215-243`
- Test: `lib/page-drafts.integration.test.ts` (extend), `lib/pages.integration.test.ts`, `lib/section-conflict.integration.test.ts`, `lib/copy-page.integration.test.ts`, `lib/templates-store.integration.test.ts`, `lib/duplicate.integration.test.ts`

**Interfaces:**
- Produces:
  - `saveSection(...)` unchanged signature; now writes `draft` only.
  - `publishPage(owner: OwnerType, ownerId: string, sectionKey?: string): Promise<{ published: number; updatedAt: Record<string, string> }>`
  - `discardDraft(owner: OwnerType, ownerId: string, sectionKey: string): Promise<SectionRow>` (the live row after discard, or the default row when the section was deleted)
  - `copyPage(from, to): Promise<number>` unchanged signature; writes drafts.
  - `copyPageRows(from, to): Promise<number>` verbatim copy including `draft` and `published_at`.
- Consumes: Task 2 reads.

- [ ] **Step 1: Extend the failing tests**

Append inside the `describe.skipIf(!canRun)` block of `lib/page-drafts.integration.test.ts` (add `saveSection, publishPage, discardDraft, copyPage, savePageSettings` to the import):

```ts
  const input = (text: string) => ({
    enabled: true,
    style: "cream",
    accent: null,
    variant: null,
    content: { blocks: [{ type: "heading", props: { text } }] },
    background: null,
    cssId: null,
    cssClass: null,
  });
  const heroText = async (id: string, draft = false) =>
    JSON.stringify((await getPageSections("product", id, { draft })).find((r) => r.sectionKey === "hero")!.content);

  it("save leaves the live read alone and the draft read shows the edit", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("FIRST"));
    expect(await hasPageSections("product", id)).toBe(false);
    expect(await heroText(id)).not.toContain("FIRST");
    expect(await heroText(id, true)).toContain("FIRST");
  });

  it("publishes one section and leaves the other's draft waiting", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("H"));
    await saveSection("product", id, "problem", input("P"));
    const res = await publishPage("product", id, "hero");
    expect(res.published).toBe(1);
    expect(Object.keys(res.updatedAt)).toEqual(["hero"]);
    const rows = await getPageSections("product", id);
    expect(JSON.stringify(rows.find((r) => r.sectionKey === "hero")!.content)).toContain("H");
    expect(rows.find((r) => r.sectionKey === "hero")!.hasDraft).toBe(false);
    expect(JSON.stringify(rows.find((r) => r.sectionKey === "problem")!.content)).not.toContain("P");
    expect((await getPageSections("product", id, { draft: true })).find((r) => r.sectionKey === "problem")!.hasDraft).toBe(true);
  });

  it("publishes the whole page with its settings", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("H"));
    await saveSection("product", id, "problem", input("P"));
    await savePageSettings("product", id, { customCss: "x{}", customJs: "", snippets: [], metaTitle: "T", metaDescription: "", shareImagePath: "" });
    expect((await getPageSettings("product", id)).metaTitle).toBe("");
    const res = await publishPage("product", id);
    expect(res.published).toBe(3);
    expect(await heroText(id)).toContain("H");
    const s = await getPageSettings("product", id);
    expect(s.metaTitle).toBe("T");
    expect(s.customCss).toBe("x{}");
    expect(s.hasDraft).toBe(false);
  });

  it("a second save after publish still refuses a stale baseline", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("A"));
    const { updatedAt } = await publishPage("product", id, "hero");
    await saveSection("product", id, "hero", input("B"), updatedAt.hero);
    await expect(saveSection("product", id, "hero", input("C"), updatedAt.hero)).rejects.toThrow(/changed by someone else/);
  });

  it("discard restores live, and deletes a section that was never published", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("LIVE"));
    await publishPage("product", id, "hero");
    await saveSection("product", id, "hero", input("SCRAP"));
    const back = await discardDraft("product", id, "hero");
    expect(JSON.stringify(back.content)).toContain("LIVE");
    expect(back.hasDraft).toBe(false);

    await saveSection("product", id, "problem", input("NEVER"));
    const gone = await discardDraft("product", id, "problem");
    expect(JSON.stringify(gone.content)).not.toContain("NEVER");
    const { count } = await db().from("page_sections").select("id", { count: "exact", head: true }).eq("owner_id", id).eq("section_key", "problem");
    expect(count).toBe(0);
  });

  it("copying a page changes no live read on the target", async () => {
    const from = owner();
    const to = owner();
    await saveSection("product", from, "hero", input("SRC-DRAFT"));
    await saveSection("product", to, "hero", input("DEST"));
    await publishPage("product", to, "hero");
    await copyPage({ ownerType: "product", ownerId: from }, { ownerType: "product", ownerId: to });
    expect(await heroText(to)).toContain("DEST");
    expect(await heroText(to, true)).toContain("SRC-DRAFT");
    // Every band on the target now holds a draft, so Publish page publishes a
    // complete copy rather than a mix of two designs.
    const drafts = await getPageSections("product", to, { draft: true });
    expect(drafts.every((r) => r.hasDraft)).toBe(true);
  });
```

Add to `lib/templates-store.integration.test.ts` (inside its skipIf block; look at how it creates a global and a page that points at it, and add one case):

```ts
  it("finds a global that only a draft points at", async () => {
    const id = crypto.randomUUID();
    await saveSection("product", id, "hero", {
      enabled: true, style: "cream", accent: null, variant: null,
      content: { blocks: [{ type: "global", props: { globalId: GLOBAL_ID_FROM_THIS_FILE } }] },
      background: null, cssId: null, cssClass: null,
    });
    const usage = await globalUsage(GLOBAL_ID_FROM_THIS_FILE);
    expect(usage.some((u) => u.ownerId === id && u.sectionKey === "hero")).toBe(true);
    await createServiceClient().from("page_sections").delete().eq("owner_id", id);
  });
```

Replace `GLOBAL_ID_FROM_THIS_FILE` with whatever identifier the existing test in that file uses for the global it creates (read the file; do not invent a new global).

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run lib/page-drafts.integration.test.ts lib/templates-store.integration.test.ts`
Expected: FAIL (`publishPage is not a function`, live read shows FIRST).

- [ ] **Step 3: Implement the writes**

In `lib/pages.ts`:

Replace the body of `saveSection` from `const db = createServiceClient();` to the end with:

```ts
  // Everything below `draft:` is validated here, once, and copied as-is by
  // publish_page_drafts(). Same keys as the live columns so the copy is dumb.
  const draft = {
    enabled: input.enabled,
    style,
    accent: input.accent ? normalizeColor(input.accent, def.defaultStyle) : null,
    variant,
    content: input.content,
    background:
      input.background && input.background.type !== "none"
        ? normalizeBackground(input.background)
        : null,
    css_id: cssIdent(input.cssId),
    css_class: cssClasses(input.cssClass),
    layout: (() => {
      const l = normalizeSectionLayout(input.layout);
      return layoutIsDefault(l) ? null : l;
    })(),
  };
  return writeDraft(owner, ownerId, def.key, position, draft, baseUpdatedAt);
```

Keep every explanatory comment that sat on those fields (accent, background, layout) above the new object. Then replace `updateIfUnchanged` with:

```ts
/**
 * Put a draft on a row, or start the row as a draft.
 *
 * Update first, insert only when there is no row: an upsert would have to
 * name published_at, and naming it on an existing row would either clobber a
 * publish with null or mark a draft as published. Two statements, each of
 * which can only do the right thing.
 *
 * With a baseline, the update is also the stale check: `eq("updated_at", …)`
 * matches zero rows if anything moved, and zero rows on a row that exists is
 * the conflict. Returns the stamp the trigger wrote.
 */
async function writeDraft(
  owner: OwnerType,
  ownerId: string,
  sectionKey: string,
  position: number,
  draft: Record<string, unknown>,
  baseUpdatedAt?: string | null,
): Promise<string | null> {
  const db = createServiceClient();
  let q = db
    .from("page_sections")
    .update({ draft, updated_at: new Date().toISOString() })
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .eq("section_key", sectionKey);
  if (baseUpdatedAt) q = q.eq("updated_at", baseUpdatedAt);
  const { data, error } = await q.select("updated_at");
  if (error) throw new Error(`saveSection: ${error.message}`);
  if ((data ?? []).length > 0) return (data![0].updated_at as string) ?? null;

  // Nothing landed: the row moved, or there is no row yet.
  const { data: current } = await db
    .from("page_sections")
    .select("updated_at")
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .eq("section_key", sectionKey)
    .maybeSingle();
  if (current) throw new StaleSectionError(current.updated_at as string);

  const { data: made, error: insErr } = await db
    .from("page_sections")
    .insert({
      store_id: await getStoreId(),
      owner_type: owner,
      owner_id: ownerId,
      section_key: sectionKey,
      position,
      // Live columns hold the defaults; the draft is the only thing said so far.
      enabled: true,
      style: draft.style,
      content: {},
      draft,
      published_at: null,
    })
    .select("updated_at")
    .maybeSingle();
  if (insErr) throw new Error(`saveSection: ${insErr.message}`);
  return (made?.updated_at as string) ?? null;
}

/**
 * Copy drafts into the live columns. One section, or the whole page with its
 * settings. One transaction on the database side; see 0084.
 */
export async function publishPage(
  owner: OwnerType,
  ownerId: string,
  sectionKey?: string,
): Promise<{ published: number; updatedAt: Record<string, string> }> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("publish_page_drafts", {
    p_owner_type: owner,
    p_owner_id: ownerId,
    p_section_key: sectionKey ?? null,
  });
  if (error) throw new Error(`publishPage: ${error.message}`);
  // The stamps the trigger wrote, so the editor's next save has a baseline
  // that matches rather than a conflict with nobody.
  let q = db
    .from("page_sections")
    .select("section_key, updated_at")
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .order("section_key");
  if (sectionKey) q = q.eq("section_key", sectionKey);
  const { data: rows } = await q;
  return {
    published: Number(data ?? 0),
    updatedAt: Object.fromEntries((rows ?? []).map((r) => [r.section_key as string, r.updated_at as string])),
  };
}

/**
 * Throw the draft away. A section that was never published has nothing to go
 * back to, so its row goes; the default the editor shows is what comes back.
 */
export async function discardDraft(owner: OwnerType, ownerId: string, sectionKey: string): Promise<SectionRow> {
  const db = createServiceClient();
  const where = (q: ReturnType<typeof db.from>) =>
    q.eq("owner_type", owner).eq("owner_id", ownerId).eq("section_key", sectionKey);
  const { error: delErr } = await where(db.from("page_sections")).delete().is("published_at", null);
  if (delErr) throw new Error(`discardDraft: ${delErr.message}`);
  const { error } = await where(db.from("page_sections")).update({ draft: null });
  if (error) throw new Error(`discardDraft: ${error.message}`);
  const row = (await getPageSections(owner, ownerId)).find((r) => r.sectionKey === sectionKey);
  if (!row) throw new Error(`discardDraft: unknown section ${sectionKey}`);
  return row;
}
```

If `ReturnType<typeof db.from>` does not type-check, write the two `.eq` chains out twice; do not add a helper file.

Replace `savePageSettings` body:

```ts
export async function savePageSettings(
  owner: OwnerType,
  ownerId: string,
  input: PageSettings,
): Promise<void> {
  const db = createServiceClient();
  // The draft, in the table's spelling so publish_page_drafts() copies it
  // column for column. The live columns keep their defaults on a first save.
  const draft = {
    custom_css: input.customCss,
    custom_js: input.customJs,
    snippets: codeSnippetsSchema.safeParse(input.snippets).data ?? [],
    meta_title: input.metaTitle.trim(),
    meta_description: input.metaDescription.trim(),
    share_image_path: input.shareImagePath.trim(),
  };
  const { error } = await db.from("page_settings").upsert(
    { store_id: await getStoreId(), owner_type: owner, owner_id: ownerId, draft },
    { onConflict: "owner_type,owner_id" },
  );
  if (error) throw new Error(`savePageSettings: ${error.message}`);
}
```

The 0052 two-attempt dance goes: 0052 has been on production for weeks and the draft column is one column either way.

Replace `copyPage` from `const db = createServiceClient();` down:

```ts
  const storeId = await getStoreId();
  const source = await getPageSections(from.ownerType, from.ownerId, { draft: true });
  if (!(await hasPageSections(from.ownerType, from.ownerId, { includeDrafts: true }))) {
    throw new Error("That page has nothing on it.");
  }
  const real = await realPriceLabel(to.ownerType, to.ownerId);
  const list = sectionsFor(to.ownerType);
  // Every band gets a draft, even one the source left at its default, so
  // Publish page on the target publishes one design rather than a mix.
  for (const [i, def] of list.entries()) {
    const r = source.find((s) => s.sectionKey === def.key);
    if (!r) continue;
    await writeDraft(to.ownerType, to.ownerId, def.key, i, {
      enabled: r.enabled,
      style: r.style,
      accent: r.accent ?? null,
      variant: r.variant ?? null,
      content: retruthPrices((r.content ?? {}) as Record<string, unknown>, real),
      background: r.background ?? null,
      css_id: r.cssId ?? null,
      css_class: r.cssClass ?? null,
      layout: r.layout ?? null,
    });
  }
  void storeId;
  return list.length;
}

/**
 * Copy a page's rows exactly, drafts and publish state included.
 *
 * For duplicating a product or offer: the copy should be in the same state
 * the original is in, live where it was live and drafted where it was
 * drafted. copyPage is the other thing, "use that page as my template", and
 * it lands as drafts on purpose.
 */
export async function copyPageRows(
  from: { ownerType: OwnerType; ownerId: string },
  to: { ownerType: OwnerType; ownerId: string },
): Promise<number> {
  const db = createServiceClient();
  const { data: source, error } = await db
    .from("page_sections")
    .select("section_key, position, enabled, style, accent, variant, content, background, css_id, css_class, layout, draft, published_at")
    .eq("owner_type", from.ownerType)
    .eq("owner_id", from.ownerId);
  if (error) throw new Error(`copyPageRows read: ${error.message}`);
  if (!source || source.length === 0) return 0;
  await db.from("page_sections").delete().eq("owner_type", to.ownerType).eq("owner_id", to.ownerId);
  const { error: writeErr } = await db.from("page_sections").insert(
    source.map((r) => ({ ...r, store_id: undefined, owner_type: to.ownerType, owner_id: to.ownerId, store_id: undefined })),
  );
  if (writeErr) throw new Error(`copyPageRows write: ${writeErr.message}`);
  return source.length;
}
```

Fix the `store_id` in `copyPageRows`: it must be set, not undefined. Write it as `({ ...r, store_id: storeId, owner_type: ..., owner_id: ... })` with `const storeId = await getStoreId();` above. Remove the stray `void storeId;` in `copyPage` and its unused `storeId` line. Keep the existing comments on `copyPage` (what it deliberately does not carry across) and adjust the "Replaces the target's sections" paragraph to say it now writes drafts onto every band and deletes nothing.

In `lib/templates-store.ts` `globalUsage`: select `draft` too and walk both:

```ts
    .select("owner_type, owner_id, section_key, content, draft")
  ...
  for (const row of data ?? []) {
    const sources = [row.content, (row.draft as { content?: unknown } | null)?.content];
    const hit = sources.some((c) => {
      const content = c as { blocks?: unknown } | null;
      return !!content && Array.isArray(content.blocks) && globalIdsIn(normalizeBlocks(content.blocks)).includes(id);
    });
    if (!hit) continue;
    out.push({ owner: String(row.owner_type), ownerId: String(row.owner_id), sectionKey: String(row.section_key) });
  }
```

In `lib/duplicate-write.ts`: import `copyPageRows` instead of `copyPage`; change the guard to `hasPageSections(kind.ownerType, id, { includeDrafts: true })`; call `copyPageRows(...)`. In the remap step select `id, content, draft` and remap both:

```ts
    for (const row of rows ?? []) {
      const content = remapBlockPriceIds(row.content, byOldId);
      const d = row.draft as { content?: unknown } | null;
      const draftContent = d ? remapBlockPriceIds(d.content, byOldId) : null;
      if (!content && !draftContent) continue;
      const patch: Record<string, unknown> = {};
      if (content) patch.content = content;
      if (draftContent) patch.draft = { ...d, content: draftContent };
      const { error: upErr } = await db.from("page_sections").update(patch).eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
    }
```

The settings copy in duplicate-write: `savePageSettings(kind.ownerType, newId, await getPageSettings(kind.ownerType, id))` now lands as a draft on the copy. Replace with a verbatim row copy:

```ts
    const { data: row, error } = await db
      .from("page_settings")
      .select("custom_css, custom_js, snippets, meta_title, meta_description, share_image_path, draft")
      .eq("owner_type", kind.ownerType)
      .eq("owner_id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return;
    const { error: upErr } = await db
      .from("page_settings")
      .upsert({ ...row, store_id: await getStoreId(), owner_type: kind.ownerType, owner_id: newId }, { onConflict: "owner_type,owner_id" });
    if (upErr) throw new Error(upErr.message);
```

(`getStoreId` from `@/lib/store`; check it is imported in that file.)

- [ ] **Step 4: Fix the suites that assumed save is live**

Run: `npx vitest run lib/pages.integration.test.ts lib/section-conflict.integration.test.ts lib/copy-page.integration.test.ts lib/duplicate.integration.test.ts lib/templates-store.integration.test.ts lib/section-read-safety.integration.test.ts lib/typography-inheritance.integration.test.ts`

For each failure of the shape "saved X, live read shows default": the test is now describing the draft. Change the read to `getPageSections(owner, id, { draft: true })` where the test is about the save, or insert `await publishPage(owner, id)` before the read where the test is about what a visitor sees. A test that inserts rows directly and reads them back is untouched (`published_at` defaults to `now()`). `copy-page.integration.test.ts`: after `copyPage`, read the target with `{ draft: true }`, and add one assertion that the live target read is unchanged. Do not weaken any assertion; if a test cannot be made to pass by one of those two edits, stop and report it.

- [ ] **Step 5: Full suite and types**

Run: `npx vitest run; echo exit=$?` then `npx tsc --noEmit`
Expected: exit=0 both.

- [ ] **Step 6: Commit**

```bash
git add lib/pages.ts lib/templates-store.ts lib/duplicate-write.ts lib/*.integration.test.ts
git commit -m "Save writes a draft; publish, discard and copy know the difference"
```

---

### Task 4: Server actions

**Files:**
- Modify: `app/admin/pages/actions.ts` (`saveSectionAction` revalidation :117-122, `savePageSettingsAction` :150-197, `copyPageAction` :208-226; add two actions)
- Test: `app/admin/pages/actions.test.ts` (new, source-shape test in the style of `lib/page-metadata.test.ts`)

**Interfaces:**
- Produces:
  - `publishPageAction(_prev: PublishState, formData): Promise<PublishState>` with `type PublishState = { error?: string; published?: number; updatedAt?: Record<string, string> }`; form fields `ownerType`, `ownerId`, optional `sectionKey`.
  - `discardDraftAction(_prev: DiscardState, formData): Promise<DiscardState>` with `type DiscardState = { error?: string; row?: SectionRow }`; fields `ownerType`, `ownerId`, `sectionKey`.
- Consumes: `publishPage`, `discardDraft` from Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// app/admin/pages/actions.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Source-shape tests, the way lib/page-metadata.test.ts reads its action: the
// file is "use server" and imports server-only modules, so it cannot be
// imported into vitest. What is asserted is which cache paths each action
// clears, because a draft save clearing the storefront would be a lie and a
// publish that clears nothing would leave the old page up.
const src = readFileSync("app/admin/pages/actions.ts", "utf8");
const body = (name: string) => {
  const start = src.indexOf(`export async function ${name}`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
};

describe("draft and publish actions", () => {
  it("a draft save clears only the editor", () => {
    const s = body("saveSectionAction");
    expect(s).toContain("revalidatePath(adminPathFor(owner, ownerId))");
    expect(s).not.toContain('revalidatePath("/p"');
    expect(s).not.toContain('revalidatePath("/checkout/oto")');
    expect(s).not.toContain('revalidatePath("/", "layout")');
  });

  it("publish clears the whole store", () => {
    const s = body("publishPageAction");
    expect(s).toContain("await requireAdmin()");
    expect(s).toContain("publishPage(owner, ownerId, sectionKey || undefined)");
    expect(s).toContain('revalidatePath("/", "layout")');
  });

  it("discard returns the live row so the editor can show it", () => {
    const s = body("discardDraftAction");
    expect(s).toContain("await requireAdmin()");
    expect(s).toContain("discardDraft(owner, ownerId, sectionKey)");
    expect(s).toContain("return { row }");
  });

  it("settings merge over the draft, not over live", () => {
    expect(body("savePageSettingsAction")).toContain("getPageSettings(owner, ownerId, { draft: true })");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run app/admin/pages/actions.test.ts`
Expected: FAIL on all four.

- [ ] **Step 3: Implement**

In `app/admin/pages/actions.ts`:

Import: add `publishPage, discardDraft` to the `@/lib/pages` import and `import type { SectionRow } from "@/lib/page-sections";`.

`saveSectionAction`: replace the four `revalidatePath` lines and their comment with:

```ts
  // A draft is invisible to visitors, so only the editor needs to reload.
  // The store's caches clear on publish.
  revalidatePath(adminPathFor(owner, ownerId));
  return { savedKey: sectionKey, updatedAt };
```

`savePageSettingsAction`: change `const current = await getPageSettings(owner, ownerId);` to `const current = await getPageSettings(owner, ownerId, { draft: true });` and update the merge comment: "the base is the draft, so two panels saving in turn build one draft rather than each restarting from live". Remove `revalidatePath("/", "layout");` from it.

`copyPageAction`: remove `revalidatePath("/p", "layout");` and change the message to `` `${n} sections copied as drafts. Reload to edit them, then publish the page.` ``.

Add:

```ts
export type PublishState = { error?: string; published?: number; updatedAt?: Record<string, string> };

/**
 * Make the drafts live: one section when a key is given, otherwise the page
 * and its SEO and custom code together. Clears the whole store's cache rather
 * than guessing which paths a page appears on: the storefront lists offers, a
 * product page names an offer, an upsell renders an offer's sections.
 */
export async function publishPageAction(_prev: PublishState, formData: FormData): Promise<PublishState> {
  await requireAdmin();
  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  const sectionKey = String(formData.get("sectionKey") ?? "");
  if (!["product", "offer", "store", "checkout"].includes(owner) || !ownerId) return { error: "Unknown page." };
  try {
    const res = await publishPage(owner, ownerId, sectionKey || undefined);
    revalidatePath(adminPathFor(owner, ownerId));
    revalidatePath("/", "layout");
    return res;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not publish." };
  }
}

export type DiscardState = { error?: string; row?: SectionRow };

/** Drop one section's draft. Answers with the live row, which is what the editor should now show. */
export async function discardDraftAction(_prev: DiscardState, formData: FormData): Promise<DiscardState> {
  await requireAdmin();
  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  const sectionKey = String(formData.get("sectionKey") ?? "");
  if (!["product", "offer", "store", "checkout"].includes(owner) || !ownerId || !sectionKey) return { error: "Unknown section." };
  try {
    const row = await discardDraft(owner, ownerId, sectionKey);
    revalidatePath(adminPathFor(owner, ownerId));
    return { row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not discard that draft." };
  }
}
```

- [ ] **Step 4: Run, expect pass; types**

Run: `npx vitest run app/admin/pages/actions.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add app/admin/pages/actions.ts app/admin/pages/actions.test.ts
git commit -m "Publish and discard actions; draft saves stop clearing the store"
```

---

### Task 5: Preview on the real page, with tracking off

**Files:**
- Create: `lib/draft-preview.ts`, `components/page/preview-bar.tsx`
- Modify: `components/page/sales-page.tsx:161-170` (band id fallback), `components/analytics.tsx:234-254`, `components/attribution-tracker.tsx:71-74`
- Modify: `app/(store)/p/[slug]/page.tsx`, `app/(store)/o/[key]/page.tsx`, `app/(store)/page.tsx`, `app/oto-preview/[id]/page.tsx`
- Test: `lib/draft-preview.test.ts` (new), `components/page/preview-tracking.test.tsx` (new), `components/page/blocks.test.tsx` or `sales-page` test (band id)

**Interfaces:**
- Produces: `isDraftPreview(sp: { preview?: string; t?: string }, tokenKind?: string): Promise<boolean>`; `<PreviewBar />`.
- Consumes: `getAdminUser` (`lib/admin-guard`), `verifyPreviewToken` (`lib/preview-token`), Task 2 read options.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/draft-preview.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const admin = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-guard", () => ({ getAdminUser: () => admin() }));
vi.mock("@/lib/preview-token", () => ({
  verifyPreviewToken: (t: string | undefined, kind: string) => t === `ok-${kind}`,
}));

const { isDraftPreview } = await import("@/lib/draft-preview");

describe("isDraftPreview", () => {
  beforeEach(() => admin.mockReset());

  it("is off without the flag, whoever is asking", async () => {
    admin.mockResolvedValue({ id: "a" });
    expect(await isDraftPreview({})).toBe(false);
    expect(await isDraftPreview({ preview: "yes" })).toBe(false);
  });

  it("is off for a visitor who typed the flag", async () => {
    admin.mockResolvedValue(null);
    expect(await isDraftPreview({ preview: "1" })).toBe(false);
  });

  it("is on for an admin session", async () => {
    admin.mockResolvedValue({ id: "a" });
    expect(await isDraftPreview({ preview: "1" })).toBe(true);
  });

  it("is on for a valid token of the right kind, with no session", async () => {
    admin.mockResolvedValue(null);
    expect(await isDraftPreview({ preview: "1", t: "ok-oto" }, "oto")).toBe(true);
    expect(await isDraftPreview({ preview: "1", t: "ok-checkout" }, "oto")).toBe(false);
  });
});
```

```tsx
// components/page/preview-tracking.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const post = vi.fn();
vi.stubGlobal("fetch", post);

const { AttributionTracker } = await import("@/components/attribution-tracker");
const { Analytics } = await import("@/components/analytics");

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
  post.mockClear();
  window.history.replaceState(null, "", "/");
});

function mount(node: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host!).render(node));
  return host;
}

describe("a preview is not a visit", () => {
  it("the attribution tracker posts nothing", async () => {
    window.history.replaceState(null, "", "/p/x?preview=1&utm_source=meta");
    mount(<AttributionTracker />);
    await act(async () => {});
    expect(post).not.toHaveBeenCalled();
  });

  it("the pixel does not mount", () => {
    window.history.replaceState(null, "", "/?preview=1");
    const el = mount(<Analytics ids={{ metaPixelId: "1", ga4Id: null } as never} />);
    expect(el.querySelector("script")).toBeNull();
  });
});
```

Look at `Analytics`'s `Ids` type and pass the real shape; the `as never` is only there so the test compiles before you check. For the pixel test, assert on whatever the component renders when allowed (a `<Script>` or a `<noscript>`): read `components/analytics.tsx:258-300` and pick the element that is present when `allowed` and absent otherwise.

Add to the sales-page band test file (find the test that renders `SectionBand`, e.g. in `components/page/blocks.test.tsx` or `lib/review-fixes.test.tsx`; if none renders a band, create `components/page/band-anchor.test.tsx` with the same jsdom mount pattern as above):

```tsx
  it("a band with no id of its own can still be linked to by section key", () => {
    const el = mount(<SectionBand row={{ ...defaultRows(SECTIONS)[0], content: { blocks: [{ type: "heading", props: { text: "x" } }] } }} money={{ priceLabel: null, termsLabel: null }} />);
    expect(el.querySelector("section#section-hero")).not.toBeNull();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run lib/draft-preview.test.ts components/page/preview-tracking.test.tsx`
Expected: FAIL (module not found; fetch called; script present).

- [ ] **Step 3: Implement**

```ts
// lib/draft-preview.ts
import "server-only";
import { getAdminUser } from "@/lib/admin-guard";
import { verifyPreviewToken } from "@/lib/preview-token";

/**
 * Whether this render should show drafts.
 *
 * `?preview=1` alone does nothing: a visitor who types it gets the live page.
 * It takes an admin session (a tab opened from the editor carries the cookie)
 * or a signed preview token (an iframe does not; see lib/preview-token.ts).
 */
export async function isDraftPreview(
  sp: { preview?: string; t?: string },
  tokenKind?: string,
): Promise<boolean> {
  if (sp.preview !== "1") return false;
  if (tokenKind && verifyPreviewToken(sp.t, tokenKind)) return true;
  return (await getAdminUser()) !== null;
}
```

```tsx
// components/page/preview-bar.tsx
/** Says what this is, on every preview, above everything. */
export function PreviewBar() {
  return (
    <div className="sticky top-0 z-50 bg-navy px-3 py-1 text-center text-xs font-medium text-white">
      Preview. Drafts shown. Not live.
    </div>
  );
}
```

`components/page/sales-page.tsx` `SectionBand`: change `cssId={row.cssId}` to

```tsx
      // A band with no id of its own still needs one the preview can jump to.
      cssId={row.cssId || `section-${row.sectionKey}`}
```

`components/attribution-tracker.tsx`, first line inside the `useEffect`:

```ts
    // A preview is somebody checking their own work, not a visit.
    if (new URLSearchParams(window.location.search).get("preview") === "1") return;
```

`components/analytics.tsx`, inside the `useEffect` before the consent read:

```ts
    // A preview is the editor looking, not a visitor. Same exit as an
    // opt-out: unmount, and drop anything the snippet already queued.
    const previewing = new URLSearchParams(window.location.search).get("preview") === "1";
    if (previewing) {
      setAllowed(false);
      dropPendingPixelCalls();
      return;
    }
```

(Keep the listener registration below it for the non-preview path; returning early here skips it, which is right: nothing should flush.)

`app/(store)/p/[slug]/page.tsx`: both `generateMetadata` and `ProductPage` take `searchParams: Promise<{ preview?: string }>`. In each:

```ts
  const preview = await isDraftPreview(await searchParams);
  const product = await getProductBySlug(slug);
  if (!product || (product.status !== "published" && !preview)) notFound();
```

In `ProductPage`: `if (!preview) void recordPageHit(...)`; `hasPageSections("product", product.id, { includeDrafts: preview })`; `getPageSections("product", product.id, { draft: preview })`; `getPageSettings("product", product.id, { draft: preview })` (in both functions); render `{preview && <PreviewBar />}` as the first child of the full-bleed div and `{!preview && <TrackView ... />}`. Add `import { isDraftPreview } from "@/lib/draft-preview"; import { PreviewBar } from "@/components/page/preview-bar";` and `export const metadata`-style noindex: since the route already exports `generateMetadata`, add `robots: preview ? { index: false, follow: false } : undefined` into the returned object by spreading: `return { ...pageMetadata({...}), ...(preview ? { robots: { index: false, follow: false } } : {}) };`.

`app/(store)/o/[key]/page.tsx`: same four changes; the owner gate becomes `if (!listed || (!listed.active && !preview)) notFound(); if (!(await hasPageSections("offer", listed.id, { includeDrafts: preview }))) notFound();`.

`app/(store)/page.tsx` `Home`: accept `{ searchParams }: { searchParams: Promise<{ preview?: string }> }`, `const preview = await isDraftPreview(await searchParams);`, `getPageSections("store", storeId, { draft: preview })`, and when `built` render `<PreviewBar />` first when `preview`. (The home page has no `TrackView` or `recordPageHit`; the layout's client trackers already bail.)

`app/oto-preview/[id]/page.tsx`: `getPageSections("offer", offer.id, { draft: true })`. It is already token-gated.

- [ ] **Step 4: Run, expect pass; full suite; types**

Run: `npx vitest run; echo exit=$?` and `npx tsc --noEmit`. `page-editor.features.test.ts` and any test asserting `id={cssId || undefined}` may need their expectation updated to the new fallback; keep the assertion's intent.

- [ ] **Step 5: Commit**

```bash
git add lib/draft-preview.ts lib/draft-preview.test.ts components/page/preview-bar.tsx components/page/preview-tracking.test.tsx components/page/sales-page.tsx components/analytics.tsx components/attribution-tracker.tsx "app/(store)/p/[slug]/page.tsx" "app/(store)/o/[key]/page.tsx" "app/(store)/page.tsx" "app/oto-preview/[id]/page.tsx"
git commit -m "Preview drafts on the real page, with every tracker off"
```

---

### Task 6: Page editor bar, rail tag, discard, publish page

**Files:**
- Modify: `components/admin/page-editor.tsx` (props :55-70, state :71-80, `saveAll` :148-190, bar :285-332, `sectionMenu` :250-268, `SectionRail` :395-470, `SectionPanel` → `BlockCanvasField` :690-740)
- Modify: `app/admin/products/[id]/page-editor/page.tsx:147`, `app/admin/offers/[id]/page-editor/page.tsx:167`, `app/admin/home/page.tsx:96` (`liveHref` → `previewHref`, `publishNote`)
- Test: `components/admin/page-editor.features.test.ts` (extend), `components/admin/page-editor.publish.test.tsx` (new)

**Interfaces:**
- Consumes: `publishPageAction`, `discardDraftAction` (Task 4); `SectionRow.hasDraft` (Task 2).
- Produces: `PageEditor` props `previewHref: string` (replaces `liveHref`), `publishNote?: string`, `settingsHasDraft?: boolean`. `BlockCanvasField`/`SectionPanel` gain `onPublish: () => Promise<void>` and `previewHref: string`, passed into `BlockEditor` (Task 7 consumes `onPublish`, `onPreview`, `lastSavedAt`).

- [ ] **Step 1: Write the failing tests**

Add to `components/admin/page-editor.features.test.ts` (it reads the source; follow its `has()` helper):

```ts
  it("saves drafts, publishes the page, and previews from the bar", () => {
    has("previewHref");
    has("publishPageAction");
    has("discardDraftAction");
    has('"Publish page"');
    has("Discard draft");
    has("Saved as a draft");
    has('title="Saved, not published"');
  });
```

Remove or update its `has("liveHref")` line to `has("previewHref")`.

```tsx
// components/admin/page-editor.publish.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { defaultRows, SECTIONS } from "@/lib/page-sections";

const publish = vi.fn(async () => ({ published: 2, updatedAt: { hero: "2026-09-14T10:00:00Z" } }));
vi.mock("@/app/admin/pages/actions", () => ({
  saveSectionAction: vi.fn(async () => ({ savedKey: "hero", updatedAt: "2026-09-14T09:00:00Z" })),
  publishPageAction: (_p: unknown, fd: FormData) => publish(fd),
  discardDraftAction: vi.fn(async () => ({ row: defaultRows(SECTIONS)[0] })),
  copyPageAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/templates/actions", () => ({ saveGlobalBlocksAction: vi.fn(), saveTemplateAction: vi.fn() }));
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

const { PageEditor } = await import("@/components/admin/page-editor");

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
  publish.mockClear();
});

function mount(rows = defaultRows(SECTIONS)) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() =>
    createRoot(host!).render(
      <PageEditor
        ownerType="product"
        ownerId="11111111-1111-1111-1111-111111111111"
        initial={rows}
        money={{ priceLabel: "$9", termsLabel: null }}
        previewHref="/p/x?preview=1"
      />,
    ),
  );
  return host;
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

describe("publishing from the page bar", () => {
  it("is disabled with nothing to publish, and a saved draft enables it", () => {
    const rows = defaultRows(SECTIONS);
    expect(button(mount(rows), "Publish page").disabled).toBe(true);
    host!.remove();
    expect(button(mount([{ ...rows[0], hasDraft: true }, ...rows.slice(1)]), "Publish page").disabled).toBe(false);
  });

  it("publishes the whole page and marks every draft as live", async () => {
    const rows = defaultRows(SECTIONS);
    const el = mount([{ ...rows[0], hasDraft: true }, ...rows.slice(1)]);
    expect(el.textContent).toContain("Draft");
    await act(async () => button(el, "Publish page").click());
    expect(publish).toHaveBeenCalledTimes(1);
    const fd = publish.mock.calls[0][0] as FormData;
    expect(fd.get("sectionKey")).toBe("");
    expect(el.textContent).toContain("Published.");
    expect(button(el, "Publish page").disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run components/admin/page-editor.features.test.ts components/admin/page-editor.publish.test.tsx`
Expected: FAIL (no "Publish page" button; `previewHref` unknown).

- [ ] **Step 3: Implement**

In `components/admin/page-editor.tsx`:

Imports: add `publishPageAction, discardDraftAction` from `@/app/admin/pages/actions`.

Props: rename `liveHref: string` to `previewHref: string` with comment `/** The real page with ?preview=1, which shows drafts to an admin. */`; add:

```ts
  /** Shown after a page publish when the owner itself is not live yet. */
  publishNote?: string;
  /** Whether SEO or custom code have a draft waiting; counts toward "not published". */
  settingsHasDraft?: boolean;
```

State: add

```ts
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(!!settingsHasDraft);
  const draftKeys = rows.filter((r) => r.hasDraft).map((r) => r.sectionKey);
  const unpublished = dirtyKeys.length + draftKeys.length + (settingsDraft ? 1 : 0);
```

In `saveAll`, after `setDirty((d) => ({ ...d, [key]: false }));` also mark the draft: change the `setRows` update to `{ ...r, updatedAt: res.updatedAt, hasDraft: true }` (and set `hasDraft: true` even when `res.updatedAt` is absent). Set `setPublished(null)` at the start of `saveAll`.

Add:

```ts
  /**
   * Save what is dirty, then make it live. One section or the page.
   *
   * Save first, because Publish is the button people press when they are
   * done, and "done" includes the change they just typed. A save that fails
   * stops the publish: nothing half-done goes live.
   */
  async function publish(sectionKey?: string): Promise<string | null> {
    if (publishing) return null;
    setPublishing(true);
    setPublished(null);
    const failed = await saveAll();
    if (failed) {
      setPublishing(false);
      return failed;
    }
    const fd = new FormData();
    fd.append("ownerType", ownerType);
    fd.append("ownerId", ownerId);
    fd.append("sectionKey", sectionKey ?? "");
    const res = await publishPageAction({}, fd);
    setPublishing(false);
    if (res.error) {
      setSaveError(res.error);
      return res.error;
    }
    const stamps = res.updatedAt ?? {};
    setRows((rs) =>
      rs.map((r) =>
        !sectionKey || r.sectionKey === sectionKey
          ? { ...r, hasDraft: false, updatedAt: stamps[r.sectionKey] ?? r.updatedAt }
          : r,
      ),
    );
    if (!sectionKey) setSettingsDraft(false);
    setPublished(sectionKey ? "Section published." : publishNote ? `Page published. ${publishNote}` : "Published.");
    return null;
  }

  /** Save, then open the preview. The tab is opened before the await so the browser does not treat it as a popup. */
  async function preview(hash?: string): Promise<void> {
    const w = window.open("about:blank", "_blank");
    const failed = await saveAll();
    if (failed) {
      w?.close();
      return;
    }
    if (w) w.location.href = `${previewHref}${hash ? `#${hash}` : ""}`;
  }

  async function discard(row: SectionRow) {
    if (!window.confirm(`Throw away the draft of ${sectionDef(row.sectionKey)?.title ?? row.sectionKey} and go back to what is live?`)) return;
    const fd = new FormData();
    fd.append("ownerType", ownerType);
    fd.append("ownerId", ownerId);
    fd.append("sectionKey", row.sectionKey);
    const res = await discardDraftAction({}, fd);
    if (res.error || !res.row) {
      setSaveError(res.error ?? "Could not discard that draft.");
      return;
    }
    setRows((rs) => rs.map((r) => (r.sectionKey === row.sectionKey ? res.row! : r)));
    setDirty((d) => ({ ...d, [row.sectionKey]: false }));
  }
```

`sectionMenu`: add before the Hide/Show item:

```ts
        {
          label: "Discard draft",
          onSelect: () => void discard(row),
          disabled: row.hasDraft ? undefined : "Nothing saved that is not live",
          danger: true,
        },
```

The bar (replace the whole sticky `div` at :285-332):

```tsx
      <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 px-3 py-2 backdrop-blur">
        <span className="text-xs text-muted" aria-live="polite">
          {saveError
            ? saveError
            : published
              ? published
              : savedAt
                ? `Last saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : `${rows.length} sections`}
          {unpublished > 0 && !saveError && (
            <> · {unpublished} not published</>
          )}
        </span>
        <PresenceNote editors={editors} what={openDef ? `the ${openDef.title} section` : "this section"} />
        <CopyPage
          ownerType={ownerType}
          ownerId={ownerId}
          sources={pageSources}
          hasSections={rows.some((r) => {
            const view = buildSectionView(r);
            return !!view && blocksForSection(view).length > 0;
          })}
        />
        {pageIsBlank && (
          <button
            type="button"
            onClick={fillFromStarter}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-fg"
            title="Fills every band with the layout and copy we built against the reference page. Nothing is saved until you press Save."
          >
            Start from the template
          </button>
        )}
        <DeviceSwitch device={device} onChange={setDevice} className="ml-auto" />
        <button
          type="button"
          onClick={() => void preview()}
          aria-label="Preview the page with drafts"
          title="Preview the page with drafts"
          className="rounded-lg border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-fg"
        >
          👁
        </button>
        <button
          type="button"
          onClick={() => void saveAll()}
          disabled={saving || dirtyKeys.length === 0}
          aria-label="Save draft"
          title="Save draft"
          className="rounded-lg border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-fg disabled:opacity-50"
        >
          {saving ? "…" : "💾"}
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishing || saving || unpublished === 0}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {publishing ? "Publishing…" : "Publish page"}
        </button>
      </div>
```

`SectionRail`: in the status cluster, add a branch before `empty`:

```tsx
              ) : row.hasDraft ? (
                <span className="shrink-0 rounded bg-primary/10 px-1 text-[0.62rem] font-medium text-primary" title="Saved, not published">
                  Draft
                </span>
```

(The order is: dirty dot, then Draft tag, then Empty, then saved dot.)

`SectionPanel` call: add `onPublish={async () => { const f = await publish(openRow.sectionKey); if (f) throw new Error(f); }}` and `onPreview={() => preview(openRow.cssId || `section-${openRow.sectionKey}`)}` and `lastSavedAt={savedAt}`. Thread all three through `SectionPanel` → `BlockCanvasField` → `<BlockEditor onPublish onPreview lastSavedAt />` (Task 7 adds those props to `BlockEditor`; add them to its props type in THIS task as optional `onPublish?: () => Promise<void>; onPreview?: () => Promise<void>; lastSavedAt?: number | null;` so this task compiles; Task 7 renders them).

Route files: replace `liveHref={...}` with `previewHref`:
- products: `previewHref={`/p/${product.slug}?preview=1`}` and `publishNote={product.status !== "published" ? "The product itself is still a draft, so buyers can't see it yet." : undefined}` and `settingsHasDraft={settings.hasDraft}` where `settings` is read with `getPageSettings("product", id, { draft: true })`; also `getPageSections("product", id, { draft: true })`.
- offers: `previewHref={`/o/${offer.key}?preview=1`}`, `publishNote={!offer.active ? "The offer is switched off, so buyers can't see it yet." : undefined}`, same draft reads.
- home: `previewHref="/?preview=1"`, `getPageSections("store", storeId, { draft: true })`.

- [ ] **Step 4: Run, expect pass; full suite; types**

Run: `npx vitest run; echo exit=$?` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/page-editor.tsx components/admin/block-editor.tsx components/admin/page-editor.features.test.ts components/admin/page-editor.publish.test.tsx "app/admin/products/[id]/page-editor/page.tsx" "app/admin/offers/[id]/page-editor/page.tsx" app/admin/home/page.tsx
git commit -m "Page bar: save a draft, preview it, publish the page; Draft tags on the rail"
```

---

### Task 7: Builder header

**Files:**
- Modify: `components/admin/block-editor.tsx` (props :136-215, key handler :716-739, state :530-536, header :806-910)
- Test: `components/admin/block-editor.header.test.tsx` (new)

**Interfaces:**
- Consumes: `onSave`, `onPublish`, `onPreview`, `lastSavedAt` props (Task 6 added the types).

- [ ] **Step 1: Write the failing test**

```tsx
// components/admin/block-editor.header.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BAND_STYLES } from "@/lib/page-sections";

vi.mock("@/app/admin/templates/actions", () => ({ saveTemplateAction: vi.fn(), saveGlobalBlocksAction: vi.fn() }));
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

const { BlockEditor } = await import("@/components/admin/block-editor");

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

function mount(over: Partial<React.ComponentProps<typeof BlockEditor>> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() =>
    createRoot(host!).render(
      <BlockEditor
        blocks={[]}
        theme={BAND_STYLES.paper}
        title="Hero"
        onChange={() => {}}
        onClose={() => {}}
        {...over}
      />,
    ),
  );
  return host;
}
const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

describe("the builder header", () => {
  it("has Back, Save and Publish, and Save stays open", async () => {
    const onSave = vi.fn(async () => {});
    const onClose = vi.fn();
    const el = mount({ onSave, onClose, onPublish: async () => {} });
    expect(button(el, "Back")).toBeDefined();
    expect(button(el, "Discard")).toBeUndefined();
    expect(button(el, "Publish")).toBeDefined();
    await act(async () => button(el, "Save")!.click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("publish saves first, then publishes", async () => {
    const order: string[] = [];
    const el = mount({
      onSave: async () => { order.push("save"); },
      onPublish: async () => { order.push("publish"); },
    });
    await act(async () => button(el, "Publish")!.click());
    expect(order).toEqual(["save", "publish"]);
  });

  it("Cmd+S saves", async () => {
    const onSave = vi.fn(async () => {});
    mount({ onSave });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("without onSave it still says Done and closes", async () => {
    const onClose = vi.fn();
    const el = mount({ onClose });
    await act(async () => button(el, "Done")!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

If `BAND_STYLES.paper` is not the `BandTheme` shape `BlockEditor` wants, build the theme the way `block-editor.test.tsx` does and reuse that.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run components/admin/block-editor.header.test.tsx`
Expected: FAIL (no Back/Publish; Save closes).

- [ ] **Step 3: Implement**

In `components/admin/block-editor.tsx`:

Destructure `onPublish, onPreview, lastSavedAt` in the props list. Add state `const [savedAt, setSavedAt] = useState<number | null>(lastSavedAt ?? null);` and `const [justSaved, setJustSaved] = useState(false);`.

Add above the header:

```ts
  /** Save from in here and stay. Left open with the reason on failure. */
  async function save(): Promise<boolean> {
    if (!onSave || busy) return false;
    setBusy(true);
    setSaveFailed(null);
    try {
      await onSave();
      setSavedAt(Date.now());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      return true;
    } catch (e) {
      setSaveFailed(e instanceof Error ? e.message : "That did not save. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
```

Key handler: add before the `undoIntent` line:

```ts
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
```

and add `onSave` to that effect's dependency array comment (the eslint-disable is already there).

Header: replace from `<header ...>` to `</header>` with:

```tsx
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        {/* "Back", and it asks before losing anything. Escape is the same exit. */}
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            const changed = JSON.stringify(opening.current) !== JSON.stringify(blocks);
            if (changed && !window.confirm("Go back and throw away the changes made in here since you opened it?")) return;
            if (changed) onChange(opening.current);
            onClose();
          }}
          className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-fg hover:text-fg"
        >
          ← Back
        </button>
        <span className="text-sm">
          <strong className="font-display">{title}</strong>
          {savedAt !== null && (
            <span className="ml-2 text-xs text-muted">
              Last saved {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </span>
        <DeviceSwitch device={device} onChange={pickDevice} className="mx-auto" />
        <div className="flex items-center gap-0.5">
          <IconBtn label="Undo (⌘Z)" onClick={stepBack} disabled={history.past.length === 0}>↶</IconBtn>
          <IconBtn label="Redo (⇧⌘Z)" onClick={stepForward} disabled={history.future.length === 0}>↷</IconBtn>
          <IconBtn
            label={saved ? "Saved to Templates" : "Save this section as a template"}
            onClick={() => void saveAsTemplate()}
            disabled={blocks.length === 0 || saving}
          >
            {saved ? "✓" : "＋"}
          </IconBtn>
          <IconBtn
            label={exported ? "Copied — drop it into lib/templates/" : "Copy this section as a template file"}
            onClick={() => {
              void navigator.clipboard.writeText(templateSource(title, blocks)).then(() => {
                setExported(true);
                setTimeout(() => setExported(false), 2000);
              });
            }}
            disabled={blocks.length === 0}
          >
            {exported ? "✓" : "⇪"}
          </IconBtn>
        </div>
        <span className="text-xs text-muted">
          {blocks.length === 0 ? "Empty" : `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
        </span>
        {saveFailed && (
          <span className="max-w-[28rem] truncate text-xs text-primary" title={saveFailed}>
            {saveFailed}
          </span>
        )}
        {onSave ? (
          <>
            {onPreview && (
              <IconBtn
                label="Save a draft and preview this section"
                onClick={() => {
                  // Opened before the await so the browser does not treat
                  // the tab as a popup; onPreview fills it in.
                  void save().then((ok) => ok && onPreview());
                }}
                disabled={busy}
              >
                👁
              </IconBtn>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg disabled:opacity-60"
            >
              {busy ? "Saving…" : justSaved ? "Saved" : "Save"}
            </button>
            {onPublish && (
              <button
                type="button"
                onClick={async () => {
                  if (!(await save())) return;
                  setBusy(true);
                  try {
                    await onPublish();
                  } catch (e) {
                    setSaveFailed(e instanceof Error ? e.message : "That did not publish.");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
              >
                Publish
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            Done
          </button>
        )}
      </header>
```

The eye's `onPreview` in Task 6 already opens the window first and then saves; here the builder saves first through its own `save()` and then calls `onPreview`, which itself calls `saveAll` (a no-op when nothing is dirty) and opens the tab. Popup blockers act on the gap between click and `window.open`; to keep that gap empty, change Task 6's `preview()` to accept `{ alreadySaved?: boolean }` and, when true, skip `saveAll` and open directly. Pass `onPreview={() => preview(hash, { alreadySaved: true })}` from `BlockCanvasField`. Keep the "Discard"-related comments that explain why there is one primary button; update them to describe Back.

- [ ] **Step 4: Run; full suite; types**

Run: `npx vitest run; echo exit=$?` and `npx tsc --noEmit`. `block-editor.test.tsx` / `builder-shape.test.tsx` may assert "Discard" or "Save" closes; update to the new behaviour, keeping their intent (there is still exactly one primary button; Escape still leaves).

- [ ] **Step 5: Commit**

```bash
git add components/admin/block-editor.tsx components/admin/block-editor.header.test.tsx components/admin/page-editor.tsx components/admin/*.test.tsx
git commit -m "Builder header: Back, last saved, preview, Save stays open, Publish"
```

---

### Task 8: Panels, badges, links

**Files:**
- Modify: `components/admin/page-seo.tsx:159-165`, `components/admin/page-settings.tsx` (the Saved. line)
- Modify: `app/admin/page.tsx:36`, `app/admin/products/[id]/page.tsx:25`, `app/admin/offers/[id]/page.tsx:36` (`includeDrafts: true`)
- Modify: `app/admin/offers/[id]/page-editor/page.tsx` CopyLink note (:119-123)
- Test: `components/admin/page-seo.test.tsx` (new, source-shape), extend `app/admin/pages/actions.test.ts`? No: one jsdom test that the SEO panel says the draft line after a save.

- [ ] **Step 1: Write the failing test**

```tsx
// components/admin/page-seo.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/app/admin/pages/actions", () => ({
  savePageSettingsAction: vi.fn(async () => ({ saved: true })),
}));
const { PageSeo } = await import("@/components/admin/page-seo");

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

describe("the SEO panel", () => {
  it("says a save is a draft", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    act(() =>
      createRoot(host!).render(
        <PageSeo ownerType="product" ownerId="p" metaTitle="" metaDescription="" shareImagePath="" fallbackTitle="T" fallbackDescription="" fallbackImageUrl={null} />,
      ),
    );
    const form = host.querySelector("form")!;
    await act(async () => form.requestSubmit());
    expect(host.textContent).toContain("Saved as a draft. Publish the page to make it live.");
  });
});
```

If `requestSubmit` does not drive `useActionState` under jsdom, replace the submit with a direct assertion on the component's source (`readFileSync` + `toContain("Saved as a draft. Publish the page to make it live.")`) in both panels; say so in the commit message.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run components/admin/page-seo.test.tsx`

- [ ] **Step 3: Implement**

`page-seo.tsx` and `page-settings.tsx`: replace the `Saved.` span text with `Saved as a draft. Publish the page to make it live.`

Admin badge pages: add `{ includeDrafts: true }` to the three `hasPageSections` calls named above, with a one-line comment: `// A page being drafted counts as "built" in the admin; only visitors need it published.`

Offer editor CopyLink note: change "Live once you save a section" to "Live once you publish the page".

- [ ] **Step 4: Run; full suite; types; commit**

```bash
git add components/admin/page-seo.tsx components/admin/page-settings.tsx components/admin/page-seo.test.tsx app/admin/page.tsx "app/admin/products/[id]/page.tsx" "app/admin/offers/[id]/page.tsx" "app/admin/offers/[id]/page-editor/page.tsx"
git commit -m "Panels say a save is a draft; admin badges count drafted pages"
```

---

### Task 9: Docs and the deploy note

**Files:**
- Modify: `docs/lessons.md` (append), `AGENTS.md` (Shipping section, one bullet)

- [ ] **Step 1: Append to `docs/lessons.md`**

```markdown
## Save is a draft (14 Sep 2026)

Since 0084, `saveSection` and `savePageSettings` write `draft` and nothing a
visitor can see. Live content moves only through `publish_page_drafts()`
(`publishPage` in lib/pages.ts). Three things this changes for anyone writing
code or tests here:

- A test that saves and then reads what a visitor sees must publish in
  between, or read with `{ draft: true }` and say which it means.
- A row with `published_at is null` is invisible to `getPageSections` and
  `hasPageSections` by default. `includeDrafts: true` is for the admin only.
- `revalidatePath` for public routes belongs on publish, never on save.
```

- [ ] **Step 2: Add to `AGENTS.md` under "Code that bites"**

```markdown
- **Saving a page writes a draft.** `page_sections.draft` and `page_settings.draft`
  are what the editor and `?preview=1` read; visitors read the live columns,
  and only `publishPage()` moves one into the other. See `docs/lessons.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/lessons.md AGENTS.md
git commit -m "Docs: save is a draft"
```

---

## Self-review

**Spec coverage.** Data → Task 1. Reads → Task 2. Writes (save, settings, copyPage, duplicate, globalUsage, stale guard) → Task 3. Actions → Task 4. Preview (flag, gate, owner gate skip, no tracking, bar, noindex, anchors, oto-preview) → Task 5. Page bar, rail tag, Discard draft, publish page, publishNote, settings count → Task 6. Builder header, Back, Save stays, ⌘S, eye, Publish → Task 7. Panel copy, admin badges, offer-link (unchanged: default live read is what it needs) → Task 8. Deploy order lives in the spec; the controller applies 0084 to production before pushing. `beforeunload`: the editor has none today and the spec asks for no change.

**Placeholders.** None. `GLOBAL_ID_FROM_THIS_FILE` in Task 3 is an instruction to read the existing test's identifier, not a value to invent.

**Type consistency.** `publishPage` returns `{ published: number; updatedAt: Record<string, string> }` in Tasks 3, 4, 6. `discardDraft` returns `SectionRow` in Tasks 3, 4, 6. `hasDraft` on `SectionRow` and `PageSettings` in Tasks 2, 3, 6. `previewHref` replaces `liveHref` in Task 6 and the three route files. `BlockEditor` props `onPublish`, `onPreview`, `lastSavedAt` typed in Task 6, rendered in Task 7.
