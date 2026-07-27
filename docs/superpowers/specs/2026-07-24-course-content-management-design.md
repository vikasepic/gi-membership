# Course content management — design

**Date:** 2026-07-24
**Status:** approved (pending spec review)
**Context:** gi-membership (Greater Inside store), phases 0–5 live at grow.greaterinside.com

## Problem

The store sells products but cannot author their contents. `products` holds one
file or one embed URL; a `lessons` table exists in the schema with no admin UI,
no way to create rows, and no student navigation. Cover images are a URL text
field with no upload. Per-lesson progress is modelled but unused — completion is
one flag on the whole product.

Result: a "course" is one file plus a read-only list. Ajit cannot load a course,
add chapters, upload a cover, or attach a worksheet without direct DB access.

## Goals

- Author a full course in admin: chapters, lessons, video, rich text, images, downloads
- A chapter may hold its own content instead of child lessons
- Per-course vocabulary ("Chapter"/"Lesson" → "Module"/"Session")
- Students navigate a curriculum with per-item progress
- Paid assets stay private and ownership-gated

## Non-goals (each is its own future project)

Drip/scheduled release · free preview lessons · quizzes · comments/discussion ·
certificates · self-hosted video · video transcoding.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Structure | Course → Chapter → Lesson, **chapter may hold content** | Real courses need grouping; some chapters are a single piece of content |
| Data model | **One self-referencing tree** (`course_items.parent_id`) | Chapter-holds-content becomes free rather than duplicated |
| Video | **Embed only** (Vimeo/YouTube/Loom) | Shared KVM: 387GB disk, no CDN, live Content Engine on the same box |
| Body text | **WYSIWYG** (TipTap) | Non-technical owner; no syntax to learn |
| Reordering | **Up/down buttons** | Fraction of drag-and-drop code; works on mobile |
| Covers | **Public bucket** | Marketing imagery, shown on storefront, cacheable |
| Inline images + attachments | **Private bucket, gated route** | Honors "no paid asset on a public path" |

## Data model

### `course_items` (rename of the unused `lessons` table)

Postgres preserves foreign keys through `ALTER TABLE ... RENAME`, and the table
holds no rows, so the migration is cheap and non-destructive.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `store_id` | uuid → stores | tenancy |
| `product_id` | uuid → products | owning course |
| `parent_id` | uuid → course_items, null | **null = chapter**, set = lesson |
| `title` | text not null | |
| `subtitle` | text | |
| `body_html` | text | sanitized WYSIWYG output |
| `video_embed_url` | text | Vimeo/YouTube/Loom |
| `cover_path` | text | object in the public bucket |
| `attachments` | jsonb `[]` | `[{path, name, size, mime}]`, private bucket |
| `is_published` | boolean false | drafts are absent from student queries |
| `sort_order` | integer | position among siblings |
| `created_at`, `updated_at` | timestamptz | |

Constraints enforced in the DB, not only the UI:

- **Depth cap:** a trigger rejects an insert/update whose `parent_id` points at a
  row that itself has a `parent_id` — nesting can never exceed two levels.
- **Sibling ordering:** unique index on `(product_id, parent_id, sort_order)`,
  so two siblings cannot claim one position. Nulls-distinct handling means the
  chapter level (`parent_id is null`) uses a partial unique index.

Dropped from the old `lessons` shape: `media_mode`, `media_path`,
`media_embed_url` — superseded by `video_embed_url` + `attachments`. The table is
empty, so nothing is migrated. `products` keeps its own media columns unchanged;
existing non-course products continue to deliver through today's path.

### `products` — three additions

- `chapter_label` text default `'Chapter'`
- `lesson_label` text default `'Lesson'`
- `'course'` added to the `type` check constraint

### `progress` — start using `lesson_id`

Existing shape already supports per-item rows (`unique (store_id, user_id, lesson_id)`).
Two columns added:

- `completed_source` text — `'manual' | 'video' | 'download' | 'dwell'` (diagnostics)
- `manual_override` boolean default false — set when the student toggles the
  checkbox in either direction; auto-signals skip these rows forever after

Product-level progress is **derived** (`count(completed) / count(published items)`),
not stored. The existing product-level row (`lesson_id is null`) is no longer written.

## Storage

| Bucket | Visibility | Holds |
|---|---|---|
| `paid-assets` (existing) | private | attachments, inline lesson images |
| `public-media` (new) | public | covers/thumbnails |

Inline images are stored privately and their `src` is rewritten at render time to
`/api/asset/...`, which 302s to a short-lived signed URL after an ownership check.
Covers are public because they appear on the storefront to non-buyers.

**Upload validation is server-side:** MIME allowlist (`image/*` for covers;
pdf/audio/doc types for attachments) plus size caps. The client's declared
content-type is never trusted.

## Admin experience

### Product page — Curriculum section

Outline beneath the existing product form:

```
Curriculum                              [+ Add Chapter]
▸ 01  Foundations              3 lessons   ● Published  ↑ ↓  Edit
    01  Why this matters        video      ● Published  ↑ ↓  Edit
    02  The core loop           video      ○ Draft      ↑ ↓  Edit
▸ 02  Going deeper          content only   ● Published  ↑ ↓  Edit
                                           [+ Add Lesson]
```

A chapter without children displays its own content — no mode switch, because
chapters and lessons share one shape.

### Item editor — `/admin/products/[id]/curriculum/[itemId]`

One screen for chapters and lessons: title, subtitle, cover upload (with
thumbnail), video URL (with inline embed preview and a tracking-support note),
WYSIWYG body, attachments (upload/rename/remove), publish toggle, delete.

Vocabulary fields live on the product form and propagate to every admin and
student label.

**Deleting a chapter with children** requires confirmation stating how many
lessons and progress records will be destroyed.

## Student experience

### Course page — `/library/[slug]`

Curriculum outline with a progress bar (`3 of 12 complete`), a **Continue**
button targeting the first incomplete published item, per-chapter counts, and
completion checkmarks. Labels use the course's vocabulary. Unpublished items are
absent from the query, not greyed out.

Chapter click behaviour depends on whether it has children:

- **Chapter with lessons** — expands/collapses its lesson list in place; it is a
  container and has no page of its own.
- **Chapter with no lessons** — links straight to its own item page, since it is
  the content.

### Item page — `/library/[slug]/[itemId]`

Responsive 16:9 video embed → formatted body → attachments. Manual complete /
un-complete toggle. Previous/Next navigation that crosses chapter boundaries so
the course reads as one continuous path. A chapter holding content opens exactly
like a lesson. Ownership gate unchanged: no ownership → redirect.

## Auto-completion

An item completes when **any** signal fires first:

| Signal | Rule | Availability |
|---|---|---|
| Video | playback passes **50%** of duration | YouTube (IFrame API) + Vimeo (Player.js) only |
| Download | student clicks any attachment | always |
| Dwell | **5 minutes** on the page | always |

Rules:

- **Dwell counts visible time only** — the timer pauses when the tab is hidden,
  so an abandoned open tab cannot complete a course.
- **Unsupported providers** (Loom, Wistia, generic iframes) expose no cross-origin
  progress events. The video signal simply never fires and dwell carries the item.
  The admin video field states which case applies when a URL is pasted.
- **Students may un-complete** an item to use it as their own tracker.
- **Manual wins permanently:** any manual toggle sets `manual_override`, after
  which auto-signals never touch that item. Without this, un-completing would be
  reverted by the next dwell/video signal.
- All signals POST to one **idempotent** endpoint; repeat fires are no-ops.

## Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/curriculum.ts` | tree reads, ordering, reorder, depth guard | supabase, case |
| `lib/curriculum-admin.ts` | item CRUD, publish, delete cascade | curriculum |
| `lib/sanitize-html.ts` | strip scripts/handlers/iframes from body | — (pure) |
| `lib/progress.ts` | per-item completion, rollup, manual_override rules | supabase |
| `app/admin/products/[id]/curriculum/*` | outline + item editor | curriculum-admin |
| `components/editor/rich-text.tsx` | TipTap wrapper, image upload hook | sanitize (server) |
| `components/player/tracked-embed.tsx` | YT/Vimeo SDK, 50% signal | progress endpoint |
| `app/library/[slug]/[itemId]` | student item page | curriculum, progress |
| `app/api/progress/route.ts` | idempotent completion endpoint | progress |
| `app/api/media/*` | ownership-gated image/attachment delivery | library |

## Error handling

- Upload rejected (type/size) → inline field error, nothing written
- Storage failure mid-upload → no DB row; orphaned objects swept by the existing backup/cleanup path
- Reorder conflict (two admins) → unique constraint error surfaced as "position taken, retry"
- Unsupported video URL → saved and playable, tracking note shown; never blocks publish
- Progress POST failure → silently retried once, then ignored; never blocks playback or shows an error to a student
- Missing/deleted attachment → 404 from the gated route, item still renders

## Testing

Written test-first, per the money-path convention already in this repo:

**Pure logic (unit)**
- Depth cap rejects a three-level insert
- Reorder moves an item and renumbers siblings without collisions
- Progress rollup: `4 of 12`, ignoring unpublished items
- `manual_override` blocks subsequent auto-signals in both directions
- Sanitizer strips `<script>`, `onerror=`, `<iframe>`; preserves headings/links/lists

**Security (integration, real DB)**
- Non-owner gets 403 on an attachment and on an inline image
- Draft items never appear in student curriculum or item queries
- Signed URLs expire

**Manual verification**
- Author a two-chapter course with video, body, cover, attachment; view it as a student on mobile and desktop, light and dark

## Migration

`0003_course_items.sql`:
1. `ALTER TABLE lessons RENAME TO course_items` (FKs follow automatically)
2. Add new columns; drop superseded `media_*` columns
3. Depth-cap trigger + sibling unique indexes
4. `products`: vocabulary columns + `'course'` in the type enum
5. `progress`: `completed_source`, `manual_override`
6. Create the `public-media` bucket
7. Grant `service_role` on the renamed table (0002 pattern)

No data migration: `course_items` is empty in every environment.

## Rollout

Ship behind no flag — the Curriculum section is additive and empty for existing
products, which continue to work through their current single-media path.
