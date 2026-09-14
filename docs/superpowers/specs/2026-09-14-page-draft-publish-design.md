# Draft and publish for pages

Approved in chat, 14 Sep 2026.

## The problem

Every Save in the page editor and the section builder writes straight to the
row the live site reads (`page_sections`, and `page_settings` for SEO and
custom code). There is no draft. "Preview whole page" opens the public URL, so
it can only ever show what is already live, and it 404s on a product whose
status is still draft.

The store owner asked for the GoHighLevel model: Save keeps a draft, Publish makes it live,
an eye icon previews the draft. A section can be published on its own, and the
page view can publish every draft on the page at once.

## Decisions taken in chat

| Question | Answer |
|---|---|
| Eye icon with unsaved edits on screen | Save a draft first, then open the preview |
| SEO and custom CSS/JS | Draft them too; page Publish sends them with the sections |
| Which pages | All: product, offer (sales page and upsell), home, checkout |
| GHL ideas | Placement only: Back, last saved, devices, then preview / save / Publish at the right. Nothing else |

## Data

One migration, `0084_page_drafts.sql`. Check `ls supabase/migrations | tail -1`
before numbering; 0083 is the last today.

### `page_sections`

- `draft jsonb null`. The whole pending section:
  `{ enabled, style, accent, variant, content, background, css_id, css_class, layout }`.
  Null means no unpublished work.
- `published_at timestamptz null default now()`. Null means the row has only
  ever been a draft. Backfill: every existing row gets
  `coalesce(updated_at, now())`, so everything live today stays live.

The default of `now()` matters for the deploy window: code that predates this
migration inserts rows without naming the column, and those rows are live
writes, so they must read as published.

### `page_settings`

- `draft jsonb null`. `{ custom_css, custom_js, snippets, meta_title, meta_description, share_image_path }`.

### Publish function

`publish_page_drafts(p_owner_type text, p_owner_id uuid, p_section_key text default null) returns int`

One transaction:

1. For each `page_sections` row of that owner (and that `section_key` when
   given) where `draft is not null`: copy every draft field into its live
   column, set `draft = null`, `published_at = now()`.
2. When `p_section_key` is null, do the same for the owner's `page_settings`
   row.
3. Return the number of rows published.

A failure anywhere rolls back all of it. Half a page live is worse than none.
Granted to `service_role` only. Values are copied as stored: `saveSection` and
`savePageSettings` already validate and sanitize before writing the draft, and
`getPageSections` sanitizes again on read.

After the migration: `notify pgrst, 'reload schema';`

## Reads

`getPageSections(owner, id, { draft = false } = {})`

- Live (default, every public route): rows with `published_at is null` are
  treated as if no row existed, so the section falls back to its default
  exactly as an untouched section does today. `draft` is ignored.
- Draft (editor, preview): each row is `draft ?? live`, and `SectionRow` gains
  `hasDraft: boolean`.

`hasPageSections(owner, id, { includeDrafts = false } = {})`

- Default counts only rows with `published_at is not null`. This is what keeps
  a brand new offer page that only holds drafts a 404 at `/o/[key]`, and what
  `lib/offer-link.ts` must use so it never links to an unpublished page.
- Admin badges and "build page" checks (`app/admin/page.tsx`,
  `app/admin/products/[id]/page.tsx`, `app/admin/offers/[id]/page.tsx`) pass
  `includeDrafts: true`.

`getPageSettings(owner, id, { draft = false } = {})`: draft mode returns the
draft merged over live, plus `hasDraft`.

`globalUsage` (`lib/templates-store.ts`) must also walk `draft.content`.
Otherwise a global design referenced only by a draft can be deleted, and the
draft publishes a pointer to nothing.

## Writes

| Writer | Today | After |
|---|---|---|
| `saveSection` (editor Save, builder Save) | upserts live columns | writes `draft` only. First-ever save inserts the row with `published_at = null` |
| `savePageSettings` | upserts live columns | merges into `draft`, over the current draft or live |
| `copyPage` ("Copy another page") | deletes target rows, inserts source | writes each target section's `draft` from the source's draft-over-live. Target sections the source lacks get a draft of their defaults. Nothing is deleted |
| Paste section, "Start from the template" | editor state, then Save | unchanged; Save now means draft |
| `seedFromStarter` (home, checkout) | `saveSection` | lands as draft through `saveSection` |
| `seedPage` ("switch the page on") | inserts empty live rows | unchanged: empty defaults, live, as today |
| `duplicate-write.ts` (duplicate product/offer) | copies rows | copies `draft` and `published_at` as they are |
| `saveGlobalBlocksAction` (global designs) | live on save | **unchanged, out of scope.** A global is shared by many pages, so no single page's Publish can own it. The "Edit globally" confirmation says it goes live on every page that uses it |

The stale-write guard stays. Draft saves still compare `updated_at`. Publishing
bumps `updated_at` too, so the publish action returns each section's new stamp
and the editor moves its baselines forward. Without that the publisher's own
next save reports a conflict with nobody.

## Actions

In `app/admin/pages/actions.ts`, all behind `requireAdmin()`:

- `saveSectionAction`: revalidates only the admin editor path. The public
  revalidations move to publish.
- `publishPageAction(owner, ownerId, sectionKey?)`: calls the function,
  returns `{ published, updatedAt: Record<sectionKey, string> }`, then
  `revalidatePath("/", "layout")`. That also covers `/o/[key]`, which today's
  save path never revalidates.
- `discardDraftAction(owner, ownerId, sectionKey)`: sets that row's
  `draft = null`. A row with `published_at is null` is deleted instead, since
  there is nothing live to go back to.

## Preview

The eye icon opens the real page with `?preview=1`. It is the same route and
renderer buyers get, so the preview cannot drift from the live page.

`isDraftPreview(searchParams)`: true only when `preview=1` is present **and**
either the admin session passes (a new tab carries the cookie) or a valid
`verifyPreviewToken` token is present (iframes do not carry it; see
`lib/preview-token.ts`). A visitor who types `?preview=1` gets the live page.

When true, the route:

- reads sections and settings with `{ draft: true }`, including in
  `generateMetadata`
- skips the owner gate: a product in draft status, or an inactive offer, still
  renders
- skips `recordPageHit` and `TrackView`
- renders a slim bar at the top: "Preview. Drafts shown. Not live."
- is `noindex`

Routes:

| Page | Eye icon opens |
|---|---|
| Product | `/p/[slug]?preview=1` |
| Offer | `/o/[key]?preview=1` |
| Offer upsell | existing `/admin/offers/[id]/preview`; `/oto-preview/[id]` reads drafts |
| Home | `/?preview=1` |
| Checkout | existing `/checkout-preview`; passes draft mode into `CheckoutPage` |

A section preview is the same URL with `#<section anchor>`. Sections render no
id unless a CSS id is set, so the renderer adds `data-section="<key>"`, and a
few lines of script scroll to it after load.

**Tracking must not fire on a preview.** `Analytics` and `AttributionTracker`
live in the store layout, which cannot see search params, so both skip when the
URL carries `preview=1`. Ceiling: a real visitor who adds `?preview=1` by hand
opts themselves out of tracking. That is harmless, and no ad link carries it.

## UI

### Section builder header (`components/admin/block-editor.tsx`)

```
← Back   Hero · Last saved 10:11      [Desktop Tablet Mobile]      ↶ ↷ ＋ ⇪  |  👁  💾  [Publish]
```

- **Back** replaces Discard. Same confirm when edits are unsaved, same restore.
  Escape still works.
- **💾 Save** writes drafts and stays open. Today Save closes the builder.
  ⌘S does the same. A failure shows beside the buttons, as today.
- **👁** saves if anything is dirty, then opens the preview at this section in
  a new tab.
- **Publish** saves if dirty, then publishes this section only. Disabled when
  the section has no draft and nothing unsaved.
- "Last saved" shows the time of the last successful save this session, or the
  row's `updated_at` on open.

### Page view bar (`components/admin/page-editor.tsx`)

```
Last saved 10:11 · 3 sections not published   Copy another page      [Desktop Tablet Mobile]   👁  💾  [Publish page]
```

- **💾** is today's "Save N changes" button, reworded as a draft save.
- **👁** saves if dirty, then opens the whole-page preview.
- **Publish page** saves if dirty, then publishes every draft on the page plus
  SEO and custom code. Disabled when nothing is unpublished. On success:
  "Published." For a product still in draft status: "Page published. The
  product itself is still a draft, so buyers can't see it yet."
- The section rail keeps its dirty dot for unsaved work and adds a small
  **Draft** tag for saved-but-unpublished work.
- Right-click on a section adds **Discard draft**, marked danger.
- The count of "not published" includes the SEO/code draft when there is one.

### SEO and custom code panels

Their Save buttons write drafts. A line under each says "Saved as a draft.
Publish the page to make it live."

### Leaving the editor

`beforeunload` still warns only for unsaved edits. Saved drafts sit in the
database and are there next time.

## Known limits

- Publish page publishes every draft on the page, including one a teammate
  saved. The presence note already shows who else is on a section.
- No version history or rollback past the live version.
- Global designs stay live-on-save (see Writes).

## Deploy order

1. Apply `0084` to production, then `notify pgrst, 'reload schema';`. Old code
   keeps working: it never reads `draft`, and its inserts default to published.
2. Deploy. From here Save stops going live.
3. Tell everyone who edits pages the day it ships, since Save changes meaning.

## Tests

Integration (`lib/page-drafts.integration.test.ts`, inside
`describe.skipIf(!canRun)`, `zz-` fixtures, `afterAll` cleanup):

- save leaves the live read unchanged, and the draft read shows the edit
- publish of one section moves only that section
- publish page moves every section plus settings
- a draft-only row is invisible to the live read and to `hasPageSections`
- discard draft restores live, and deletes a never-published row
- `copyPage` changes no live read
- `globalUsage` finds a global referenced only in a draft
- the publish function rolls back when one row fails

Unit:

- `isDraftPreview`: no param, param without admin or token, param with admin,
  param with token
- tracking components render nothing trackable with `preview=1`
- builder and page bar: Publish disabled with nothing to publish; eye saves
  before opening

Existing suites that assert save-goes-live (`lib/pages.integration.test.ts`,
`lib/section-conflict.integration.test.ts`, `lib/copy-page.integration.test.ts`)
are updated to publish where they expect a live read.
