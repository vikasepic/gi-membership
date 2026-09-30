# Post-purchase Email Sequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every offer and product can carry a sequence of post-purchase emails (off by default), edited in a simple rich editor, sent after the store's welcome email with a delay between each.

**Architecture:** Three new tables keyed by owner (`post_purchase_sequences`, `post_purchase_emails`, `post_purchase_sends`). Admins edit a TipTap document per email; a pure renderer turns it into email-safe HTML at send time. The welcome email's "checkout is over" moment queues email 1 of each eligible order line, and the existing 5-minute retry cron sends due rows, checks the stop rules, and queues the next email.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + PostgREST via supabase-js), TipTap 3.29, zod 4, Resend (via `lib/email.ts`), vitest (+ jsdom), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md` (read it first). Prototype: https://claude.ai/artifact/Q8SD7xTjKrdU3U3Q1ut96s

## Global Constraints

- Migration number is `0091`; migrations do not run on deploy. Apply by hand to production before the image that reads them, then `notify pgrst, 'reload schema';` (AGENTS.md).
- Nothing is pushed to `main` until the owner says so; then the 60-second deploy notice (`POST /api/deploy-notice`, bearer `CRON_SECRET`), wait 60 s, push (AGENTS.md).
- Run the FULL suite before any push and gate on the runner's exit status (`set -o pipefail`).
- Every sequence is `enabled = false` until an admin turns it on.
- In addition to the welcome email, never instead of it. Email 1 goes about one minute after the checkout is over; each later email waits `delay_amount` `delay_unit` (hours or days) after the previous one was sent.
- Stop rules, checked before every send: order `refunded`; buyer no longer holds the item (no ownership in `active`, `trialing`, `past_due`); `order_items.post_purchase_stopped_at` set; sequence switched off.
- Only store purchases start a sequence: order lines of kind `product`, `oto`, `bump`. Never `renewal`.
- Fonts: only the eight email-safe fonts in `EMAIL_FONTS` (Task 2).
- Links, buttons and images: absolute `https:` URLs only, or the literal `{{access_link}}`.
- Layout defaults: desktop 600 px, mobile 100 %, desktop padding 32 px, mobile padding 20 px, Arial 16 px, line height 1.6, text #1a1a1a, links and buttons #c8653d, body #ffffff, background #f1efe9.
- New TipTap packages at exactly the installed version: `3.29.0`.
- Integration suites: `describe.skipIf(!canRun)`, fixtures prefixed `zz-` with a timestamp, cleanup in `afterAll` in foreign-key order, every one-row query ordered (AGENTS.md).
- New tables get RLS on and privileges revoked from `anon, authenticated` (Supabase grants them by default; see memory `anon-key-had-full-table-access`).
- User-facing copy: no em dashes, plain words (owner's writing rules).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An image pasted into the editor arrives as a `data:` URI, or a link is `http://`.** A person expects Save to say which email and why, not for the image or link to vanish from the sent email. Pinned in Task 6 (`saveProblem` refuses both).
2. **A buyer with no name on file.** A person expects "Hi, you're in." and a subject "Your Funnel App is ready", never "Hi , you're in." or ", your Funnel App is ready". Pinned in Task 2 (`fillLine`) and Task 3 (renderer).
3. **The owner deletes or reorders emails while buyers are mid-sequence.** A person expects each buyer to get the next email that still exists, once, and never a repeat. Pinned in Task 7.
4. **The buyer clicks "Stop these emails" twice, or after the sequence finished.** A person expects the same friendly confirmation each time, not an error. Pinned in Task 5.
5. **The store's welcome email is switched off.** A person expects their offer's sequence to still go out. Pinned in Task 8.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0091_post_purchase_sequences.sql` | Three tables, stop column, RLS, grants |
| `lib/post-purchase-layout.ts` | Pure, client-safe: layout schema and defaults, fonts, merge tags, delays, doc types, starter doc, URL checks |
| `lib/post-purchase-render.ts` | Pure, client-safe: TipTap JSON + layout + vars → `{ subject, html, text }` |
| `lib/email.ts` (modify) | `sendEmail` accepts headers and reports `"sent" \| "failed" \| "disabled"` |
| `lib/post-purchase-stop.ts` | Server: signed stop token, stop URL, mark a line stopped |
| `app/email/stop/route.ts` | Public GET/POST stop link |
| `lib/post-purchase-store.ts` | Server: load and save a sequence, save validation |
| `lib/post-purchase-sequences.ts` | Server: queue at checkout over, send due rows |
| `lib/post-purchase-send.ts` (modify) | Queue sequences once the checkout is over, before the welcome's own switch |
| `app/api/cron/retry/route.ts` (modify) | Send due sequence emails every 5 minutes |
| `lib/email-editor-extensions.ts` | Client-safe TipTap extension list with MergeTag, EmailButton, EmailImage |
| `components/admin/email-editor.tsx` | Client: toolbar + canvas editor for one email |
| `components/admin/post-purchase-section.tsx` | Client: the admin section (switch, sequence strip, fields, layout, preview, save, test) |
| `app/admin/post-purchase/actions.ts` | Server actions: save, send test |
| `app/admin/offers/[id]/page.tsx`, `app/admin/products/[id]/page.tsx` (modify) | Mount the section |
| `app/globals.css` (modify) | Editor canvas styles |
| `docs/DATABASE.md`, `docs/errors-and-retries.md`, `docs/lessons.md` (modify) | Documentation |

---

### Task 1: Migration 0091

**Files:**
- Create: `supabase/migrations/0091_post_purchase_sequences.sql`
- Modify: `docs/DATABASE.md` (append before `## Appendix: the raw DDL`)
- Test: `lib/post-purchase-schema.integration.test.ts`

**Interfaces:**
- Produces: tables `post_purchase_sequences`, `post_purchase_emails`, `post_purchase_sends`; column `order_items.post_purchase_stopped_at`.

- [ ] **Step 1: Write the failing integration test**

```ts
// lib/post-purchase-schema.integration.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const owners: string[] = [];

/**
 * The CHECK constraints are invisible to tsc and vitest's unit tests
 * (AGENTS.md). This saves real rows so a constraint that refuses a legal
 * value, or allows an illegal one, fails here and not on the owner's Save.
 */
describe.skipIf(!canRun)("post-purchase tables (integration)", () => {
  async function sequence() {
    const db = createServiceClient();
    const owner = crypto.randomUUID();
    owners.push(owner);
    const { data, error } = await db
      .from("post_purchase_sequences")
      .insert({ store_id: await getStoreId(), owner_type: "offer", owner_id: owner })
      .select("id, enabled")
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string; enabled: boolean };
  }

  it("a new sequence is off", async () => {
    expect((await sequence()).enabled).toBe(false);
  });

  it("one sequence per owner", async () => {
    const db = createServiceClient();
    const owner = crypto.randomUUID();
    owners.push(owner);
    const row = { store_id: await getStoreId(), owner_type: "product", owner_id: owner };
    expect((await db.from("post_purchase_sequences").insert(row)).error).toBeNull();
    expect((await db.from("post_purchase_sequences").insert(row)).error?.code).toBe("23505");
  });

  it("accepts hours and days, and refuses anything else", async () => {
    const db = createServiceClient();
    const s = await sequence();
    const ok = await db.from("post_purchase_emails").insert({ sequence_id: s.id, position: 1, delay_amount: 2, delay_unit: "hours" });
    expect(ok.error).toBeNull();
    const bad = await db.from("post_purchase_emails").insert({ sequence_id: s.id, position: 2, delay_amount: 1, delay_unit: "weeks" });
    expect(bad.error?.code).toBe("23514");
  });

  it("refuses an owner type that is not offer or product", async () => {
    const db = createServiceClient();
    const r = await db.from("post_purchase_sequences").insert({ store_id: await getStoreId(), owner_type: "course", owner_id: crypto.randomUUID() });
    expect(r.error?.code).toBe("23514");
  });

  it("lets positions swap inside one statement (the unique check is deferred)", async () => {
    const db = createServiceClient();
    const s = await sequence();
    const { data } = await db
      .from("post_purchase_emails")
      .insert([
        { sequence_id: s.id, position: 1 },
        { sequence_id: s.id, position: 2 },
      ])
      .select("id, position")
      .order("position");
    const [a, b] = data as { id: string; position: number }[];
    const swap = await db.from("post_purchase_emails").upsert([
      { id: a.id, sequence_id: s.id, position: 2 },
      { id: b.id, sequence_id: s.id, position: 1 },
    ]);
    expect(swap.error).toBeNull();
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  // Emails and sends go with their sequence (on delete cascade).
  for (const o of owners) await db.from("post_purchase_sequences").delete().eq("owner_id", o);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/post-purchase-schema.integration.test.ts`
Expected: FAIL with `relation "post_purchase_sequences" does not exist` (or PostgREST `PGRST205`).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0091_post_purchase_sequences.sql
--
-- Post-purchase email sequences, per offer and per product.
-- Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
--
-- Sent in addition to the store's welcome email. Off until an admin turns a
-- sequence on. Email 1 goes a minute after the checkout is over; each later
-- email waits its delay after the one before it was sent.

create table if not exists post_purchase_sequences (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  owner_type  text not null check (owner_type in ('offer', 'product')),
  owner_id    uuid not null,
  enabled     boolean not null default false,
  layout      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (store_id, owner_type, owner_id)
);

create table if not exists post_purchase_emails (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references post_purchase_sequences(id) on delete cascade,
  position     integer not null check (position >= 1),
  delay_amount integer not null default 0 check (delay_amount >= 0 and delay_amount <= 365),
  delay_unit   text not null default 'days' check (delay_unit in ('hours', 'days')),
  subject      text not null default '' check (char_length(subject) <= 200),
  preheader    text not null default '' check (char_length(preheader) <= 200),
  doc          jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  -- Deferred so a save can renumber every email in one statement.
  constraint post_purchase_emails_position_key unique (sequence_id, position) deferrable initially deferred
);

create table if not exists post_purchase_sends (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  order_item_id  uuid not null references order_items(id) on delete cascade,
  sequence_id    uuid not null references post_purchase_sequences(id) on delete cascade,
  email_id       uuid references post_purchase_emails(id) on delete set null,
  position       integer not null,  -- the step: 1st, 2nd, 3rd email this line gets
  to_email       text not null,
  due_at         timestamptz not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  reason         text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  -- Queueing the same step twice inserts nothing.
  unique (order_item_id, sequence_id, position)
);

create index if not exists post_purchase_sends_due_idx
  on post_purchase_sends (due_at) where status = 'pending';

alter table order_items add column if not exists post_purchase_stopped_at timestamptz;

-- Service role only. Supabase grants new tables to anon and authenticated by
-- default; 0067 revoked what existed then, not what is created after.
alter table post_purchase_sequences enable row level security;
alter table post_purchase_emails    enable row level security;
alter table post_purchase_sends     enable row level security;
revoke all on post_purchase_sequences, post_purchase_emails, post_purchase_sends from anon, authenticated;
```

- [ ] **Step 4: Apply it locally and rerun the test**

Run:
```bash
docker exec -i supabase_db_grow_membership psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/0091_post_purchase_sequences.sql
docker exec -i supabase_db_grow_membership psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
npx vitest run lib/post-purchase-schema.integration.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Document the tables**

Append to `docs/DATABASE.md`, immediately before `---\n\n## Appendix: the raw DDL`:

```markdown
### `post_purchase_sequences`, `post_purchase_emails`, `post_purchase_sends`

Post-purchase email sequences, per offer and product (migration 0091, spec
`docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md`).
Sent in addition to the welcome email. A sequence (one per owner, off by
default) holds the layout; its emails hold position, delay (hours or days
after the previous email), subject, preview text and the TipTap document.
A send row is one email for one order line: `pending` until the 5-minute
retry cron sends it, then `sent`, `skipped` (with `reason`) or `failed`.
Queueing is idempotent on `(order_item_id, sequence_id, position)`.
`order_items.post_purchase_stopped_at` is set by the "Stop these emails" link.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0091_post_purchase_sequences.sql lib/post-purchase-schema.integration.test.ts docs/DATABASE.md
git commit -m "Tables for post-purchase email sequences (0091)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Layout, merge tags and document model

**Files:**
- Create: `lib/post-purchase-layout.ts`
- Test: `lib/post-purchase-layout.test.ts`

**Interfaces:**
- Produces (all exported, client-safe, no `server-only`):
  - `EMAIL_FONTS: readonly { label: string; value: string }[]`, `FONT_SIZES: readonly number[]`
  - `layoutSchema` (zod), `type EmailLayout`, `LAYOUT_DEFAULTS: EmailLayout`, `parseLayout(v: unknown): EmailLayout`
  - `MERGE_KEYS`, `type MergeKey`, `type MergeVars = Partial<Record<MergeKey, string>>`, `MERGE_LABELS: Record<MergeKey, string>`
  - `fillTags(s: string, vars: MergeVars): string`, `fillLine(s: string, vars: MergeVars): string`
  - `DELAY_UNITS`, `type DelayUnit`, `delayMs(amount: number, unit: DelayUnit): number`
  - `type DocMark`, `type DocNode`, `docSchema` (zod), `starterDoc(name: string): DocNode`
  - `docUrls(doc: DocNode): string[]`, `urlProblem(u: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// lib/post-purchase-layout.test.ts
import { describe, it, expect } from "vitest";
import {
  LAYOUT_DEFAULTS, parseLayout, fillTags, fillLine, delayMs, starterDoc, docUrls, urlProblem, EMAIL_FONTS,
} from "@/lib/post-purchase-layout";

describe("layout", () => {
  it("defaults are the ones the owner approved in the prototype", () => {
    expect(LAYOUT_DEFAULTS).toEqual({
      desktopWidth: 600, mobileWidthPct: 100, desktopPadding: 32, mobilePadding: 20,
      fontFamily: "Arial, Helvetica, sans-serif", fontSize: 16, lineHeight: 1.6,
      textColor: "#1a1a1a", linkColor: "#c8653d", bodyColor: "#ffffff", backgroundColor: "#f1efe9",
    });
  });

  it("a stored layout that no longer parses falls back to the defaults, whole", () => {
    expect(parseLayout({ desktopWidth: 5000 })).toEqual(LAYOUT_DEFAULTS);
    expect(parseLayout(null)).toEqual(LAYOUT_DEFAULTS);
  });

  it("keeps a valid partial layout and fills the rest", () => {
    expect(parseLayout({ desktopWidth: 640 }).desktopWidth).toBe(640);
    expect(parseLayout({ desktopWidth: 640 }).mobilePadding).toBe(20);
  });

  it("offers only the eight email-safe fonts", () => {
    expect(EMAIL_FONTS.map((f) => f.label)).toEqual([
      "Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Courier New",
    ]);
  });
});

describe("personal details", () => {
  const vars = { first_name: "Priya", offer_name: "Funnel App", access_link: "https://grow.greaterinside.com/login" };

  it("fills known tags and drops unknown ones", () => {
    expect(fillTags("Hi {{ first_name }} {{nope}}", vars)).toBe("Hi Priya ");
  });

  it("a subject with no name reads as a sentence, not ', your ...'", () => {
    expect(fillLine("{{first_name}}, your Funnel App is ready", {})).toBe("Your Funnel App is ready");
    expect(fillLine("Hi {{first_name}}, welcome", {})).toBe("Hi, welcome");
    expect(fillLine("{{first_name}}, your Funnel App is ready", vars)).toBe("Priya, your Funnel App is ready");
  });
});

describe("delays", () => {
  it("counts hours and days", () => {
    expect(delayMs(2, "hours")).toBe(7_200_000);
    expect(delayMs(3, "days")).toBe(259_200_000);
    expect(delayMs(-1, "days")).toBe(0);
  });
});

describe("addresses in a document", () => {
  it("finds link, button and image addresses", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://a.com" } }] }] },
        { type: "emailButton", attrs: { href: "{{access_link}}" } },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA", href: "http://b.com" } },
      ],
    };
    expect(docUrls(doc).sort()).toEqual(["data:image/png;base64,AAAA", "http://b.com", "https://a.com", "{{access_link}}"]);
  });

  it("accepts https and the access link, refuses everything else with a reason", () => {
    expect(urlProblem("https://a.com/x")).toBeNull();
    expect(urlProblem("{{access_link}}")).toBeNull();
    expect(urlProblem("http://a.com")).toMatch(/https/);
    expect(urlProblem("data:image/png;base64,AAAA")).toMatch(/upload/);
    expect(urlProblem("not a link")).toMatch(/not a web address/);
  });

  it("the starter email has a first-name tag and an access-link button", () => {
    const d = starterDoc("Funnel App");
    expect(JSON.stringify(d)).toContain('"mergeTag"');
    expect(docUrls(d)).toEqual(["{{access_link}}"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/post-purchase-layout.test.ts`
Expected: FAIL, `Cannot find module '@/lib/post-purchase-layout'`.

- [ ] **Step 3: Implement**

```ts
// lib/post-purchase-layout.ts
import { z } from "zod";

/**
 * The shape of a post-purchase email, shared by the editor, the renderer and
 * the save. Pure and client-safe: the admin preview renders with it too.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 */

/**
 * Only fonts every inbox already has. Gmail and Outlook drop web fonts, so a
 * face offered here that is not installed on the reader's machine is a face
 * the owner sees and the buyer never does.
 */
export const EMAIL_FONTS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
] as const;
const FONT_VALUES = EMAIL_FONTS.map((f) => f.value) as [string, ...string[]];
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const layoutSchema = z.object({
  desktopWidth: z.number().int().min(320).max(900).default(600),
  mobileWidthPct: z.number().int().min(60).max(100).default(100),
  desktopPadding: z.number().int().min(0).max(64).default(32),
  mobilePadding: z.number().int().min(0).max(48).default(20),
  fontFamily: z.enum(FONT_VALUES).default("Arial, Helvetica, sans-serif"),
  fontSize: z.number().int().min(12).max(22).default(16),
  lineHeight: z.number().min(1.2).max(2).default(1.6),
  textColor: hex.default("#1a1a1a"),
  linkColor: hex.default("#c8653d"),
  bodyColor: hex.default("#ffffff"),
  backgroundColor: hex.default("#f1efe9"),
});
export type EmailLayout = z.infer<typeof layoutSchema>;
export const LAYOUT_DEFAULTS: EmailLayout = layoutSchema.parse({});

/** A stored layout that no longer parses is replaced whole, never half-applied. */
export function parseLayout(v: unknown): EmailLayout {
  const r = layoutSchema.safeParse(v ?? {});
  return r.success ? r.data : LAYOUT_DEFAULTS;
}

export const MERGE_KEYS = ["first_name", "offer_name", "access_link"] as const;
export type MergeKey = (typeof MERGE_KEYS)[number];
export type MergeVars = Partial<Record<MergeKey, string>>;
export const MERGE_LABELS: Record<MergeKey, string> = {
  first_name: "First name",
  offer_name: "What they bought",
  access_link: "Access link",
};

const isKey = (k: string): k is MergeKey => (MERGE_KEYS as readonly string[]).includes(k);

export function fillTags(s: string, vars: MergeVars): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (isKey(k) ? (vars[k] ?? "") : ""));
}

/**
 * A subject or preview line, filled and tidied. A buyer with no name on file
 * must not get ", your Funnel App is ready".
 */
export function fillLine(s: string, vars: MergeVars): string {
  const out = fillTags(s, vars)
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/^[\s,.!?;:]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export const DELAY_UNITS = ["hours", "days"] as const;
export type DelayUnit = (typeof DELAY_UNITS)[number];
export function delayMs(amount: number, unit: DelayUnit): number {
  return Math.max(0, amount) * (unit === "hours" ? 3_600_000 : 86_400_000);
}

/** TipTap's JSON, as much of it as the renderer reads. */
export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
};
/** Shallow on purpose: the renderer ignores what it does not know, and escapes all text. */
export const docSchema = z.custom<DocNode>(
  (v) => !!v && typeof v === "object" && (v as DocNode).type === "doc" && Array.isArray((v as DocNode).content) && (v as DocNode).content!.length <= 500,
  { message: "not an email document" },
);

/** What a new email starts as, so turning a sequence on never shows a blank page. */
export function starterDoc(name: string): DocNode {
  const t = (text: string, marks?: DocMark[]): DocNode => ({ type: "text", text, ...(marks ? { marks } : {}) });
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1, textAlign: null }, content: [t("Hi "), { type: "mergeTag", attrs: { key: "first_name" } }, t(", you're in.")] },
      { type: "paragraph", attrs: { textAlign: null }, content: [t("Thank you for getting "), t(name, [{ type: "bold" }]), t(". Everything is ready in your library.")] },
      { type: "emailButton", attrs: { label: "Open your library", href: "{{access_link}}", color: "#c8653d", align: "left" } },
      { type: "paragraph", attrs: { textAlign: null }, content: [t("In love and service,"), { type: "hardBreak" }, t("Ajit")] },
    ],
  };
}

/** Every link, button and image address in a document. */
export function docUrls(doc: DocNode): string[] {
  const out: string[] = [];
  const walk = (n: DocNode) => {
    for (const m of n.marks ?? []) if (m.type === "link" && typeof m.attrs?.href === "string") out.push(m.attrs.href);
    if (n.type === "emailButton" && typeof n.attrs?.href === "string") out.push(n.attrs.href);
    if (n.type === "image") {
      if (typeof n.attrs?.src === "string") out.push(n.attrs.src);
      if (typeof n.attrs?.href === "string" && n.attrs.href) out.push(n.attrs.href);
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc);
  return out;
}

/** Why an address cannot go in an email, in words the owner can act on. */
export function urlProblem(u: string): string | null {
  const t = u.trim();
  if (t === "{{access_link}}") return null;
  if (t.startsWith("data:")) return "an image was pasted in; upload it with the image button instead";
  try {
    return new URL(t).protocol === "https:" ? null : `${t} must start with https://`;
  } catch {
    return `${t} is not a web address`;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/post-purchase-layout.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/post-purchase-layout.ts lib/post-purchase-layout.test.ts
git commit -m "Post-purchase email layout, merge tags and document model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Renderer

**Files:**
- Create: `lib/post-purchase-render.ts`
- Test: `lib/post-purchase-render.test.ts`

**Interfaces:**
- Consumes (Task 2): `parseLayout`, `fillTags`, `fillLine`, `MergeVars`, `DocNode`, `DocMark`, `EMAIL_FONTS`, `EmailLayout`.
- Produces: `renderPostPurchaseEmail(args: { doc: unknown; subject: string; preheader: string; layout: unknown; vars: MergeVars; stopUrl: string | null }): { subject: string; html: string; text: string }`

- [ ] **Step 1: Write the failing test**

```ts
// lib/post-purchase-render.test.ts
import { describe, it, expect } from "vitest";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { starterDoc } from "@/lib/post-purchase-layout";

const vars = { first_name: "Priya", offer_name: "Funnel App", access_link: "https://grow.greaterinside.com/login" };
const render = (over: Partial<Parameters<typeof renderPostPurchaseEmail>[0]> = {}) =>
  renderPostPurchaseEmail({ doc: starterDoc("Funnel App"), subject: "{{first_name}}, you're in", preheader: "Start here", layout: {}, vars, stopUrl: null, ...over });

describe("the email a buyer receives", () => {
  it("fills the subject and the body's personal details", () => {
    const m = render();
    expect(m.subject).toBe("Priya, you're in");
    expect(m.html).toContain("Hi Priya, you're in.");
    expect(m.html).toContain('href="https://grow.greaterinside.com/login"');
  });

  it("a buyer with no name gets 'Hi, you're in.', never 'Hi , you're in.'", () => {
    const m = render({ vars: { ...vars, first_name: "" } });
    expect(m.html).toContain("Hi, you're in.");
    expect(m.html).not.toContain("Hi , ");
    expect(m.subject).toBe("You're in");
  });

  it("uses the desktop width in the body table and the mobile width in the media rule", () => {
    const m = render({ layout: { desktopWidth: 640, mobileWidthPct: 90, mobilePadding: 12 } });
    expect(m.html).toContain("max-width:640px");
    expect(m.html).toMatch(/@media only screen and \(max-width:\s*672px\)/);
    expect(m.html).toContain("width:90% !important");
    expect(m.html).toContain("padding:12px !important");
  });

  it("carries the preview text as the hidden first line", () => {
    expect(render().html).toMatch(/<span style="display:none[^"]*">Start here<\/span>/);
  });

  it("draws a button as a table, so Outlook keeps it", () => {
    expect(render().html).toMatch(/<table role="presentation"[^>]*>\s*<tr>\s*<td style="border-radius:6px;background:#c8653d;">\s*<a href="https:\/\/grow\.greaterinside\.com\/login"/);
  });

  it("escapes what the owner typed", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<script>x</script> & co" }] }] };
    const m = render({ doc });
    expect(m.html).toContain("&lt;script&gt;x&lt;/script&gt; &amp; co");
  });

  it("drops a link or image that is not https rather than sending it", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "x" } },
      ],
    };
    const m = render({ doc });
    expect(m.html).not.toContain("javascript:");
    expect(m.html).not.toContain("data:image");
    expect(m.html).toContain("click");
  });

  it("applies font, size and colour from the text style, and only email-safe fonts", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "text", text: "styled", marks: [{ type: "textStyle", attrs: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "20px", color: "#112233" } }] },
        { type: "text", text: "sneaky", marks: [{ type: "textStyle", attrs: { fontFamily: "Comic Sans MS", fontSize: "400px", color: "red;background:url(x)" } }] },
      ] }],
    };
    const m = render({ doc });
    expect(m.html).toContain(`<span style="font-family:Georgia, 'Times New Roman', serif;font-size:20px;color:#112233;">styled</span>`);
    expect(m.html).toContain(">sneaky<");
    expect(m.html).not.toContain("Comic Sans");
    expect(m.html).not.toContain("400px");
    expect(m.html).not.toContain("url(x)");
  });

  it("puts the stop link and footer on follow-ups only", () => {
    expect(render().html).not.toContain("Stop these emails");
    const f = render({ stopUrl: "https://grow.greaterinside.com/email/stop?t=abc" });
    expect(f.html).toContain('href="https://grow.greaterinside.com/email/stop?t=abc"');
    expect(f.html).toContain("You are getting this because you bought Funnel App.");
    expect(f.text).toContain("Stop these emails: https://grow.greaterinside.com/email/stop?t=abc");
  });

  it("gives a plain-text part with the links written out", () => {
    const t = render().text;
    expect(t).toContain("Hi Priya, you're in.");
    expect(t).toContain("Open your library: https://grow.greaterinside.com/login");
    expect(t).not.toContain("<");
  });

  it("renders headings, lists, a divider and alignment", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [{ type: "text", text: "Steps" }] },
        { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] }] },
        { type: "horizontalRule" },
      ],
    };
    const h = render({ doc }).html;
    expect(h).toMatch(/<h2 style="[^"]*text-align:center;[^"]*">Steps<\/h2>/);
    expect(h).toMatch(/<ol[^>]*><li[^>]*>One<\/li><\/ol>/);
    expect(h).toContain("<hr ");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/post-purchase-render.test.ts`
Expected: FAIL, `Cannot find module '@/lib/post-purchase-render'`.

- [ ] **Step 3: Implement**

```ts
// lib/post-purchase-render.ts
import {
  EMAIL_FONTS, fillLine, parseLayout, type DocMark, type DocNode, type EmailLayout, type MergeVars,
} from "@/lib/post-purchase-layout";

/**
 * A post-purchase email, from the editor's document to what an inbox shows.
 *
 * Pure: no database, no network. The admin preview calls it in the browser
 * and the send calls it on the server, so what the owner approves is what the
 * buyer gets. Tables and inline styles throughout, the same way
 * lib/post-purchase-email.ts builds the welcome, because Outlook renders
 * neither flexbox nor much of a <style> block.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

/** Every attribute below is double-quoted, so an apostrophe can stay one ("you're", 'Times New Roman'). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT_VALUES = new Set<string>(EMAIL_FONTS.map((f) => f.value));
const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;
const SIZE = /^(1[0-9]|[2-3][0-9]|4[0-8])px$/;

/** An https address, the access link filled in; null for anything else. */
function safeUrl(raw: unknown, vars: MergeVars): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  const filled = t === "{{access_link}}" ? (vars.access_link ?? "") : t;
  try {
    const u = new URL(filled);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function styleOf(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return "";
  const out: string[] = [];
  if (typeof attrs.fontFamily === "string" && FONT_VALUES.has(attrs.fontFamily)) out.push(`font-family:${attrs.fontFamily}`);
  if (typeof attrs.fontSize === "string" && SIZE.test(attrs.fontSize)) out.push(`font-size:${attrs.fontSize}`);
  if (typeof attrs.color === "string" && COLOUR.test(attrs.color)) out.push(`color:${attrs.color}`);
  if (typeof attrs.backgroundColor === "string" && COLOUR.test(attrs.backgroundColor)) out.push(`background-color:${attrs.backgroundColor}`);
  return out.length ? `${out.join(";")};` : "";
}

const align = (n: DocNode) => {
  const a = n.attrs?.textAlign;
  return a === "center" || a === "right" || a === "left" ? `text-align:${a};` : "";
};

function renderText(n: DocNode, vars: MergeVars, layout: EmailLayout): string {
  let out = esc(n.text ?? "");
  // The link goes on last, outermost, so a bold word inside a link stays linked.
  const marks = [...(n.marks ?? [])].sort((a, b) => Number(a.type === "link") - Number(b.type === "link"));
  for (const m of marks as DocMark[]) {
    if (m.type === "bold") out = `<strong>${out}</strong>`;
    else if (m.type === "italic") out = `<em>${out}</em>`;
    else if (m.type === "underline") out = `<u>${out}</u>`;
    else if (m.type === "strike") out = `<s>${out}</s>`;
    else if (m.type === "textStyle") {
      const st = styleOf(m.attrs);
      if (st) out = `<span style="${esc(st)}">${out}</span>`;
    } else if (m.type === "link") {
      const href = safeUrl(m.attrs?.href, vars);
      if (href) out = `<a href="${esc(href)}" target="_blank" style="color:${layout.linkColor};text-decoration:underline;">${out}</a>`;
    }
  }
  return out;
}

/** Inline content. A missing name leaves no stray space before the comma. */
function renderInline(nodes: DocNode[] | undefined, vars: MergeVars, layout: EmailLayout): string {
  let out = "";
  let droppedTag = false;
  for (const n of nodes ?? []) {
    if (n.type === "mergeTag") {
      const key = String(n.attrs?.key ?? "") as keyof MergeVars;
      const v = vars[key] ?? "";
      if (!v) {
        droppedTag = true;
        continue;
      }
      out += esc(v);
      droppedTag = false;
      continue;
    }
    if (n.type === "text") {
      if (droppedTag && /^[,.!?;:]/.test(n.text ?? "")) out = out.replace(/\s+$/, "");
      out += renderText(n, vars, layout);
    } else if (n.type === "hardBreak") {
      out += "<br>";
    }
    droppedTag = false;
  }
  return out;
}

const HEADING = { 1: [26, 1.25], 2: [20, 1.3], 3: [17, 1.35] } as const;

function renderBlock(n: DocNode, vars: MergeVars, layout: EmailLayout): string {
  switch (n.type) {
    case "paragraph": {
      const inner = renderInline(n.content, vars, layout);
      return `<p style="margin:0 0 14px;${align(n)}">${inner || "&nbsp;"}</p>`;
    }
    case "heading": {
      const level = ([1, 2, 3] as const).includes(Number(n.attrs?.level) as 1) ? (Number(n.attrs?.level) as 1 | 2 | 3) : 2;
      const [size, lh] = HEADING[level];
      return `<h${level} style="margin:0 0 14px;font-size:${size}px;line-height:${lh};font-weight:700;${align(n)}">${renderInline(n.content, vars, layout)}</h${level}>`;
    }
    case "bulletList":
    case "orderedList": {
      const tag = n.type === "bulletList" ? "ul" : "ol";
      const items = (n.content ?? [])
        .map((li) => `<li style="margin:0 0 6px;">${(li.content ?? []).map((c) => (c.type === "paragraph" ? renderInline(c.content, vars, layout) : renderBlock(c, vars, layout))).join("<br>")}</li>`)
        .join("");
      return `<${tag} style="margin:0 0 14px;padding-left:22px;">${items}</${tag}>`;
    }
    case "blockquote":
      return `<blockquote style="margin:0 0 14px;padding-left:14px;border-left:3px solid #e4e1d9;">${(n.content ?? []).map((c) => renderBlock(c, vars, layout)).join("")}</blockquote>`;
    case "horizontalRule":
      return `<hr style="border:0;border-top:1px solid #e4e1d9;margin:22px 0;">`;
    case "image": {
      const src = safeUrl(n.attrs?.src, vars);
      if (!src) return "";
      const pct = Math.min(100, Math.max(10, Number(n.attrs?.widthPct) || 100));
      const img = `<img src="${esc(src)}" alt="${esc(String(n.attrs?.alt ?? ""))}" width="${Math.round((layout.desktopWidth * pct) / 100)}" style="display:block;width:${pct}%;max-width:100%;height:auto;border:0;border-radius:6px;">`;
      const href = safeUrl(n.attrs?.href, vars);
      return `<div style="margin:0 0 14px;">${href ? `<a href="${esc(href)}" target="_blank">${img}</a>` : img}</div>`;
    }
    case "emailButton": {
      const href = safeUrl(n.attrs?.href, vars);
      if (!href) return "";
      const colour = typeof n.attrs?.color === "string" && COLOUR.test(n.attrs.color) ? n.attrs.color : layout.linkColor;
      const center = n.attrs?.align === "center";
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${center ? ' align="center"' : ""} style="margin:22px ${center ? "auto" : "0"};">
<tr>
<td style="border-radius:6px;background:${colour};">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 24px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(String(n.attrs?.label ?? "Open"))}</a>
</td>
</tr>
</table>`;
    }
    default:
      return (n.content ?? []).map((c) => renderBlock(c, vars, layout)).join("");
  }
}

function plainInline(nodes: DocNode[] | undefined, vars: MergeVars): string {
  return renderInline(nodes, vars, parseLayout({}))
    .replace(/<br>/g, "\n")
    .replace(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/g, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function plainBlock(n: DocNode, vars: MergeVars): string {
  switch (n.type) {
    case "paragraph":
    case "heading":
      return plainInline(n.content, vars);
    case "bulletList":
    case "orderedList":
      return (n.content ?? [])
        .map((li, i) => `${n.type === "bulletList" ? "-" : `${i + 1}.`} ${(li.content ?? []).map((c) => plainInline(c.content, vars)).join(" ")}`)
        .join("\n");
    case "emailButton": {
      const href = safeUrl(n.attrs?.href, vars);
      return href ? `${String(n.attrs?.label ?? "Open")}: ${href}` : "";
    }
    case "image":
      return String(n.attrs?.alt ?? "");
    case "horizontalRule":
      return "";
    default:
      return (n.content ?? []).map((c) => plainBlock(c, vars)).join("\n\n");
  }
}

export function renderPostPurchaseEmail(args: {
  doc: unknown;
  subject: string;
  preheader: string;
  layout: unknown;
  vars: MergeVars;
  stopUrl: string | null;
}): RenderedEmail {
  const layout = parseLayout(args.layout);
  const doc = (args.doc && typeof args.doc === "object" ? args.doc : { type: "doc", content: [] }) as DocNode;
  const blocks = doc.content ?? [];
  const subject = fillLine(args.subject, args.vars);
  const preheader = fillLine(args.preheader, args.vars);
  const inner = blocks.map((b) => renderBlock(b, args.vars, layout)).join("\n");
  // Tied to the desktop width rather than the spec's fixed 600px, so a body
  // set wider than 600 still switches to the mobile rule once it cannot fit.
  const breakpoint = layout.desktopWidth + 32;
  const offer = esc(args.vars.offer_name ?? "this");
  const footer = args.stopUrl
    ? `<p style="margin:0;padding:14px 16px 0;font-family:${layout.fontFamily};font-size:12px;line-height:1.5;color:#6b6b72;text-align:center;">You are getting this because you bought ${offer}. <a href="${esc(args.stopUrl)}" style="color:#6b6b72;text-decoration:underline;">Stop these emails</a></p>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(subject)}</title>
<style>
@media only screen and (max-width: ${breakpoint}px) {
  .pp-body { width:${layout.mobileWidthPct}% !important; max-width:${layout.mobileWidthPct}% !important; }
  .pp-pad { padding:${layout.mobilePadding}px !important; }
  .pp-outer { padding:0 !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${layout.backgroundColor};">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${layout.backgroundColor};">
<tr><td class="pp-outer" align="center" style="padding:24px 0;">
<table role="presentation" class="pp-body" width="${layout.desktopWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${layout.desktopWidth}px;background:${layout.bodyColor};">
<tr><td class="pp-pad" style="padding:${layout.desktopPadding}px;font-family:${layout.fontFamily};font-size:${layout.fontSize}px;line-height:${layout.lineHeight};color:${layout.textColor};">
${inner}
</td></tr>
</table>
${footer}
</td></tr>
</table>
</body>
</html>`;

  const textBody = blocks.map((b) => plainBlock(b, args.vars)).filter((s) => s.trim()).join("\n\n");
  const text = args.stopUrl
    ? `${textBody}\n\nYou are getting this because you bought ${args.vars.offer_name ?? "this"}.\nStop these emails: ${args.stopUrl}`
    : textBody;

  return { subject, html, text };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/post-purchase-render.test.ts`
Expected: PASS, 11 tests. If the button regex fails only on whitespace, adjust the template's line breaks to match the test, not the test's intent.

- [ ] **Step 5: Commit**

```bash
git add lib/post-purchase-render.ts lib/post-purchase-render.test.ts
git commit -m "Render a post-purchase email from the editor's document

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `sendEmail` reports its result and carries headers

**Files:**
- Modify: `lib/email.ts:182-221` (`sendEmail`)
- Test: `lib/email-send-result.test.ts`

**Interfaces:**
- Produces: `export type SendResult = "sent" | "failed" | "disabled"`; `sendEmail(to, mail, over?: { from?: string; replyTo?: string; headers?: Record<string, string> }): Promise<SendResult>`. Existing callers ignore the result and keep working.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email-send-result.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail } from "@/lib/email";

const mail = { subject: "s", html: "<p>h</p>", text: "t" };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendEmail's answer", () => {
  it("is 'disabled' when no provider is configured, and nothing is sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await sendEmail("a@b.co", mail)).toBe("disabled");
    expect(f).not.toHaveBeenCalled();
  });

  it("is 'sent' on success and passes custom headers to the provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "Store <s@example.com>");
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const res = await sendEmail("a@b.co", mail, { headers: { "List-Unsubscribe": "<https://x.co/stop>" } });
    expect(res).toBe("sent");
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://x.co/stop>" });
  });

  it("is 'failed' when the provider refuses or cannot be reached", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "Store <s@example.com>");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    expect(await sendEmail("a@b.co", mail)).toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await sendEmail("a@b.co", mail)).toBe("failed");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/email-send-result.test.ts`
Expected: FAIL, `expected undefined to be 'disabled'`. (If `emailEnabled` needs more env than these two, read it and stub what it reads.)

- [ ] **Step 3: Implement**

In `lib/email.ts`, replace the `sendEmail` signature and body with:

```ts
/** What happened to one send. Callers that do not care may ignore it. */
export type SendResult = "sent" | "failed" | "disabled";

export async function sendEmail(
  to: string,
  mail: BuiltEmail,
  /**
   * Who it comes from, where the store has said.
   *
   * The transactional emails go from whatever RESEND_FROM is, which is right
   * for a receipt. The welcome is signed by a person and replies to it are
   * meant to reach that person, so it says so. Unset keeps the old behaviour
   * exactly — and an address on an unverified domain is refused by Resend
   * rather than sent from somewhere else, which is the failure worth having.
   *
   * `headers` is for List-Unsubscribe on post-purchase follow-ups.
   */
  over?: { from?: string; replyTo?: string; headers?: Record<string, string> },
): Promise<SendResult> {
  const env: EmailEnv = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
  };
  if (!emailEnabled(env)) return "disabled";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: over?.from?.trim() || env.RESEND_FROM,
        to: [to],
        ...(over?.replyTo?.trim() ? { reply_to: over.replyTo.trim() } : {}),
        ...(over?.headers ? { headers: over.headers } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("[email] send failed:", res.status, await res.text());
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[email] send threw:", e);
    return "failed";
  }
}
```

- [ ] **Step 4: Run the new test and the existing email tests**

Run: `npx vitest run lib/email-send-result.test.ts lib/email.test.ts lib/receipt-email.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/email-send-result.test.ts
git commit -m "sendEmail says whether it sent, and carries custom headers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Stop link

**Files:**
- Create: `lib/post-purchase-stop.ts`, `app/email/stop/route.ts`
- Test: `lib/post-purchase-stop.test.ts`

**Interfaces:**
- Consumes: `otoSigningSecret()`, `siteUrl()` from `@/lib/env`; `createServiceClient` from `@/lib/supabase/server`.
- Produces: `stopToken(orderItemId: string): string`, `verifyStopToken(t: string | null | undefined): string | null`, `stopUrl(orderItemId: string): string`, `stopSequence(orderItemId: string): Promise<{ name: string | null }>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/post-purchase-stop.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  otoSigningSecret: () => "test-signing-secret-aaaaaaaaaaaa",
  siteUrl: () => "https://grow.greaterinside.com",
}));
const stopped: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.update = () => q;
      q.eq = (_c: string, v: string) => { stopped.push(v); return q; };
      q.is = () => q;
      q.select = () => q;
      q.maybeSingle = async () => ({ data: { description: "Funnel App" } });
      q.then = (res: (v: { data: unknown }) => unknown) => Promise.resolve({ data: null }).then(res);
      return q;
    },
  }),
}));

const { stopToken, verifyStopToken, stopUrl } = await import("@/lib/post-purchase-stop");
const { GET, POST } = await import("@/app/email/stop/route");

const ITEM = "3f1e2d4c-5b6a-4789-8abc-def012345678";
beforeEach(() => (stopped.length = 0));

describe("the stop token", () => {
  it("round-trips the order line it was made for", () => {
    expect(verifyStopToken(stopToken(ITEM))).toBe(ITEM);
  });

  it("refuses an edited, truncated or missing token", () => {
    const t = stopToken(ITEM);
    const other = Buffer.from("00000000-0000-0000-0000-000000000000").toString("base64url");
    expect(verifyStopToken(`${other}.${t.split(".")[1]}`)).toBeNull();
    expect(verifyStopToken(t.slice(0, -2))).toBeNull();
    expect(verifyStopToken(null)).toBeNull();
    expect(verifyStopToken("nodot")).toBeNull();
  });

  it("builds an absolute link on the store's own address", () => {
    expect(stopUrl(ITEM)).toMatch(/^https:\/\/grow\.greaterinside\.com\/email\/stop\?t=/);
  });
});

describe("the stop page", () => {
  const req = (t: string, method = "GET") => new Request(`https://grow.greaterinside.com/email/stop?t=${t}`, { method });

  it("says it is done, names what they bought, and stops that line", async () => {
    const res = await GET(req(stopToken(ITEM)));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You won't get any more of these emails about Funnel App.");
    expect(stopped).toContain(ITEM);
  });

  it("says the same the second time, rather than an error", async () => {
    await GET(req(stopToken(ITEM)));
    const again = await GET(req(stopToken(ITEM)));
    expect(again.status).toBe(200);
  });

  it("refuses a bad link politely and stops nothing", async () => {
    const res = await GET(req("forged.token"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("This link is not valid");
    expect(stopped).toHaveLength(0);
  });

  it("accepts the one-click POST inboxes send", async () => {
    const res = await POST(req(stopToken(ITEM), "POST"));
    expect(res.status).toBe(200);
    expect(stopped).toContain(ITEM);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/post-purchase-stop.test.ts`
Expected: FAIL, `Cannot find module '@/lib/post-purchase-stop'`.

- [ ] **Step 3: Implement the token module**

```ts
// lib/post-purchase-stop.ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { otoSigningSecret, siteUrl } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * "Stop these emails" on a post-purchase follow-up.
 *
 * The token names one order line and is signed with the same secret as the
 * preview and view-as tokens. It has no expiry: a buyer may open an old email
 * months later, and the link must still work then.
 */
const sign = (body: string) => createHmac("sha256", otoSigningSecret()).update(`pp-stop:${body}`).digest("base64url");

export function stopToken(orderItemId: string): string {
  const body = Buffer.from(orderItemId).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyStopToken(t: string | null | undefined): string | null {
  if (!t) return null;
  const [body, given] = t.split(".");
  if (!body || !given) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Buffer.from(body, "base64url").toString();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function stopUrl(orderItemId: string): string {
  return `${siteUrl()}/email/stop?t=${stopToken(orderItemId)}`;
}

/** Stop the rest of this line's sequence. Safe to call again. */
export async function stopSequence(orderItemId: string): Promise<{ name: string | null }> {
  const db = createServiceClient();
  await db
    .from("order_items")
    .update({ post_purchase_stopped_at: new Date().toISOString() })
    .eq("id", orderItemId)
    .is("post_purchase_stopped_at", null);
  const { data } = await db.from("order_items").select("description").eq("id", orderItemId).maybeSingle();
  return { name: (data?.description as string | null) ?? null };
}
```

- [ ] **Step 4: Implement the route**

```ts
// app/email/stop/route.ts
import { stopSequence, verifyStopToken } from "@/lib/post-purchase-stop";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(status: number, message: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#fafaf8;color:#0b0b0d;">
<main style="max-width:480px;margin:15vh auto;padding:0 20px;font-size:16px;line-height:1.6;"><p>${message}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function handle(req: Request): Promise<Response> {
  const id = verifyStopToken(new URL(req.url).searchParams.get("t"));
  if (!id) return page(400, "This link is not valid. If you want to stop these emails, reply to any of them and we will do it for you.");
  const { name } = await stopSequence(id);
  return page(200, `Done. You won't get any more of these emails${name ? ` about ${esc(name)}` : ""}.`);
}

export async function GET(req: Request) {
  return handle(req);
}

/** One-click unsubscribe (RFC 8058): inboxes POST to the List-Unsubscribe URL. */
export async function POST(req: Request) {
  return handle(req);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run lib/post-purchase-stop.test.ts && npx tsc --noEmit`
Expected: PASS, 7 tests; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/post-purchase-stop.ts app/email/stop/route.ts lib/post-purchase-stop.test.ts
git commit -m "Stop these emails: a signed link that ends a buyer's sequence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Load and save a sequence

**Files:**
- Create: `lib/post-purchase-store.ts`
- Test: `lib/post-purchase-store.test.ts` (unit, `saveProblem`), `lib/post-purchase-store.integration.test.ts`

**Interfaces:**
- Consumes (Task 2): `layoutSchema`, `parseLayout`, `docSchema`, `DELAY_UNITS`, `docUrls`, `urlProblem`, `DocNode`, `EmailLayout`, `DelayUnit`.
- Produces:
  - `type OwnerType = "offer" | "product"`
  - `type SequenceEmail = { id: string | null; delayAmount: number; delayUnit: DelayUnit; subject: string; preheader: string; doc: DocNode }`
  - `type Sequence = { id: string | null; enabled: boolean; layout: EmailLayout; emails: SequenceEmail[] }`
  - `saveInputSchema` (zod), `type SaveInput`
  - `saveProblem(input: SaveInput): string | null`
  - `getSequence(ownerType: OwnerType, ownerId: string): Promise<Sequence>`
  - `saveSequence(input: SaveInput): Promise<{ ok: true; emailIds: string[] } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing unit test**

```ts
// lib/post-purchase-store.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "s" }));
const { saveProblem } = await import("@/lib/post-purchase-store");
import type { SaveInput } from "@/lib/post-purchase-store";
import { LAYOUT_DEFAULTS, starterDoc, type DocNode } from "@/lib/post-purchase-layout";

type EmailIn = SaveInput["emails"][number];
const email = (over: Partial<EmailIn> = {}): EmailIn => ({ id: null, delayAmount: 2, delayUnit: "days", subject: "Hi", preheader: "", doc: starterDoc("X"), ...over });
const input = (over: Partial<SaveInput> = {}): SaveInput => ({ ownerType: "offer", ownerId: crypto.randomUUID(), enabled: true, layout: LAYOUT_DEFAULTS, emails: [email()], ...over });

describe("what stops a save", () => {
  it("nothing, for a normal sequence", () => {
    expect(saveProblem(input())).toBeNull();
  });

  it("turning it on with no emails", () => {
    expect(saveProblem(input({ emails: [] }))).toMatch(/at least one email/);
  });

  it("an email with no subject, once it is on", () => {
    expect(saveProblem(input({ emails: [email({ subject: "" })] }))).toMatch(/Email 1 needs a subject/);
    expect(saveProblem(input({ enabled: false, emails: [email({ subject: "" })] }))).toBeNull();
  });

  it("a follow-up with no delay", () => {
    expect(saveProblem(input({ emails: [email(), email({ delayAmount: 0, delayUnit: "hours" })] }))).toMatch(/Email 2 needs a delay of at least 1 hour/);
  });

  it("a pasted image or an http link, naming the email", () => {
    const pasted: DocNode = { type: "doc", content: [{ type: "image", attrs: { src: "data:image/png;base64,AAAA" } }] };
    expect(saveProblem(input({ emails: [email(), email({ doc: pasted })] }))).toMatch(/Email 2: an image was pasted in/);
    const http: DocNode = { type: "doc", content: [{ type: "emailButton", attrs: { href: "http://x.co" } }] };
    expect(saveProblem(input({ emails: [email({ doc: http })] }))).toMatch(/Email 1: http:\/\/x\.co must start with https/);
  });
});
```

- [ ] **Step 2: Write the failing integration test**

```ts
// lib/post-purchase-store.integration.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getSequence, saveSequence } from "@/lib/post-purchase-store";
import { LAYOUT_DEFAULTS, starterDoc } from "@/lib/post-purchase-layout";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const owners: string[] = [];
const email = (subject: string, delayAmount = 2) => ({ id: null, delayAmount, delayUnit: "days" as const, subject, preheader: "", doc: starterDoc("X") });

describe.skipIf(!canRun)("saving a sequence (integration)", () => {
  it("an owner with nothing saved reads as off, default layout, no emails", async () => {
    const s = await getSequence("offer", crypto.randomUUID());
    expect(s).toEqual({ id: null, enabled: false, layout: LAYOUT_DEFAULTS, emails: [] });
  });

  it("saves, reads back in order, and keeps each email's id across saves", async () => {
    const owner = crypto.randomUUID();
    owners.push(owner);
    const first = await saveSequence({ ownerType: "offer", ownerId: owner, enabled: true, layout: LAYOUT_DEFAULTS, emails: [email("A"), email("B"), email("C")] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const read = await getSequence("offer", owner);
    expect(read.emails.map((e) => e.subject)).toEqual(["A", "B", "C"]);
    expect(read.emails[0].delayAmount).toBe(0); // email 1 has no delay of its own

    // Reorder C before B and delete A, in one save.
    const [, b, c] = read.emails;
    const second = await saveSequence({ ownerType: "offer", ownerId: owner, enabled: true, layout: LAYOUT_DEFAULTS, emails: [c, b] });
    expect(second.ok).toBe(true);
    const after = await getSequence("offer", owner);
    expect(after.emails.map((e) => [e.subject, e.id])).toEqual([["C", c.id], ["B", b.id]]);
  });

  it("an id from another sequence is treated as new, never moved across", async () => {
    const o1 = crypto.randomUUID();
    const o2 = crypto.randomUUID();
    owners.push(o1, o2);
    await saveSequence({ ownerType: "offer", ownerId: o1, enabled: false, layout: LAYOUT_DEFAULTS, emails: [email("mine")] });
    const theirs = (await getSequence("offer", o1)).emails[0];
    await saveSequence({ ownerType: "product", ownerId: o2, enabled: false, layout: LAYOUT_DEFAULTS, emails: [{ ...theirs, subject: "copied" }] });
    expect((await getSequence("offer", o1)).emails[0].subject).toBe("mine");
    expect((await getSequence("product", o2)).emails[0].id).not.toBe(theirs.id);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const o of owners) await db.from("post_purchase_sequences").delete().eq("owner_id", o);
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run lib/post-purchase-store.test.ts lib/post-purchase-store.integration.test.ts`
Expected: FAIL, `Cannot find module '@/lib/post-purchase-store'`.

- [ ] **Step 4: Implement**

```ts
// lib/post-purchase-store.ts
import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import {
  layoutSchema, parseLayout, docSchema, DELAY_UNITS, docUrls, urlProblem,
  type DocNode, type EmailLayout, type DelayUnit,
} from "@/lib/post-purchase-layout";

export type OwnerType = "offer" | "product";
export type SequenceEmail = { id: string | null; delayAmount: number; delayUnit: DelayUnit; subject: string; preheader: string; doc: DocNode };
export type Sequence = { id: string | null; enabled: boolean; layout: EmailLayout; emails: SequenceEmail[] };

const emailInputSchema = z.object({
  id: z.uuid().nullable(),
  delayAmount: z.number().int().min(0).max(365),
  delayUnit: z.enum(DELAY_UNITS),
  subject: z.string().trim().max(200),
  preheader: z.string().trim().max(200),
  doc: docSchema,
});
export const saveInputSchema = z.object({
  ownerType: z.enum(["offer", "product"]),
  ownerId: z.uuid(),
  enabled: z.boolean(),
  layout: layoutSchema,
  emails: z.array(emailInputSchema).max(20),
});
export type SaveInput = z.infer<typeof saveInputSchema>;

/** Why this cannot be saved, naming the email; null when it can. */
export function saveProblem(input: SaveInput): string | null {
  if (input.enabled && input.emails.length === 0) return "Add at least one email before turning this on.";
  for (const [i, e] of input.emails.entries()) {
    const n = i + 1;
    if (input.enabled && !e.subject.trim()) return `Email ${n} needs a subject line.`;
    if (i > 0 && e.delayAmount < 1) return `Email ${n} needs a delay of at least 1 ${e.delayUnit === "hours" ? "hour" : "day"}.`;
    if (JSON.stringify(e.doc).length > 200_000) return `Email ${n} is too large. Upload images with the image button rather than pasting them.`;
    for (const u of docUrls(e.doc)) {
      const p = urlProblem(u);
      if (p) return `Email ${n}: ${p}.`;
    }
  }
  return null;
}

export async function getSequence(ownerType: OwnerType, ownerId: string): Promise<Sequence> {
  const db = createServiceClient();
  const { data: seq } = await db
    .from("post_purchase_sequences")
    .select("id, enabled, layout")
    .eq("store_id", await getStoreId())
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!seq) return { id: null, enabled: false, layout: parseLayout({}), emails: [] };
  const { data: rows } = await db
    .from("post_purchase_emails")
    .select("id, position, delay_amount, delay_unit, subject, preheader, doc")
    .eq("sequence_id", seq.id)
    .order("position");
  return {
    id: seq.id as string,
    enabled: Boolean(seq.enabled),
    layout: parseLayout(seq.layout),
    emails: (rows ?? []).map((r) => ({
      id: r.id as string,
      delayAmount: r.delay_amount as number,
      delayUnit: r.delay_unit as DelayUnit,
      subject: r.subject as string,
      preheader: r.preheader as string,
      doc: r.doc as DocNode,
    })),
  };
}

/**
 * Save the whole sequence in the order given.
 *
 * Each email keeps its id across saves, because a buyer's pending send points
 * at the email it is waiting for: a reorder then sends the right one, and a
 * deleted email's pending sends fall through to the next one that exists
 * (lib/post-purchase-sequences.ts).
 */
export async function saveSequence(
  input: SaveInput,
): Promise<{ ok: true; emailIds: string[] } | { ok: false; error: string }> {
  const problem = saveProblem(input);
  if (problem) return { ok: false, error: problem };
  const db = createServiceClient();
  const now = new Date().toISOString();

  const { data: seq, error: seqErr } = await db
    .from("post_purchase_sequences")
    .upsert(
      { store_id: await getStoreId(), owner_type: input.ownerType, owner_id: input.ownerId, enabled: input.enabled, layout: input.layout, updated_at: now },
      { onConflict: "store_id,owner_type,owner_id" },
    )
    .select("id")
    .single();
  if (seqErr || !seq) return { ok: false, error: `Could not save: ${seqErr?.message ?? "no sequence row"}` };

  const { data: existing } = await db.from("post_purchase_emails").select("id").eq("sequence_id", seq.id);
  const mine = new Set((existing ?? []).map((r) => r.id as string));
  // An id this sequence does not own is a new email, never a stolen one.
  const rows = input.emails.map((e, i) => ({
    id: e.id && mine.has(e.id) ? e.id : crypto.randomUUID(),
    sequence_id: seq.id as string,
    position: i + 1,
    delay_amount: i === 0 ? 0 : e.delayAmount,
    delay_unit: e.delayUnit,
    subject: e.subject.trim(),
    preheader: e.preheader.trim(),
    doc: e.doc,
    updated_at: now,
  }));

  const keep = rows.map((r) => r.id);
  let del = db.from("post_purchase_emails").delete().eq("sequence_id", seq.id);
  if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: `Could not save: ${delErr.message}` };

  if (rows.length) {
    const { error: upErr } = await db.from("post_purchase_emails").upsert(rows, { onConflict: "id" });
    if (upErr) return { ok: false, error: `Could not save: ${upErr.message}` };
  }
  return { ok: true, emailIds: keep };
}
```

- [ ] **Step 5: Run both to verify they pass**

Run: `npx vitest run lib/post-purchase-store.test.ts lib/post-purchase-store.integration.test.ts && npx tsc --noEmit`
Expected: PASS (5 + 3 tests); tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/post-purchase-store.ts lib/post-purchase-store.test.ts lib/post-purchase-store.integration.test.ts
git commit -m "Load and save a post-purchase sequence, with reasons a save is refused

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Queue and send

**Files:**
- Create: `lib/post-purchase-sequences.ts`
- Test: `lib/post-purchase-sequences.integration.test.ts`

**Interfaces:**
- Consumes: `renderPostPurchaseEmail` (Task 3), `sendEmail` + `SendResult` (Task 4), `stopUrl` (Task 5), `saveSequence` (Task 6, used by the test), `delayMs`, `parseLayout`, `DocNode`, `DelayUnit` (Task 2), `getSettingsOrDefaults` (`@/lib/settings`), `recordError`, `messageOf` (`@/lib/errors`), `firstNameOf` (`@/lib/post-purchase-email`).
- Produces:
  - `queueSequencesForOrder(orderId: string, now?: Date): Promise<number>`
  - `type SequenceSendSummary = { sent: number; skipped: number; failed: number }`
  - `sendDueSequenceEmails(opts?: { now?: Date; limit?: number }): Promise<SequenceSendSummary>`

- [ ] **Step 1: Write the failing integration test**

```ts
// lib/post-purchase-sequences.integration.test.ts
import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

const sent: { to: string; subject: string; headers?: Record<string, string> }[] = [];
let nextResult: "sent" | "failed" | "disabled" = "sent";
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (to: string, mail: { subject: string }, over?: { headers?: Record<string, string> }) => {
    if (nextResult === "sent") sent.push({ to, subject: mail.subject, headers: over?.headers });
    return nextResult;
  },
}));
// Pinned rather than read from the local store, where an admin may have
// switched the welcome on: the wiring test below needs it off.
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({
    postPurchaseEmail: { enabled: false, accessUrl: "https://grow.greaterinside.com/login", senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "" },
  }),
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { saveSequence, getSequence } = await import("@/lib/post-purchase-store");
const { queueSequencesForOrder, sendDueSequenceEmails } = await import("@/lib/post-purchase-sequences");
const { LAYOUT_DEFAULTS, starterDoc } = await import("@/lib/post-purchase-layout");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const users: string[] = [];
const offers: string[] = [];
const DAY = 86_400_000;

beforeEach(() => {
  sent.length = 0;
  nextResult = "sent";
});

describe.skipIf(!canRun)("post-purchase sequences (integration)", () => {
  /** An offer, a paying buyer who owns it, and one order line for it. */
  async function purchase(opts: { kind?: string; subjects?: string[]; enabled?: boolean } = {}) {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const offerId = crypto.randomUUID();
    offers.push(offerId);
    const off = await db.from("offers").insert({
      id: offerId, store_id: storeId, key: `zz-pps-${offerId}`, name: "zz Funnel App", grant_type: "subscription",
      grant_app_id: APP, grant_entitlement_key: `zz-pps-${offerId}`, grant_channels: [], billing_type: "one_time",
      price_cents: 2900, currency: "usd", headline: "fixture", description: "fixture",
    });
    if (off.error) throw new Error(`fixture offer: ${off.error.message}`);
    const email = `zzpps_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const created = await db.auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db.from("users").insert({ id: userId, store_id: storeId, email, username: "Priya Shah" });
    const { data: order } = await db.from("orders").insert({ store_id: storeId, user_id: userId, email, status: "paid", total_cents: 2900, subtotal_cents: 2900, currency: "usd" }).select("id").single();
    const { data: item } = await db.from("order_items").insert({ store_id: storeId, order_id: order!.id, kind: opts.kind ?? "oto", description: "zz Funnel App", amount_cents: 2900, offer_id: offerId }).select("id").single();
    const own = await db.from("ownership").insert({ store_id: storeId, user_id: userId, app_id: APP, offer_id: offerId, status: "active", source: "purchase" });
    if (own.error) throw new Error(`fixture ownership: ${own.error.message}`);
    const subjects = opts.subjects ?? ["One", "Two", "Three"];
    await saveSequence({
      ownerType: "offer", ownerId: offerId, enabled: opts.enabled ?? true, layout: LAYOUT_DEFAULTS,
      emails: subjects.map((s) => ({ id: null, delayAmount: 2, delayUnit: "days" as const, subject: s, preheader: "", doc: starterDoc("Funnel App") })),
    });
    return { orderId: order!.id as string, itemId: item!.id as string, userId, offerId, email };
  }

  async function sends(itemId: string) {
    const { data } = await createServiceClient()
      .from("post_purchase_sends")
      .select("position, status, reason, due_at, sent_at")
      .eq("order_item_id", itemId)
      .order("position");
    return (data ?? []) as { position: number; status: string; reason: string | null; due_at: string; sent_at: string | null }[];
  }

  it("queues email 1 a minute out, once, however often it is asked", async () => {
    const p = await purchase();
    const now = new Date();
    expect(await queueSequencesForOrder(p.orderId, now)).toBe(1);
    expect(await queueSequencesForOrder(p.orderId, now)).toBe(0);
    const [row] = await sends(p.itemId);
    expect(row.position).toBe(1);
    expect(new Date(row.due_at).getTime()).toBe(now.getTime() + 60_000);
  });

  it("queues nothing for a renewal line or a sequence that is off", async () => {
    const renewal = await purchase({ kind: "renewal" });
    expect(await queueSequencesForOrder(renewal.orderId)).toBe(0);
    const off = await purchase({ enabled: false });
    expect(await queueSequencesForOrder(off.orderId)).toBe(0);
  });

  it("sends email 1 once, then queues email 2 its delay later", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    const at = new Date(t0.getTime() + 61_000);
    // Two sweeps at once: the claim lets only one of them send.
    await Promise.all([sendDueSequenceEmails({ now: at }), sendDueSequenceEmails({ now: at })]);
    // Every sweep also sees other tests' rows in the shared store, so each
    // assertion looks only at this buyer's mail.
    const mine = sent.filter((s) => s.to === p.email);
    expect(mine.map((s) => s.subject)).toEqual(["One"]);
    const rows = await sends(p.itemId);
    expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "pending"]]);
    expect(new Date(rows[1].due_at).getTime()).toBe(at.getTime() + 2 * DAY);
    // Email 1 has no stop link; email 2 will.
    expect(mine[0].headers).toBeUndefined();
  });

  it("follow-ups carry List-Unsubscribe", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
    const two = sent.find((s) => s.to === p.email && s.subject === "Two");
    expect(two?.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/.+\/email\/stop\?t=.+>$/);
    expect(two?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it.each([
    ["order refunded", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("orders").update({ status: "refunded" }).eq("id", p.orderId); }],
    ["access ended", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("ownership").update({ status: "canceled" }).eq("user_id", p.userId); }],
    ["buyer stopped these emails", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("order_items").update({ post_purchase_stopped_at: new Date().toISOString() }).eq("id", p.itemId); }],
    ["sequence switched off", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("post_purchase_sequences").update({ enabled: false }).eq("owner_id", p.offerId); }],
  ])("stops the rest when the %s", async (reason, act) => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
    await act(p);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
    const rows = await sends(p.itemId);
    expect(rows.map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", reason]]);
    expect(sent.filter((s) => s.to === p.email)).toHaveLength(1);
  });

  it("an email deleted mid-sequence is skipped and the next one goes, once", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) }); // One sent, Two pending
    const seq = await getSequence("offer", p.offerId);
    await saveSequence({ ownerType: "offer", ownerId: p.offerId, enabled: true, layout: LAYOUT_DEFAULTS, emails: [seq.emails[0], seq.emails[2]] });
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
    expect(sent.filter((s) => s.to === p.email).map((s) => s.subject)).toEqual(["One", "Three"]);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 30 * DAY) });
    expect(sent.filter((s) => s.to === p.email)).toHaveLength(2);
  });

  it("a reorder mid-sequence sends every email once, none twice, none lost", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) }); // One sent, Two pending
    const [one, two, three] = (await getSequence("offer", p.offerId)).emails;
    await saveSequence({ ownerType: "offer", ownerId: p.offerId, enabled: true, layout: LAYOUT_DEFAULTS, emails: [three, two, one] });
    for (const d of [3, 6, 9, 30]) await sendDueSequenceEmails({ now: new Date(t0.getTime() + d * DAY) });
    expect(sent.filter((s) => s.to === p.email).map((s) => s.subject)).toEqual(["One", "Two", "Three"]);
  });

  it("a send the provider refuses is recorded, shown on Errors, and ends the chain", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    nextResult = "failed";
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
    const rows = await sends(p.itemId);
    expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "failed"]]);
    const { data: errs } = await createServiceClient().from("error_events").select("source, context").eq("source", "post_purchase_sequence").order("created_at", { ascending: false }).limit(5);
    expect((errs ?? []).some((e) => (e.context as { orderItemId?: string }).orderItemId === p.itemId)).toBe(true);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const u of users) {
    await db.from("ownership").delete().eq("user_id", u);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) {
      const { data: items } = await db.from("order_items").select("id").eq("order_id", o.id);
      for (const i of items ?? []) {
        await db.from("post_purchase_sends").delete().eq("order_item_id", i.id);
        await db.from("error_events").delete().eq("source", "post_purchase_sequence").contains("context", { orderItemId: i.id });
      }
      await db.from("order_items").delete().eq("order_id", o.id);
    }
    await db.from("orders").delete().eq("user_id", u);
    await db.from("users").delete().eq("id", u);
    await db.auth.admin.deleteUser(u);
  }
  for (const o of offers) {
    await db.from("post_purchase_sequences").delete().eq("owner_id", o);
    await db.from("offers").delete().eq("id", o);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/post-purchase-sequences.integration.test.ts`
Expected: FAIL, `Cannot find module '@/lib/post-purchase-sequences'`. (If the offer fixture insert is refused by a CHECK, read the error, compare with `lib/repeat-trial.integration.test.ts`'s working fixture, and match it.)

- [ ] **Step 3: Implement**

```ts
// lib/post-purchase-sequences.ts
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettingsOrDefaults } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { recordError, messageOf } from "@/lib/errors";
import { firstNameOf } from "@/lib/post-purchase-email";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { delayMs, type DelayUnit, type DocNode } from "@/lib/post-purchase-layout";
import { stopUrl } from "@/lib/post-purchase-stop";

/**
 * Post-purchase sequences: queue at checkout over, send when due.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 *
 * Only email 1 is queued at the start. Each later email is queued when the one
 * before it is sent, so a sequence edited in between is followed as it stands
 * now, and a stopped one simply never queues the next.
 */

/** Email 1 waits this long, so the welcome email arrives first. */
const FIRST_EMAIL_AFTER_MS = 60_000;
const HOLDS = ["active", "trialing", "past_due"];

type Line = { id: string; kind: string; offer_id: string | null; product_id: string | null };
type Owner = { ownerType: "offer" | "product"; ownerId: string };

function ownerOf(line: Pick<Line, "offer_id" | "product_id">): Owner | null {
  if (line.offer_id) return { ownerType: "offer", ownerId: line.offer_id };
  if (line.product_id) return { ownerType: "product", ownerId: line.product_id };
  return null;
}

export async function queueSequencesForOrder(orderId: string, now = new Date()): Promise<number> {
  const db = createServiceClient();
  const { data: order } = await db.from("orders").select("id, store_id, email, status").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "paid" || !order.email) return 0;
  const { data: lines } = await db.from("order_items").select("id, kind, offer_id, product_id").eq("order_id", orderId).order("created_at");

  let queued = 0;
  for (const line of (lines ?? []) as Line[]) {
    // A renewal is a payment on something bought earlier, not a purchase.
    if (line.kind === "renewal") continue;
    const owner = ownerOf(line);
    if (!owner) continue;
    const { data: seq } = await db
      .from("post_purchase_sequences")
      .select("id, enabled")
      .eq("store_id", order.store_id)
      .eq("owner_type", owner.ownerType)
      .eq("owner_id", owner.ownerId)
      .maybeSingle();
    if (!seq?.enabled) continue;
    const { data: first } = await db
      .from("post_purchase_emails")
      .select("id")
      .eq("sequence_id", seq.id)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (!first) continue;
    const { data: inserted } = await db
      .from("post_purchase_sends")
      .upsert(
        {
          store_id: order.store_id,
          order_item_id: line.id,
          sequence_id: seq.id,
          email_id: first.id,
          position: 1,
          to_email: order.email,
          due_at: new Date(now.getTime() + FIRST_EMAIL_AFTER_MS).toISOString(),
        },
        { onConflict: "order_item_id,sequence_id,position", ignoreDuplicates: true },
      )
      .select("id");
    queued += inserted?.length ?? 0;
  }
  return queued;
}

export type SequenceSendSummary = { sent: number; skipped: number; failed: number };

export async function sendDueSequenceEmails(opts: { now?: Date; limit?: number } = {}): Promise<SequenceSendSummary> {
  const now = opts.now ?? new Date();
  const db = createServiceClient();
  const { data: due } = await db
    .from("post_purchase_sends")
    .select("id")
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    .order("due_at")
    .order("id")
    .limit(opts.limit ?? 50);
  const out: SequenceSendSummary = { sent: 0, skipped: 0, failed: 0 };
  for (const d of due ?? []) {
    const r = await sendOne(d.id as string, now);
    if (r) out[r] += 1;
  }
  return out;
}

type Claimed = { id: string; order_item_id: string; sequence_id: string; email_id: string | null; position: number; to_email: string; store_id: string };
type EmailRow = { id: string; position: number; subject: string; preheader: string; doc: DocNode };

async function sendOne(sendId: string, now: Date): Promise<keyof SequenceSendSummary | null> {
  const db = createServiceClient();
  // Claim before anything else: two sweeps racing get one send.
  const { data: claimed } = await db
    .from("post_purchase_sends")
    .update({ status: "sending" })
    .eq("id", sendId)
    .eq("status", "pending")
    .select("id, order_item_id, sequence_id, email_id, position, to_email, store_id")
    .maybeSingle();
  if (!claimed) return null;
  const row = claimed as Claimed;

  const skip = async (reason: string) => {
    await db.from("post_purchase_sends").update({ status: "skipped", reason }).eq("id", sendId);
    return "skipped" as const;
  };

  try {
    const { data: line } = await db
      .from("order_items")
      .select("id, description, offer_id, product_id, post_purchase_stopped_at, orders(status, user_id, email)")
      .eq("id", row.order_item_id)
      .maybeSingle();
    const order = line ? ((Array.isArray(line.orders) ? line.orders[0] : line.orders) as { status: string; user_id: string | null; email: string } | null) : null;
    if (!line || !order) return await skip("order line gone");
    if (order.status !== "paid") return await skip("order refunded");
    if (line.post_purchase_stopped_at) return await skip("buyer stopped these emails");

    const { data: seq } = await db.from("post_purchase_sequences").select("enabled, layout").eq("id", row.sequence_id).maybeSingle();
    if (!seq?.enabled) return await skip("sequence switched off");
    if (!order.user_id || !(await stillHolds(order.user_id, line))) return await skip("access ended");

    const sentIds = await sentEmailIds(row);
    const email = await emailToSend(row, sentIds);
    if (!email) return await skip("no email left in the sequence");

    const settings = (await getSettingsOrDefaults()).postPurchaseEmail;
    // By email, the way the welcome finds the name typed at checkout.
    const { data: profile } = await db.from("users").select("username").eq("email", order.email).maybeSingle();
    // Every email after the buyer's first carries the stop link.
    const stop = row.position > 1 ? stopUrl(line.id as string) : null;
    const mail = renderPostPurchaseEmail({
      doc: email.doc,
      subject: email.subject,
      preheader: email.preheader,
      layout: seq.layout,
      vars: {
        first_name: firstNameOf(profile?.username as string | null),
        offer_name: await nameOf(line),
        access_link: settings.accessUrl,
      },
      stopUrl: stop,
    });
    const res = await sendEmail(row.to_email, mail, {
      from: settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail,
      replyTo: settings.replyTo,
      ...(stop ? { headers: { "List-Unsubscribe": `<${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    });
    if (res === "disabled") return await skip("email sending is not configured");
    if (res === "failed") throw new Error("the email provider refused the send");

    await db.from("post_purchase_sends").update({ status: "sent", sent_at: now.toISOString(), email_id: email.id }).eq("id", sendId);
    await queueNext(row, new Set([...sentIds, email.id]), now);
    return "sent";
  } catch (e) {
    await db.from("post_purchase_sends").update({ status: "failed", reason: messageOf(e).slice(0, 500) }).eq("id", sendId);
    await recordError({ source: "post_purchase_sequence", message: messageOf(e), context: { sendId, orderItemId: row.order_item_id } });
    return "failed";
  }
}

async function stillHolds(userId: string, line: { offer_id: string | null; product_id: string | null }): Promise<boolean> {
  const owner = ownerOf(line);
  if (!owner) return false;
  const { data } = await createServiceClient()
    .from("ownership")
    .select("id")
    .eq("user_id", userId)
    .eq(owner.ownerType === "offer" ? "offer_id" : "product_id", owner.ownerId)
    .in("status", HOLDS)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/*
 * The owner may reorder or delete emails while buyers are mid-sequence. One
 * rule covers every case: the next email is the first one, in the sequence's
 * order as it stands now, that this line has not been sent. So nobody gets an
 * email twice and nobody loses one they have not had. A row's `position` is
 * its step (1st, 2nd, 3rd email this line gets), which is what makes queueing
 * the same step twice insert nothing.
 */
async function sentEmailIds(row: Claimed): Promise<Set<string>> {
  const { data } = await createServiceClient()
    .from("post_purchase_sends")
    .select("email_id")
    .eq("order_item_id", row.order_item_id)
    .eq("sequence_id", row.sequence_id)
    .eq("status", "sent");
  return new Set((data ?? []).map((r) => r.email_id as string | null).filter((id): id is string => !!id));
}

async function emailsInOrder(sequenceId: string): Promise<(EmailRow & { delay_amount: number; delay_unit: DelayUnit })[]> {
  const { data } = await createServiceClient()
    .from("post_purchase_emails")
    .select("id, position, subject, preheader, doc, delay_amount, delay_unit")
    .eq("sequence_id", sequenceId)
    .order("position");
  return (data ?? []) as (EmailRow & { delay_amount: number; delay_unit: DelayUnit })[];
}

/** The email this row was queued for, while it exists and is unsent; else the first unsent one. */
async function emailToSend(row: Claimed, sent: Set<string>): Promise<EmailRow | null> {
  const all = await emailsInOrder(row.sequence_id);
  return all.find((e) => e.id === row.email_id && !sent.has(e.id)) ?? all.find((e) => !sent.has(e.id)) ?? null;
}

async function queueNext(row: Claimed, sent: Set<string>, now: Date): Promise<void> {
  const next = (await emailsInOrder(row.sequence_id)).find((e) => !sent.has(e.id));
  if (!next) return;
  await createServiceClient()
    .from("post_purchase_sends")
    .upsert(
      {
        store_id: row.store_id,
        order_item_id: row.order_item_id,
        sequence_id: row.sequence_id,
        email_id: next.id,
        position: row.position + 1,
        to_email: row.to_email,
        due_at: new Date(now.getTime() + delayMs(next.delay_amount, next.delay_unit)).toISOString(),
      },
      { onConflict: "order_item_id,sequence_id,position", ignoreDuplicates: true },
    );
}

async function nameOf(line: { description?: string | null; offer_id: string | null; product_id: string | null }): Promise<string> {
  const db = createServiceClient();
  if (line.offer_id) {
    const { data } = await db.from("offers").select("name").eq("id", line.offer_id).maybeSingle();
    if (data?.name) return data.name as string;
  }
  if (line.product_id) {
    const { data } = await db.from("products").select("title").eq("id", line.product_id).maybeSingle();
    if (data?.title) return data.title as string;
  }
  return line.description ?? "your purchase";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/post-purchase-sequences.integration.test.ts && npx tsc --noEmit`
Expected: PASS, 11 tests (the `it.each` counts four); tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/post-purchase-sequences.ts lib/post-purchase-sequences.integration.test.ts
git commit -m "Queue a buyer's post-purchase sequence and send it on schedule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire into checkout-over and the cron

**Files:**
- Modify: `lib/post-purchase-send.ts` (`sendPostPurchaseIfDue`, lines ~36-62)
- Modify: `app/api/cron/retry/route.ts`
- Modify: `docs/errors-and-retries.md` (after the scheduled-task table)
- Test: add to `lib/post-purchase-sequences.integration.test.ts`; create `app/api/cron/retry/route.test.ts`

**Interfaces:**
- Consumes: `queueSequencesForOrder`, `sendDueSequenceEmails` (Task 7).

- [ ] **Step 1: Write the failing tests**

Append inside the `describe.skipIf(!canRun)` block of `lib/post-purchase-sequences.integration.test.ts`:

```ts
  it("the checkout ending queues the sequence even with the welcome email off", async () => {
    const { sendPostPurchaseIfDue } = await import("@/lib/post-purchase-send");
    const p = await purchase();
    // The welcome is pinned off by this file's settings mock.
    const res = await sendPostPurchaseIfDue(p.orderId);
    expect(res).toBe("disabled");
    expect((await sends(p.itemId)).map((r) => r.position)).toEqual([1]);
  });
```

Create `app/api/cron/retry/route.test.ts`:

```ts
import { it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/retry", () => ({ runDueJobs: vi.fn(async () => ({})) }));
vi.mock("@/lib/leads", () => ({ flushDueLeads: vi.fn(async () => ({})) }));
vi.mock("@/lib/subscription-reconcile", () => ({ repairSubscriptionDrift: vi.fn(async () => ({ repaired: [], skipped: [] })) }));
vi.mock("@/lib/post-purchase-send", () => ({ sweepPostPurchaseEmails: vi.fn(async () => ({ sent: 0, skipped: 0 })) }));
const due = vi.hoisted(() => vi.fn(async () => ({ sent: 2, skipped: 1, failed: 0 })));
vi.mock("@/lib/post-purchase-sequences", () => ({ sendDueSequenceEmails: due }));

const { POST } = await import("@/app/api/cron/retry/route");
afterEach(() => vi.unstubAllEnvs());

it("the 5-minute retry cron sends due sequence emails and reports what happened", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  const res = await POST(new Request("http://localhost/api/cron/retry", { method: "POST", headers: { authorization: "Bearer test-secret" } }));
  expect(due).toHaveBeenCalledTimes(1);
  expect(await res.json()).toMatchObject({ ok: true, sequenceSent: 2, sequenceSkipped: 1, sequenceFailed: 0 });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run app/api/cron/retry/route.test.ts lib/post-purchase-sequences.integration.test.ts`
Expected: FAIL (`due` never called; the new integration test sees no send row).

- [ ] **Step 3: Rewire `sendPostPurchaseIfDue`**

In `lib/post-purchase-send.ts`, add the import and move the pending-upsell check above the welcome's on/off so the checkout-over moment is known whether or not the welcome is enabled. The function's opening becomes:

```ts
import { queueSequencesForOrder } from "@/lib/post-purchase-sequences";

export async function sendPostPurchaseIfDue(orderId: string): Promise<Sent> {
  const db = createServiceClient();

  const { data: order } = await db
    .from("orders")
    .select("id, email, status, post_purchase_sent_at, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "paid" || !order.email) return "no-order";
  if (order.post_purchase_sent_at) return "already";

  // Still deciding on an upsell. The token expiring is what eventually releases
  // this — checked against the clock rather than the row's status, because an
  // abandoned token stays "pending" for ever.
  const { data: pending } = await db
    .from("oto_tokens")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (pending && pending.length > 0) return "waiting";

  // The checkout is over. Each item's own post-purchase sequence starts now,
  // whether or not the store's welcome email is switched on: they are sent in
  // addition to it, not through it. Idempotent, so the sweep calling this
  // again for an order whose welcome is off queues nothing twice. A failure
  // here must not cost the buyer their welcome.
  // ponytail: with the welcome off, post_purchase_sent_at is never stamped, so
  // the sweep re-reads its 50 oldest orders of the last day every run. Fine at
  // this store's volume; stamp a separate queued-at column if it outgrows 50/day.
  try {
    await queueSequencesForOrder(orderId);
  } catch (e) {
    console.error("[post-purchase] could not queue sequences:", orderId, e);
  }

  const settings = await getSettingsOrDefaults();
  const conf = settings.postPurchaseEmail;
  if (!conf.enabled) return "disabled";
```

Then delete the original `settings`/`conf`/`enabled` lines and the original pending-token block further down, so each appears once. Everything after (items, covers, profile, claim, send) is unchanged.

- [ ] **Step 4: Call the sender from the cron**

In `app/api/cron/retry/route.ts`:

```ts
import { sendDueSequenceEmails } from "@/lib/post-purchase-sequences";
```

After `const welcome = await sweepPostPurchaseEmails();` add:

```ts
    // Post-purchase sequences: each due email, stop rules checked first.
    const sequences = await sendDueSequenceEmails();
```

and add to the JSON body:

```ts
      sequenceSent: sequences.sent,
      sequenceSkipped: sequences.skipped,
      sequenceFailed: sequences.failed,
```

- [ ] **Step 5: Document it**

In `docs/errors-and-retries.md`, after the paragraph beginning "`sync-subscriptions` runs before `backfill-renewals`", add:

```markdown
`retry-sweep` also sends due post-purchase sequence emails
(`sendDueSequenceEmails`, lib/post-purchase-sequences.ts): up to 50 per run,
each claimed before sending. A send the provider refuses is marked `failed`,
logged here as `post_purchase_sequence`, and ends that buyer's sequence; it is
not retried. Email 1 of each sequence is queued by `sendPostPurchaseIfDue`
once the checkout is over, whether or not the welcome email is on.
```

- [ ] **Step 6: Run the tests, the existing post-purchase tests, and tsc**

Run: `npx vitest run app/api/cron/retry/route.test.ts lib/post-purchase-sequences.integration.test.ts lib/post-purchase-email.test.ts lib/purchase-email-reaches-every-end.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exit 0. If `purchase-email-reaches-every-end.test.ts` pins the old order of the checks, update its expectation to the new order and say why in its comment.

- [ ] **Step 7: Commit**

```bash
git add lib/post-purchase-send.ts app/api/cron/retry/route.ts docs/errors-and-retries.md app/api/cron/retry/route.test.ts lib/post-purchase-sequences.integration.test.ts
git commit -m "Start sequences when the checkout is over; send them from the retry cron

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Email editor

**Files:**
- Modify: `package.json` (two TipTap packages)
- Create: `lib/email-editor-extensions.ts`, `components/admin/email-editor.tsx`
- Modify: `app/globals.css` (append editor styles)
- Test: `lib/email-editor-extensions.test.ts`

**Interfaces:**
- Consumes: `EMAIL_FONTS`, `FONT_SIZES`, `MERGE_KEYS`, `MERGE_LABELS`, `EmailLayout`, `DocNode` (Task 2); `renderPostPurchaseEmail` (Task 3, test only); `MediaModal`, `PickedMedia` (`@/components/admin/media-modal`); `publicCoverUrl` (`@/lib/media-url`).
- Produces:
  - `emailExtensions(): Extensions` (from `lib/email-editor-extensions.ts`)
  - `EmailEditor` props: `{ doc: DocNode; docKey: string; onChange: (doc: DocNode) => void; layout: EmailLayout; view: "desktop" | "mobile" }`

- [ ] **Step 1: Install the two packages at the installed TipTap version**

Run: `npm install @tiptap/extension-text-style@3.29.0 @tiptap/extension-text-align@3.29.0`
Expected: both added to `package.json` `dependencies`; `npm ls @tiptap/core` shows one version.

- [ ] **Step 2: Write the failing test**

```ts
// lib/email-editor-extensions.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/react";
import { emailExtensions } from "@/lib/email-editor-extensions";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { starterDoc } from "@/lib/post-purchase-layout";

/**
 * The editor and the renderer agree on the document. The editor writes JSON
 * the renderer reads; if a node or mark were named differently on either
 * side, the owner would see it in the editor and the buyer would not get it.
 */
describe("the email editor's document", () => {
  const editor = new Editor({ extensions: emailExtensions(), content: starterDoc("Funnel App") });

  it("holds the starter email without dropping the tag or the button", () => {
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"mergeTag"');
    expect(json).toContain('"type":"emailButton"');
  });

  it("writes font, size, colour and alignment where the renderer reads them", () => {
    editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "styled" }] }] });
    editor.chain().selectAll().setFontFamily("Georgia, 'Times New Roman', serif").setFontSize("20px").setColor("#112233").setTextAlign("center").run();
    const m = renderPostPurchaseEmail({ doc: editor.getJSON(), subject: "s", preheader: "", layout: {}, vars: {}, stopUrl: null });
    expect(m.html).toContain("text-align:center;");
    expect(m.html).toContain("font-family:Georgia, 'Times New Roman', serif;font-size:20px;color:#112233;");
  });

  it("keeps an image's width and link", () => {
    editor.commands.setContent({ type: "doc", content: [{ type: "image", attrs: { src: "https://x.co/a.png", alt: "a", widthPct: 60, href: "https://x.co" } }] });
    const img = (editor.getJSON().content ?? [])[0];
    expect(img.attrs).toMatchObject({ widthPct: 60, href: "https://x.co" });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/email-editor-extensions.test.ts`
Expected: FAIL, `Cannot find module '@/lib/email-editor-extensions'`.

- [ ] **Step 4: Implement the extensions**

```ts
// lib/email-editor-extensions.ts
import { Node, mergeAttributes, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { TextStyle, Color, BackgroundColor, FontFamily, FontSize } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { MERGE_LABELS, type MergeKey } from "@/lib/post-purchase-layout";

/**
 * The post-purchase email editor's schema. Every node and mark here has a
 * matching branch in lib/post-purchase-render.ts; add one and add the other.
 */

/** A personal detail, shown as a chip, filled in at send time. */
export const MergeTag = Node.create({
  name: "mergeTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { key: { default: "first_name" } };
  },
  parseHTML() {
    return [{ tag: "span[data-merge-tag]", getAttrs: (el) => ({ key: (el as HTMLElement).dataset.mergeTag }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-merge-tag": node.attrs.key, class: "merge-tag" }), MERGE_LABELS[node.attrs.key as MergeKey] ?? String(node.attrs.key)];
  },
});

/** A call-to-action button, drawn as a table by the renderer. */
export const EmailButton = Node.create({
  name: "emailButton",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      label: { default: "Open your library" },
      href: { default: "{{access_link}}" },
      color: { default: "#c8653d" },
      align: { default: "left" },
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-email-button]",
      getAttrs: (el) => {
        const d = (el as HTMLElement).dataset;
        return { label: d.label, href: d.href, color: d.color, align: d.align };
      },
    }];
  },
  renderHTML({ node }) {
    const a = node.attrs as { label: string; href: string; color: string; align: string };
    return [
      "div",
      { "data-email-button": "", "data-label": a.label, "data-href": a.href, "data-color": a.color, "data-align": a.align, class: "email-button", style: `text-align:${a.align === "center" ? "center" : "left"}` },
      ["span", { style: `background:${a.color}` }, a.label],
    ];
  },
});

/** An image with a width in percent and an optional link. */
export const EmailImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      widthPct: {
        default: 100,
        parseHTML: (el) => Number((el as HTMLElement).dataset.widthPct) || 100,
        renderHTML: (a) => ({ "data-width-pct": a.widthPct, style: `width:${a.widthPct}%` }),
      },
      href: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).dataset.href ?? null,
        renderHTML: (a) => (a.href ? { "data-href": a.href } : {}),
      },
    };
  },
});

export function emailExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, code: false, codeBlock: false }),
    Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { target: "_blank" } }),
    EmailImage,
    TextStyle,
    Color,
    BackgroundColor,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    MergeTag,
    EmailButton,
  ];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/email-editor-extensions.test.ts`
Expected: PASS, 3 tests. If `@tiptap/react` does not re-export `Editor`, `Node` or `mergeAttributes`, import them from `@tiptap/core` (it is TipTap's own dependency and is installed).

- [ ] **Step 6: Implement the editor component**

```tsx
// components/admin/email-editor.tsx
"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { emailExtensions } from "@/lib/email-editor-extensions";
import { EMAIL_FONTS, FONT_SIZES, MERGE_KEYS, MERGE_LABELS, type DocNode, type EmailLayout } from "@/lib/post-purchase-layout";
import { MediaModal, type PickedMedia } from "@/components/admin/media-modal";
import { publicCoverUrl } from "@/lib/media-url";

type Pop = null | "link" | "image" | "button";

/**
 * One post-purchase email, edited where it will be read: the canvas has the
 * email's own width, padding, colours and font, so what the owner arranges is
 * what arrives. The toolbar offers what an email client can show, and no more.
 */
export function EmailEditor({
  doc,
  docKey,
  onChange,
  layout,
  view,
}: {
  doc: DocNode;
  /** Changes when a different email is opened, so the editor reloads. */
  docKey: string;
  onChange: (doc: DocNode) => void;
  layout: EmailLayout;
  view: "desktop" | "mobile";
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: emailExtensions(),
    content: doc,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocNode),
    editorProps: { attributes: { class: "email-canvas-body", "aria-label": "Email content" } },
  });
  const [, rerender] = useState(0);
  const [pop, setPop] = useState<Pop>(null);
  const [media, setMedia] = useState(false);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(doc, { emitUpdate: false });
    // Only when a different email is opened, never on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, editor]);

  useEffect(() => {
    if (!editor) return;
    const tick = () => rerender((n) => n + 1);
    editor.on("selectionUpdate", tick);
    editor.on("transaction", tick);
    return () => {
      editor.off("selectionUpdate", tick);
      editor.off("transaction", tick);
    };
  }, [editor]);

  if (!editor) return null;

  const width = view === "desktop" ? `min(100%, ${layout.desktopWidth}px)` : `${layout.mobileWidthPct}%`;
  const pad = view === "desktop" ? layout.desktopPadding : layout.mobilePadding;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <Toolbar editor={editor} onPop={setPop} onMedia={() => setMedia(true)} />
      {pop === "link" && <LinkPop editor={editor} onClose={() => setPop(null)} />}
      {pop === "image" && <ImagePop editor={editor} onClose={() => setPop(null)} onLibrary={() => setMedia(true)} />}
      {pop === "button" && <ButtonPop editor={editor} onClose={() => setPop(null)} />}
      <div className="overflow-x-auto bg-surface-2 px-3 py-6">
        <div className={view === "mobile" ? "mx-auto w-[375px] max-w-full overflow-hidden rounded-[28px] border-[10px] border-[#1d1d22]" : "w-full"}>
          <div style={{ background: layout.backgroundColor, padding: view === "desktop" ? "24px 0" : 0 }}>
            <div
              className="email-canvas mx-auto"
              style={{
                width,
                padding: pad,
                background: layout.bodyColor,
                color: layout.textColor,
                fontFamily: layout.fontFamily,
                fontSize: layout.fontSize,
                lineHeight: layout.lineHeight,
                ["--email-link" as string]: layout.linkColor,
              }}
            >
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>
      <MediaModal
        kind="image"
        open={media}
        onClose={() => setMedia(false)}
        onPick={(item: PickedMedia) => {
          const src = item.url ?? publicCoverUrl(item.path) ?? "";
          if (src) editor.chain().focus().setImage({ src, alt: item.alt ?? "" }).run();
          setMedia(false);
          setPop(null);
        }}
      />
    </div>
  );
}

function Tb({ on, active, label, children }: { on: () => void; active?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm ${active ? "bg-primary/10 text-primary" : "hover:bg-surface"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onPop, onMedia }: { editor: Editor; onPop: (p: Pop) => void; onMedia: () => void }) {
  const c = () => editor.chain().focus();
  const block = editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p";
  const sel = "h-8 rounded-md border border-border bg-surface px-2 text-xs";
  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-surface-2 p-2">
      <Tb label="Undo" on={() => c().undo().run()}>↶</Tb>
      <Tb label="Redo" on={() => c().redo().run()}>↷</Tb>
      <select aria-label="Text style" className={sel} value={block} onChange={(e) => {
        const v = e.target.value;
        if (v === "p") c().setParagraph().run();
        else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
      }}>
        <option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
      </select>
      <select aria-label="Font" className={sel} value={(editor.getAttributes("textStyle").fontFamily as string) ?? ""} onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}>
        <option value="">Font</option>
        {EMAIL_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select aria-label="Font size" className={sel} value={(editor.getAttributes("textStyle").fontSize as string) ?? ""} onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}>
        <option value="">Size</option>
        {FONT_SIZES.map((s) => <option key={s} value={`${s}px`}>{s}</option>)}
      </select>
      <Tb label="Bold" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><b>B</b></Tb>
      <Tb label="Italic" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><i>I</i></Tb>
      <Tb label="Underline" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()}><u>U</u></Tb>
      <Tb label="Strikethrough" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><s>S</s></Tb>
      <label className="relative inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md text-sm hover:bg-surface" title="Text colour">
        A<input type="color" aria-label="Text colour" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => c().setColor(e.target.value).run()} />
      </label>
      <label className="relative inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md text-sm hover:bg-surface" title="Highlight">
        ▮<input type="color" aria-label="Highlight colour" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => c().setBackgroundColor(e.target.value).run()} />
      </label>
      <Tb label="Align left" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}>⟸</Tb>
      <Tb label="Align centre" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}>⟺</Tb>
      <Tb label="Align right" active={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()}>⟹</Tb>
      <Tb label="Bulleted list" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}>•</Tb>
      <Tb label="Numbered list" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}>1.</Tb>
      <Tb label="Link" active={editor.isActive("link")} on={() => onPop("link")}>Link</Tb>
      <Tb label="Image" on={() => onPop("image")}>Image</Tb>
      <Tb label="Button" on={() => onPop("button")}>Button</Tb>
      <Tb label="Divider" on={() => c().setHorizontalRule().run()}>―</Tb>
      <select aria-label="Insert a personal detail" className={sel} value="" onChange={(e) => {
        if (e.target.value) c().insertContent([{ type: "mergeTag", attrs: { key: e.target.value } }, { type: "text", text: " " }]).run();
      }}>
        <option value="">Insert detail</option>
        {MERGE_KEYS.map((k) => <option key={k} value={k}>{MERGE_LABELS[k]}</option>)}
      </select>
      <Tb label="Clear formatting" on={() => c().unsetAllMarks().clearNodes().run()}>Tx</Tb>
      <button type="button" className="hidden" onClick={onMedia} aria-hidden="true" tabIndex={-1} />
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold">{label}</label>
      {children}
    </div>
  );
}
const input = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

function PopShell({ title, children, onClose, onApply, apply }: { title: string; children: React.ReactNode; onClose: () => void; onApply: () => void; apply: string }) {
  return (
    <div role="dialog" aria-label={title} className="grid gap-3 border-b border-border bg-surface p-3 sm:grid-cols-2">
      {children}
      <div className="flex items-end justify-end gap-2 sm:col-span-2">
        <button type="button" className="rounded-full border border-border px-3 py-1.5 text-xs" onClick={onClose}>Cancel</button>
        <button type="button" className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg" onClick={onApply}>{apply}</button>
      </div>
    </div>
  );
}

function LinkPop({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { from, to } = editor.state.selection;
  const [text, setText] = useState(editor.state.doc.textBetween(from, to, " "));
  const [href, setHref] = useState((editor.getAttributes("link").href as string) ?? "https://");
  const apply = () => {
    const url = href.trim();
    if (!url || url === "https://") return onClose();
    if (from === to) {
      editor.chain().focus().insertContent({ type: "text", text: text || url, marks: [{ type: "link", attrs: { href: url, target: "_blank" } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run();
    }
    onClose();
  };
  return (
    <PopShell title="Link" onClose={onClose} onApply={apply} apply="Apply">
      <Field id="pp-link-text" label="Text"><input id="pp-link-text" className={input} value={text} onChange={(e) => setText(e.target.value)} disabled={from !== to} /></Field>
      <Field id="pp-link-href" label="Web address"><input id="pp-link-href" className={input} value={href} onChange={(e) => setHref(e.target.value)} /></Field>
      {editor.isActive("link") && (
        <button type="button" className="text-left text-xs text-muted underline" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }}>Remove link</button>
      )}
    </PopShell>
  );
}

function ImagePop({ editor, onClose, onLibrary }: { editor: Editor; onClose: () => void; onLibrary: () => void }) {
  const editing = editor.isActive("image");
  const current = editor.getAttributes("image") as { src?: string; alt?: string; widthPct?: number; href?: string | null };
  const [src, setSrc] = useState(current.src ?? "");
  const [alt, setAlt] = useState(current.alt ?? "");
  const [width, setWidth] = useState(current.widthPct ?? 100);
  const [href, setHref] = useState(current.href ?? "");
  const apply = () => {
    const attrs = { src: src.trim(), alt, widthPct: Math.min(100, Math.max(10, width)), href: href.trim() || null };
    if (!attrs.src) return onClose();
    if (editing) editor.chain().focus().updateAttributes("image", attrs).run();
    else editor.chain().focus().insertContent({ type: "image", attrs }).run();
    onClose();
  };
  return (
    <PopShell title="Image" onClose={onClose} onApply={apply} apply={editing ? "Update" : "Insert"}>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <button type="button" className="w-fit rounded-full border border-border px-3 py-1.5 text-xs" onClick={onLibrary}>Choose or upload from the media library</button>
      </div>
      <Field id="pp-img-src" label="Or a web address"><input id="pp-img-src" className={input} value={src} placeholder="https://" onChange={(e) => setSrc(e.target.value)} /></Field>
      <Field id="pp-img-alt" label="Description (shown if images are blocked)"><input id="pp-img-alt" className={input} value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
      <Field id="pp-img-width" label="Width (%)"><input id="pp-img-width" type="number" min={10} max={100} step={5} className={input} value={width} onChange={(e) => setWidth(Number(e.target.value) || 100)} /></Field>
      <Field id="pp-img-href" label="Link the image to (optional)"><input id="pp-img-href" className={input} value={href} placeholder="https://" onChange={(e) => setHref(e.target.value)} /></Field>
    </PopShell>
  );
}

function ButtonPop({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const editing = editor.isActive("emailButton");
  const current = editor.getAttributes("emailButton") as { label?: string; href?: string; color?: string; align?: string };
  const [label, setLabel] = useState(current.label ?? "Open your library");
  const [href, setHref] = useState(current.href ?? "{{access_link}}");
  const [color, setColor] = useState(current.color ?? "#c8653d");
  const [align, setAlign] = useState(current.align ?? "left");
  const apply = () => {
    const attrs = { label: label.trim() || "Open", href: href.trim() || "{{access_link}}", color, align };
    if (editing) editor.chain().focus().updateAttributes("emailButton", attrs).run();
    else editor.chain().focus().insertContent({ type: "emailButton", attrs }).run();
    onClose();
  };
  return (
    <PopShell title="Button" onClose={onClose} onApply={apply} apply={editing ? "Update" : "Insert"}>
      <Field id="pp-btn-label" label="Label"><input id="pp-btn-label" className={input} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field id="pp-btn-href" label="Web address"><input id="pp-btn-href" className={input} value={href} onChange={(e) => setHref(e.target.value)} /></Field>
      <Field id="pp-btn-color" label="Colour"><input id="pp-btn-color" type="color" className="h-9 w-12 rounded-lg border border-border" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      <Field id="pp-btn-align" label="Position"><select id="pp-btn-align" className={input} value={align} onChange={(e) => setAlign(e.target.value)}><option value="left">Left</option><option value="center">Centre</option></select></Field>
    </PopShell>
  );
}
```

- [ ] **Step 7: Append the canvas styles**

Append to `app/globals.css`:

```css
/* Post-purchase email canvas (components/admin/email-editor.tsx). The email's
   own colours come from inline styles; these only shape the elements. */
.email-canvas .email-canvas-body { outline: none; min-height: 12rem; overflow-wrap: anywhere; }
.email-canvas h1 { font-size: 26px; line-height: 1.25; margin: 0 0 14px; font-weight: 700; }
.email-canvas h2 { font-size: 20px; line-height: 1.3; margin: 22px 0 10px; font-weight: 700; }
.email-canvas h3 { font-size: 17px; line-height: 1.35; margin: 18px 0 8px; font-weight: 700; }
.email-canvas p { margin: 0 0 14px; }
.email-canvas ul, .email-canvas ol { margin: 0 0 14px; padding-left: 22px; }
.email-canvas ul { list-style: disc; }
.email-canvas ol { list-style: decimal; }
.email-canvas li { margin: 0 0 6px; }
.email-canvas a { color: var(--email-link); text-decoration: underline; }
.email-canvas img { max-width: 100%; height: auto; display: block; border-radius: 6px; }
.email-canvas img.ProseMirror-selectednode { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.email-canvas hr { border: 0; border-top: 1px solid #e4e1d9; margin: 22px 0; }
.email-canvas .email-button { margin: 22px 0; }
.email-canvas .email-button span { display: inline-block; padding: 13px 24px; border-radius: 6px; color: #fff; font-weight: 600; }
.email-canvas .email-button.ProseMirror-selectednode span { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.email-canvas .merge-tag { background: #fbe9e1; color: #9a4526; border-radius: 4px; padding: 0 4px; font-size: .92em; white-space: nowrap; }
```

- [ ] **Step 8: Typecheck, lint and run the test**

Run: `npx tsc --noEmit && npx eslint components/admin/email-editor.tsx lib/email-editor-extensions.ts && npx vitest run lib/email-editor-extensions.test.ts`
Expected: tsc exit 0, no lint errors, 3 tests PASS. Remove the unused hidden button in `Toolbar` if lint flags it (the Image pop-over already opens the library).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json lib/email-editor-extensions.ts lib/email-editor-extensions.test.ts components/admin/email-editor.tsx app/globals.css
git commit -m "Email editor: fonts, sizes, colours, links, images, buttons and personal details

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Admin section, actions and pages

**Files:**
- Create: `app/admin/post-purchase/actions.ts`, `components/admin/post-purchase-section.tsx`
- Modify: `app/admin/offers/[id]/page.tsx` (before the `DuplicateButton` row), `app/admin/products/[id]/page.tsx` (same place)
- Test: `components/admin/post-purchase-section.test.tsx`, `lib/post-purchase-actions.test.ts`

**Interfaces:**
- Consumes: `getSequence`, `saveSequence`, `saveInputSchema`, `Sequence`, `OwnerType` (Task 6); `renderPostPurchaseEmail` (Task 3); `sendEmail` (Task 4); `EmailEditor` (Task 9); `starterDoc`, `LAYOUT_DEFAULTS`, `EMAIL_FONTS`, `fillLine`, `DELAY_UNITS`, `EmailLayout`, `DocNode`, `DelayUnit` (Task 2); `requireAdmin` (`@/lib/admin-guard`); `getSettingsOrDefaults` (`@/lib/settings`).
- Produces:
  - `savePostPurchaseAction(input: unknown): Promise<{ ok: true; emailIds: string[] } | { ok: false; error: string }>`
  - `sendPostPurchaseTestAction(input: unknown): Promise<{ ok: true; to: string } | { ok: false; error: string }>`
  - `PostPurchaseSection` props: `{ ownerType: OwnerType; ownerId: string; ownerName: string; initial: Sequence }`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/post-purchase-actions.test.ts
import { it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const guard = vi.hoisted(() => ({ admin: false }));
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: async () => {
    if (!guard.admin) throw new Error("NEXT_REDIRECT /login");
    return { id: "u", email: "admin@example.com" };
  },
}));
const save = vi.hoisted(() => vi.fn(async () => ({ ok: true, emailIds: [] })));
vi.mock("@/lib/post-purchase-store", async (orig) => ({ ...(await orig<typeof import("@/lib/post-purchase-store")>()), saveSequence: save }));
const send = vi.hoisted(() => vi.fn(async () => "sent"));
vi.mock("@/lib/email", () => ({ sendEmail: send }));
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({ postPurchaseEmail: { accessUrl: "https://x.co/login", senderName: "", senderEmail: "s@x.co", replyTo: "" } }),
}));

const { savePostPurchaseAction, sendPostPurchaseTestAction } = await import("@/app/admin/post-purchase/actions");
beforeEach(() => {
  guard.admin = false;
  save.mockClear();
  send.mockClear();
});

it.each([
  ["save", () => savePostPurchaseAction({})],
  ["send a test", () => sendPostPurchaseTestAction({})],
])("someone who is not an admin cannot %s", async (_, call) => {
  await expect(call()).rejects.toThrow(/NEXT_REDIRECT/);
  expect(save).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("refuses a malformed sequence before it reaches the database", async () => {
  guard.admin = true;
  const res = await savePostPurchaseAction({ ownerType: "course", ownerId: "x", enabled: true, layout: {}, emails: [] });
  expect(res.ok).toBe(false);
  expect(save).not.toHaveBeenCalled();
});
```

```tsx
// components/admin/post-purchase-section.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const save = vi.hoisted(() => vi.fn(async () => ({ ok: true, emailIds: ["e1"] })));
vi.mock("@/app/admin/post-purchase/actions", () => ({
  savePostPurchaseAction: save,
  sendPostPurchaseTestAction: vi.fn(async () => ({ ok: true, to: "me@x.co" })),
}));
// The TipTap canvas is tested on its own; here a stand-in keeps the section's own logic in view.
vi.mock("@/components/admin/email-editor", () => ({ EmailEditor: () => <div data-testid="editor" /> }));

import { PostPurchaseSection } from "@/components/admin/post-purchase-section";
import { LAYOUT_DEFAULTS } from "@/lib/post-purchase-layout";

let root: Root | null = null;
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  save.mockClear();
});

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <PostPurchaseSection ownerType="offer" ownerId="11111111-1111-4111-8111-111111111111" ownerName="Funnel App" initial={{ id: null, enabled: false, layout: LAYOUT_DEFAULTS, emails: [] }} />,
    );
  });
  return host;
}
const click = (el: Element | null) => act(() => (el as HTMLElement).click());

describe("the post-purchase section", () => {
  it("is off by default and shows no editor", () => {
    const host = mount();
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(host.querySelector('[data-testid="editor"]')).toBeNull();
  });

  it("turning it on starts email 1 from the starter, right after the welcome", () => {
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
    expect(host.textContent).toContain("Right after the welcome email");
    expect((host.querySelector("#pp-subject") as HTMLInputElement).value).toBe("{{first_name}}, thank you for getting Funnel App");
  });

  it("adds a follow-up two days after the one before, and saves the whole sequence", async () => {
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "+ Add email")!);
    expect(host.textContent).toContain("2 days after email 1");
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    const payload = save.mock.calls[0][0] as { enabled: boolean; emails: { delayAmount: number; delayUnit: string }[] };
    expect(payload.enabled).toBe(true);
    expect(payload.emails.map((e) => [e.delayAmount, e.delayUnit])).toEqual([[0, "days"], [2, "days"]]);
  });

  it("shows the reason when a save is refused", async () => {
    save.mockResolvedValueOnce({ ok: false, error: "Email 2 needs a subject line." } as never);
    const host = mount();
    click(host.querySelector('input[type="checkbox"]'));
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Email 2 needs a subject line.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/post-purchase-actions.test.ts components/admin/post-purchase-section.test.tsx`
Expected: FAIL, missing files.

- [ ] **Step 3: Implement the actions**

```ts
// app/admin/post-purchase/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { saveInputSchema, saveProblem, saveSequence } from "@/lib/post-purchase-store";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { sendEmail } from "@/lib/email";
import { getSettingsOrDefaults } from "@/lib/settings";

export async function savePostPurchaseAction(input: unknown) {
  await requireAdmin();
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Something in this sequence is out of range. Check the widths, sizes and delays." };
  const res = await saveSequence(parsed.data);
  if (res.ok) revalidatePath(parsed.data.ownerType === "offer" ? `/admin/offers/${parsed.data.ownerId}` : `/admin/products/${parsed.data.ownerId}`);
  return res;
}

const testSchema = z.object({ sequence: saveInputSchema, index: z.number().int().min(0).max(19), ownerName: z.string().max(200) });

/** The selected email, as drafted, to the admin's own address with sample details. */
export async function sendPostPurchaseTestAction(input: unknown) {
  const admin = await requireAdmin();
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That email could not be read. Save and try again." };
  const { sequence, index, ownerName } = parsed.data;
  const email = sequence.emails[index];
  if (!email) return { ok: false as const, error: "Choose an email to test." };
  const problem = saveProblem({ ...sequence, emails: [email] });
  if (problem) return { ok: false as const, error: problem.replace("Email 1", `Email ${index + 1}`) };
  const to = admin.email;
  if (!to) return { ok: false as const, error: "Your admin account has no email address." };
  const settings = (await getSettingsOrDefaults()).postPurchaseEmail;
  const mail = renderPostPurchaseEmail({
    doc: email.doc,
    subject: `[Test] ${email.subject}`,
    preheader: email.preheader,
    layout: sequence.layout,
    vars: { first_name: "Priya", offer_name: ownerName, access_link: settings.accessUrl },
    stopUrl: index > 0 ? `${settings.accessUrl}#test-stop-link` : null,
  });
  const res = await sendEmail(to, mail, { from: settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail, replyTo: settings.replyTo });
  if (res !== "sent") return { ok: false as const, error: res === "disabled" ? "Email sending is not set up on this server." : "The email provider refused it. Try again in a minute." };
  return { ok: true as const, to };
}
```

- [ ] **Step 4: Implement the section**

```tsx
// components/admin/post-purchase-section.tsx
"use client";

import { useMemo, useState } from "react";
import { EmailEditor } from "@/components/admin/email-editor";
import { savePostPurchaseAction, sendPostPurchaseTestAction } from "@/app/admin/post-purchase/actions";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { EMAIL_FONTS, LAYOUT_DEFAULTS, fillLine, starterDoc, type DelayUnit, type DocNode, type EmailLayout } from "@/lib/post-purchase-layout";
import type { OwnerType, Sequence } from "@/lib/post-purchase-store";

type Draft = { key: string; id: string | null; delayAmount: number; delayUnit: DelayUnit; subject: string; preheader: string; doc: DocNode };
const SAMPLE = (name: string) => ({ first_name: "Priya", offer_name: name, access_link: "https://grow.greaterinside.com/login" });
let seq = 0;
const newKey = () => `e${Date.now()}${seq++}`;

function when(d: Draft, i: number) {
  if (i === 0) return "Right after the welcome email";
  const unit = d.delayUnit === "hours" ? (d.delayAmount === 1 ? "hour" : "hours") : d.delayAmount === 1 ? "day" : "days";
  return `${d.delayAmount} ${unit} after email ${i}`;
}

/**
 * Post-purchase emails for one offer or product. Off until turned on; the
 * first email goes right after the store's welcome, each follow-up after its
 * delay. Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 */
export function PostPurchaseSection({ ownerType, ownerId, ownerName, initial }: { ownerType: OwnerType; ownerId: string; ownerName: string; initial: Sequence }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [layout, setLayout] = useState<EmailLayout>(initial.layout);
  const [emails, setEmails] = useState<Draft[]>(initial.emails.map((e) => ({ ...e, key: newKey() })));
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const current = emails[idx];
  const patch = (p: Partial<Draft>) => setEmails((all) => all.map((e, i) => (i === idx ? { ...e, ...p } : e)));

  const turn = (on: boolean) => {
    setEnabled(on);
    if (on && emails.length === 0) {
      setEmails([{ key: newKey(), id: null, delayAmount: 0, delayUnit: "days", subject: `{{first_name}}, thank you for getting ${ownerName}`, preheader: "Everything is ready in your library.", doc: starterDoc(ownerName) }]);
      setIdx(0);
    }
  };
  const add = () => {
    setEmails((all) => [...all, { key: newKey(), id: null, delayAmount: 2, delayUnit: "days", subject: "", preheader: "", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Write your follow-up here." }] }] } }]);
    setIdx(emails.length);
  };
  const move = (to: number) => {
    setEmails((all) => {
      const next = [...all];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
    setIdx(to);
  };
  const remove = () => {
    setEmails((all) => all.filter((_, i) => i !== idx));
    setIdx((i) => Math.max(0, i - 1));
  };

  const payload = () => ({
    ownerType,
    ownerId,
    enabled,
    layout,
    emails: emails.map((e, i) => ({ id: e.id, delayAmount: i === 0 ? 0 : e.delayAmount, delayUnit: e.delayUnit, subject: e.subject, preheader: e.preheader, doc: e.doc })),
  });

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const res = await savePostPurchaseAction(payload());
    setBusy(false);
    if (!res.ok) return setStatus({ kind: "error", text: res.error });
    setEmails((all) => all.map((e, i) => ({ ...e, id: res.emailIds[i] ?? e.id })));
    setStatus({ kind: "ok", text: "Saved." });
  };
  const test = async () => {
    setBusy(true);
    setStatus(null);
    const res = await sendPostPurchaseTestAction({ sequence: payload(), index: idx, ownerName });
    setBusy(false);
    setStatus(res.ok ? { kind: "ok", text: `Test sent to ${res.to}.` } : { kind: "error", text: res.error });
  };

  const rendered = useMemo(
    () => (current && preview ? renderPostPurchaseEmail({ doc: current.doc, subject: current.subject, preheader: current.preheader, layout, vars: SAMPLE(ownerName), stopUrl: idx > 0 ? "https://grow.greaterinside.com/email/stop" : null }) : null),
    [current, preview, layout, ownerName, idx],
  );

  const num = (k: keyof EmailLayout, v: string) => setLayout((l) => ({ ...l, [k]: Number(v) }));
  const inputCls = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

  return (
    <section className="rounded-2xl border border-border bg-surface" aria-labelledby="pp-title">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <h2 id="pp-title" className="text-base font-semibold">
            Post-purchase emails{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-emerald-600/10 text-emerald-700" : "bg-surface-2 text-muted"}`}>{enabled ? "On" : "Off"}</span>
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            Emails sent to the buyer after they buy this, in addition to the store&rsquo;s welcome email. The first goes right after the welcome. Add follow-ups with a delay between each.
          </p>
        </div>
        <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer">
          <input type="checkbox" className="peer sr-only" checked={enabled} onChange={(e) => turn(e.target.checked)} aria-label={`Send post-purchase emails for ${ownerName}`} />
          <span className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      {!enabled && emails.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-muted">Nothing extra is sent for this. Turn it on to write the email; a starter email is filled in for you to edit.</p>
      ) : (
        current && (
          <>
            <div className="grid gap-3 border-t border-border px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Emails in this sequence</h3>
                <span className="text-xs text-muted">The rest stop if the order is refunded, access ends, or the buyer clicks Stop these emails.</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Emails in this sequence">
                {emails.map((e, i) => (
                  <button key={e.key} type="button" role="tab" aria-selected={i === idx} onClick={() => { setIdx(i); setPreview(false); }}
                    className={`grid w-52 shrink-0 gap-0.5 rounded-xl border p-3 text-left ${i === idx ? "border-primary bg-primary/5" : "border-border hover:border-primary"}`}>
                    <span className="text-[11px] font-semibold text-muted">Email {i + 1}</span>
                    <span className="text-xs font-semibold text-primary">{when(e, i)}</span>
                    <span className="truncate text-sm">{e.subject || "(no subject yet)"}</span>
                  </button>
                ))}
                <button type="button" onClick={add} className="w-36 shrink-0 rounded-xl border border-dashed border-border text-sm text-muted hover:border-primary hover:text-primary">+ Add email</button>
              </div>
            </div>

            <div className="grid border-t border-border lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid min-w-0 content-start gap-4 p-5">
                <div className="grid gap-1.5">
                  <label htmlFor="pp-subject" className="text-xs font-semibold">Subject line</label>
                  <div className="flex gap-2">
                    <input id="pp-subject" className={inputCls} maxLength={200} value={current.subject} onChange={(e) => patch({ subject: e.target.value })} />
                    <button type="button" className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 text-xs" onClick={() => patch({ subject: `{{first_name}} ${current.subject}`.trim() })}>+ First name</button>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="pp-preheader" className="text-xs font-semibold">Preview text</label>
                  <input id="pp-preheader" className={inputCls} maxLength={200} value={current.preheader} onChange={(e) => patch({ preheader: e.target.value })} />
                  <span className="text-xs text-muted">The grey line after the subject in most inboxes. Optional.</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
                  <b>Email {idx + 1}</b>
                  {idx === 0 ? (
                    <span>Sent right after the welcome email, once checkout is over.</span>
                  ) : (
                    <>
                      <span>Send</span>
                      <input aria-label="Delay" type="number" min={1} max={365} className="w-20 rounded-lg border border-border bg-surface px-2 py-1" value={current.delayAmount} onChange={(e) => patch({ delayAmount: Math.max(1, Number(e.target.value) || 1) })} />
                      <select aria-label="Delay unit" className="rounded-lg border border-border bg-surface px-2 py-1" value={current.delayUnit} onChange={(e) => patch({ delayUnit: e.target.value as DelayUnit })}>
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                      <span>after email {idx}</span>
                      <span className="flex-1" />
                      <button type="button" className="rounded-md px-2 py-1 disabled:opacity-40" disabled={idx <= 1} onClick={() => move(idx - 1)} aria-label="Move earlier">↑</button>
                      <button type="button" className="rounded-md px-2 py-1 disabled:opacity-40" disabled={idx >= emails.length - 1} onClick={() => move(idx + 1)} aria-label="Move later">↓</button>
                      <button type="button" className="text-xs text-muted underline" onClick={remove}>Delete email</button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Width">
                    {(["desktop", "mobile"] as const).map((v) => (
                      <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>{v === "desktop" ? "Desktop" : "Mobile"}</button>
                    ))}
                  </div>
                  <div className="inline-flex rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Mode">
                    <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={`rounded-full px-3 py-1 ${!preview ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>Edit</button>
                    <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={`rounded-full px-3 py-1 ${preview ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>Preview as Priya</button>
                  </div>
                </div>

                {preview && rendered ? (
                  <iframe title="Email preview" srcDoc={rendered.html} className="mx-auto h-[640px] w-full rounded-xl border border-border bg-white" style={{ maxWidth: view === "mobile" ? 375 : "100%" }} />
                ) : (
                  <EmailEditor doc={current.doc} docKey={current.key} onChange={(doc) => patch({ doc })} layout={layout} view={view} />
                )}
              </div>

              <aside className="grid content-start gap-5 border-t border-border p-5 lg:border-l lg:border-t-0" aria-label="Email layout">
                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold">Inbox preview</h3>
                  <div className="grid gap-0.5 rounded-xl border border-border p-3 text-sm">
                    <span className="font-semibold">Ajit from Greater Inside</span>
                    <span>{fillLine(current.subject, SAMPLE(ownerName)) || "(no subject yet)"}</span>
                    <span className="truncate text-xs text-muted">{fillLine(current.preheader, SAMPLE(ownerName)) || "Preview text shows here"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <h3 className="col-span-2 text-sm font-semibold">Body width</h3>
                  {([["desktopWidth", "Desktop max (px)", 320, 900], ["mobileWidthPct", "Mobile max (%)", 60, 100], ["desktopPadding", "Desktop padding (px)", 0, 64], ["mobilePadding", "Mobile padding (px)", 0, 48]] as const).map(([k, label, min, max]) => (
                    <div key={k} className="grid gap-1">
                      <label htmlFor={`pp-${k}`} className="text-xs font-semibold">{label}</label>
                      <input id={`pp-${k}`} type="number" min={min} max={max} className={inputCls} value={layout[k]} onChange={(e) => num(k, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="grid gap-2.5">
                  <h3 className="text-sm font-semibold">Defaults for this email</h3>
                  <label htmlFor="pp-font" className="text-xs font-semibold">Font</label>
                  <select id="pp-font" className={inputCls} value={layout.fontFamily} onChange={(e) => setLayout((l) => ({ ...l, fontFamily: e.target.value as EmailLayout["fontFamily"] }))}>
                    {EMAIL_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="grid gap-1"><label htmlFor="pp-size" className="text-xs font-semibold">Text size (px)</label><input id="pp-size" type="number" min={12} max={22} className={inputCls} value={layout.fontSize} onChange={(e) => num("fontSize", e.target.value)} /></div>
                    <div className="grid gap-1"><label htmlFor="pp-lh" className="text-xs font-semibold">Line height</label><input id="pp-lh" type="number" min={1.2} max={2} step={0.1} className={inputCls} value={layout.lineHeight} onChange={(e) => num("lineHeight", e.target.value)} /></div>
                  </div>
                  {([["textColor", "Text"], ["linkColor", "Links and buttons"], ["bodyColor", "Email body"], ["backgroundColor", "Background around it"]] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-xs text-muted">
                      <input type="color" className="h-8 w-10 rounded-lg border border-border" value={layout[k]} onChange={(e) => setLayout((l) => ({ ...l, [k]: e.target.value }))} aria-label={label} />
                      {label}
                    </label>
                  ))}
                  <button type="button" className="w-fit text-xs text-muted underline" onClick={() => setLayout(LAYOUT_DEFAULTS)}>Reset layout to defaults</button>
                </div>
              </aside>
            </div>
          </>
        )
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
        <div className="flex items-center gap-3">
          {enabled && current && (
            <button type="button" disabled={busy} onClick={test} className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary disabled:opacity-50">Send a test to me</button>
          )}
          {status && (
            <span role={status.kind === "error" ? "alert" : "status"} className={`text-sm ${status.kind === "error" ? "text-primary" : "text-muted"}`}>{status.text}</span>
          )}
        </div>
        <button type="button" disabled={busy} onClick={save} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50">Save</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Mount on both pages**

In `app/admin/offers/[id]/page.tsx` add imports:

```ts
import { PostPurchaseSection } from "@/components/admin/post-purchase-section";
import { getSequence } from "@/lib/post-purchase-store";
```

and, immediately before `<div className="flex justify-end">` that holds `DuplicateButton`, add:

```tsx
      <PostPurchaseSection ownerType="offer" ownerId={offer.id} ownerName={offer.name} initial={await getSequence("offer", offer.id)} />
```

In `app/admin/products/[id]/page.tsx`, the same imports, and before its `DuplicateButton` row:

```tsx
      <PostPurchaseSection ownerType="product" ownerId={product.id} ownerName={product.title} initial={await getSequence("product", product.id)} />
```

- [ ] **Step 6: Run the tests, tsc and lint**

Run: `npx vitest run lib/post-purchase-actions.test.ts components/admin/post-purchase-section.test.tsx lib/admin-access.test.ts && npx tsc --noEmit && npx eslint components/admin/post-purchase-section.tsx app/admin/post-purchase/actions.ts "app/admin/offers/[id]/page.tsx" "app/admin/products/[id]/page.tsx"`
Expected: PASS (3 + 4 + existing); tsc exit 0; no lint errors.

- [ ] **Step 7: Commit**

```bash
git add app/admin/post-purchase/actions.ts components/admin/post-purchase-section.tsx components/admin/post-purchase-section.test.tsx lib/post-purchase-actions.test.ts "app/admin/offers/[id]/page.tsx" "app/admin/products/[id]/page.tsx"
git commit -m "Post-purchase emails section on every offer and product

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verify end to end, document, hand over

**Files:**
- Modify: `docs/lessons.md` (append)

- [ ] **Step 1: See it signed in**

Start the dev server (`preview_start` "gi-membership dev"). Seed a local admin the way the members-table check did (auth user + `users.is_admin = true`, `@supabase/ssr` cookie `sb-127-auth-token`), open `/admin/offers/<a local offer id>` headless at 1440 and 390 wide, and screenshot the section: off state; turn on; the starter email in the canvas; add an email; Mobile view; Preview as Priya. Fix what the screenshots show. Delete the seeded rows afterwards.

- [ ] **Step 2: Send one real test locally**

With `RESEND_API_KEY` set in `.env.local` (skip this step and say so if it is not), click "Send a test to me" and read the email in Gmail on desktop and phone. Check the width, the button, and that images load.

- [ ] **Step 3: Record the lesson**

Append to `docs/lessons.md`:

```markdown
## Post-purchase sequences: the editor and the renderer share one schema (30 Sep 2026)

Every node and mark `lib/email-editor-extensions.ts` can put in a document
has a branch in `lib/post-purchase-render.ts`, and
`lib/email-editor-extensions.test.ts` round-trips through both. Add a
toolbar feature and it must be added in both files, or the owner sees it in
the editor and the buyer never gets it. Sequences are queued by
`sendPostPurchaseIfDue` at checkout-over whatever the welcome's own switch
says, and sent by the retry cron; a follow-up is queued only when the one
before it is sent, so edits reach buyers mid-sequence.
```

- [ ] **Step 4: Full suite, tsc, lint**

Run: `set -o pipefail; npx vitest run; echo "SUITE=$?"; npx tsc --noEmit; npx eslint .`
Expected: `SUITE=0`, tsc exit 0, no new lint errors. If only `lib/product-recurring.integration.test.ts` fails on a hook timeout, run it alone and run the suite again for a clean exit before any push.

- [ ] **Step 5: Commit**

```bash
git add docs/lessons.md
git commit -m "Lesson: the email editor and renderer share one schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand over for release (do not push)**

Report to the owner: what was built, the screenshots, the test email result, and the release steps they approve:
1. Apply `supabase/migrations/0091_post_purchase_sequences.sql` to production, then `notify pgrst, 'reload schema';`, and confirm the three tables exist and `anon` cannot select from them.
2. On the owner's "push it": the 60-second deploy notice, wait, push, watch CI, wait for the image tag.
3. Turn a sequence on for one offer, send a test, then watch the first real buyer's `post_purchase_sends` rows go `pending` then `sent`.
