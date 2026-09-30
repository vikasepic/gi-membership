# Post-purchase Flows (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a store-wide follow-up series after the welcome email, and move every post-purchase sequence to one flow per buyer, so a stop pauses everything for that buyer and their next purchase resumes it.

**Architecture:** Migration 0091 (not yet in production) is reshaped: sequences gain owner type `store`, a new `post_purchase_flows` table holds one row per buyer per sequence (running, paused, done, with a run counter), sends hang off the flow, and `orders.post_purchase_flows_at` marks an order processed. `startFlowsForOrder` replaces `queueSequencesForOrder` and applies the spec's rules table; the send loop checks the flow before every send; the stop link pauses all of a buyer's flows. The admin section gains a store mode, mounted in Settings under the welcome email.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + PostgREST via supabase-js), zod 4, vitest (+ jsdom), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md`, Part 2 (at the end of the file). Part 2 wins where it contradicts Part 1. Branch: `post-purchase-sequences` (Part 1 is already built on it).

## Global Constraints

- Migration `0091_post_purchase_sequences.sql` is edited in place: it has not reached production. Locally it is dropped and re-applied (Task 1). Production gets it by hand before the image, then `notify pgrst, 'reload schema';` (in the file).
- Nothing is pushed. Never touch production.
- The rules table is the requirement, verbatim from the spec:

  | Event | Store series | Flow for an item in this purchase | The buyer's other flows |
  |---|---|---|---|
  | Purchase, no flow yet | Starts (series on, at least one email) | Starts | none |
  | Purchase, flow running | Carries on | Carries on, no second copy | Unchanged |
  | Purchase, flow paused | Resumes | Resumes | Resume |
  | Purchase, flow done | Stays done | Starts again from the start | Unchanged |
  | "Stop these emails" | Paused | Paused | Paused |

- A buyer is their order email, trimmed and lower-cased (`buyerKey`).
- Store series: every email waits its own delay, at least one hour, after the purchase (email 1) or the one before. Item flows: email 1 a minute after checkout.
- A resumed flow's next email waits its own delay from the resuming purchase, never less than a minute.
- A purchase is a paid order with at least one line whose kind is not `renewal`. An order is processed for flows at most once (`orders.post_purchase_flows_at`).
- The welcome email goes on every purchase and is never affected by a stop.
- Stop page copy: GET "Stop these emails? You won't get any more follow-up emails from us until you buy again." POST "Done. You won't get any more of these emails."
- Integration suites: `describe.skipIf(!canRun)`, fixtures prefixed `zz`, cleanup in `afterAll` in foreign-key order. Tests never overwrite a store series a developer made locally: the store-series tests skip themselves when one exists.
- Between Task 1 and Task 3 the old engine's integration tests fail against the reshaped tables; Task 3 replaces them. Between Task 1 and Task 4 the stop link's old code is broken at runtime; Task 4 replaces it. Do not patch either outside its task.
- User-facing copy: no em dashes, plain words.
- Commit trailer names the model that wrote the commit.

## Review Focus

1. **The thank-you page and the re-queue sweep both process the same order, and the flow finishes in between.** A person expects nothing to start again or double. Pinned in Task 3 (sweep test: a processed order whose flow finished is not processed again).
2. **The same buyer checks out with differently cased emails** ("Priya@x.com", then "priya@x.com"). A person expects one buyer, one flow. Pinned in Task 3.
3. **A buyer clicks stop while an email is queued, then buys again before it was due.** A person expects that email once, after its delay from the new purchase, not twice. Pinned in Task 4.
4. **The owner switches a sequence off while buyers are running or paused.** A person expects nothing more to go out, no crash, and paused buyers left alone. Pinned in Task 3 (switched-off stop rule) and Task 3 (resume skips a switched-off sequence).
5. **A buyer's address contains `_` or `%`.** A person expects "every order refunded" to look at that buyer only, not an address that matches a LIKE pattern. Pinned in Task 3 (store refund test with a near-identical second address).

---

## File structure

| File | Change |
|---|---|
| `supabase/migrations/0091_post_purchase_sequences.sql` | Reshaped: `store` owner type, `post_purchase_flows`, sends by flow, `orders.post_purchase_flows_at`, no `order_items.post_purchase_stopped_at` |
| `lib/post-purchase-schema.integration.test.ts` | New constraint tests |
| `lib/post-purchase-store.ts` | `OwnerType` adds `store`; store emails all need a delay; store keeps email 1's delay |
| `app/admin/post-purchase/actions.ts` | Store saves under this store's id, revalidate Settings; test send stop link for store |
| `lib/post-purchase-sequences.ts` | Rewritten on flows: `startFlowsForOrder`, `requeueMissedSequences`, `sendDueSequenceEmails` |
| `lib/post-purchase-sequences.test.ts`, `lib/post-purchase-sequences.integration.test.ts` | Rewritten |
| `lib/post-purchase-send.ts` | Calls `startFlowsForOrder` |
| `lib/post-purchase-stop.ts`, `app/email/stop/route.ts` | Token names a flow; POST pauses the buyer; new copy |
| `lib/post-purchase-stop.test.ts` | Rewritten |
| `components/admin/post-purchase-section.tsx` | Store mode |
| `components/admin/settings-screen.tsx`, `app/admin/settings/page.tsx` | Store series under the welcome email |
| `docs/DATABASE.md`, `docs/errors-and-retries.md`, `docs/lessons.md` | Documentation |

---

### Task 1: Reshape migration 0091

**Files:**
- Modify: `supabase/migrations/0091_post_purchase_sequences.sql` (whole file)
- Modify: `lib/post-purchase-schema.integration.test.ts` (append tests)
- Modify: `docs/DATABASE.md` (replace the post-purchase section)

**Interfaces:**
- Produces: `post_purchase_sequences.owner_type in ('store','offer','product')`; table `post_purchase_flows(id, store_id, sequence_id, email, status, run, order_id, created_at, updated_at)` unique `(sequence_id, email)`; `post_purchase_sends(id, store_id, flow_id, run, sequence_id, email_id, position, to_email, due_at, status, reason, sent_at, created_at)` unique `(flow_id, run, position)`; column `orders.post_purchase_flows_at`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe.skipIf(!canRun)` block of `lib/post-purchase-schema.integration.test.ts` (it already has a `sequence()` helper that inserts an offer sequence and pushes its owner to `owners`, and cleans up by `owner_id`):

```ts
  it("accepts a store series", async () => {
    const db = createServiceClient();
    const owner = crypto.randomUUID();
    owners.push(owner);
    const r = await db.from("post_purchase_sequences").insert({ store_id: await getStoreId(), owner_type: "store", owner_id: owner });
    expect(r.error).toBeNull();
  });

  async function flow(sequenceId: string, email: string) {
    return createServiceClient()
      .from("post_purchase_flows")
      .insert({ store_id: await getStoreId(), sequence_id: sequenceId, email })
      .select("id, status, run")
      .single();
  }

  it("one flow per buyer per sequence, running and run 1 by default", async () => {
    const s = await sequence();
    const first = await flow(s.id, "zz-flow@example.com");
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ status: "running", run: 1 });
    expect((await flow(s.id, "zz-flow@example.com")).error?.code).toBe("23505");
  });

  it("refuses a buyer email that is not trimmed and lower-cased", async () => {
    const s = await sequence();
    expect((await flow(s.id, "Zz-Flow@example.com")).error?.code).toBe("23514");
    expect((await flow(s.id, " zz-flow@example.com")).error?.code).toBe("23514");
  });

  it("one send per flow, run and step", async () => {
    const db = createServiceClient();
    const s = await sequence();
    const f = (await flow(s.id, "zz-steps@example.com")).data!;
    const row = (run: number, position: number) => ({
      store_id: s.store_id, flow_id: f.id, run, sequence_id: s.id, position, to_email: "zz-steps@example.com", due_at: new Date().toISOString(),
    });
    expect((await db.from("post_purchase_sends").insert(row(1, 1))).error).toBeNull();
    expect((await db.from("post_purchase_sends").insert(row(1, 1))).error?.code).toBe("23505");
    expect((await db.from("post_purchase_sends").insert(row(2, 1))).error).toBeNull();
  });
```

The existing `sequence()` helper selects `"id, enabled"`; change its `.select(...)` to `"id, enabled, store_id"` and its return type to `{ id: string; enabled: boolean; store_id: string }` so the send test can read `store_id`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/post-purchase-schema.integration.test.ts`
Expected: FAIL (`owner_type` check refuses `store`; `post_purchase_flows` does not exist).

- [ ] **Step 3: Rewrite the migration**

Replace the whole of `supabase/migrations/0091_post_purchase_sequences.sql` with:

```sql
-- supabase/migrations/0091_post_purchase_sequences.sql
--
-- Post-purchase email sequences: the store series (sent after the welcome
-- email), and one per offer and per product.
-- Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
--
-- A flow is one buyer (their order email, lower-cased) on one sequence. Sends
-- hang off the flow. "Stop these emails" pauses every flow for that buyer;
-- their next purchase resumes them. Off until an admin turns a sequence on.

create table if not exists post_purchase_sequences (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  owner_type  text not null check (owner_type in ('store', 'offer', 'product')),
  -- The store's own id for the store series.
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

create table if not exists post_purchase_flows (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  sequence_id  uuid not null references post_purchase_sequences(id) on delete cascade,
  -- The buyer: their order email, trimmed and lower-cased.
  email        text not null check (email = lower(btrim(email)) and email <> ''),
  status       text not null default 'running' check (status in ('running', 'paused', 'done')),
  -- Goes up by one when a finished item flow starts again from email 1.
  run          integer not null default 1 check (run >= 1),
  -- The purchase that last started, resumed or restarted it.
  order_id     uuid references orders(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sequence_id, email)
);

create index if not exists post_purchase_flows_buyer_idx on post_purchase_flows (store_id, email);

create table if not exists post_purchase_sends (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  flow_id      uuid not null references post_purchase_flows(id) on delete cascade,
  run          integer not null,
  sequence_id  uuid not null references post_purchase_sequences(id) on delete cascade,
  email_id     uuid references post_purchase_emails(id) on delete set null,
  -- The step within the run: 1st, 2nd, 3rd row queued, sent or skipped.
  position     integer not null check (position >= 1),
  to_email     text not null,
  due_at       timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  reason       text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  -- Queueing the same step twice inserts nothing.
  unique (flow_id, run, position)
);

create index if not exists post_purchase_sends_due_idx
  on post_purchase_sends (due_at) where status = 'pending';

-- Set once an order has been processed for flows, so the re-queue sweep never
-- processes it twice (a flow that finished in between would start again).
alter table orders add column if not exists post_purchase_flows_at timestamptz;

-- Service role only. Supabase grants new tables to anon and authenticated by
-- default; 0067 revoked what existed then, not what is created after.
alter table post_purchase_sequences enable row level security;
alter table post_purchase_emails    enable row level security;
alter table post_purchase_flows     enable row level security;
alter table post_purchase_sends     enable row level security;
revoke all on post_purchase_sequences, post_purchase_emails, post_purchase_flows, post_purchase_sends from anon, authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Re-apply locally and rerun**

The local database has the Part 1 shape, which holds only test fixtures. Drop it and apply the new file (local container only):

```bash
docker exec -i supabase_db_grow_membership psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
drop table if exists post_purchase_sends, post_purchase_flows, post_purchase_emails, post_purchase_sequences cascade;
alter table order_items drop column if exists post_purchase_stopped_at;
SQL
docker exec -i supabase_db_grow_membership psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/0091_post_purchase_sequences.sql
docker exec supabase_db_grow_membership psql -U postgres -d postgres -tAc "select count(*) from information_schema.role_table_grants where table_name like 'post_purchase%' and grantee in ('anon','authenticated');"
npx vitest run lib/post-purchase-schema.integration.test.ts
```
Expected: the grants query prints `0`; the suite PASSES (the original 5 tests plus 4 new).

- [ ] **Step 5: Document**

In `docs/DATABASE.md`, replace the whole section headed `### \`post_purchase_sequences\`, \`post_purchase_emails\`, \`post_purchase_sends\`` (heading and its paragraph) with:

```markdown
### `post_purchase_sequences`, `post_purchase_emails`, `post_purchase_flows`, `post_purchase_sends`

Post-purchase emails (migration 0091, spec
`docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md`).
A sequence belongs to the store (`owner_type` 'store': the series sent after
the welcome email), an offer or a product; it is off by default and holds the
layout. Its emails hold position, delay, subject, preview text and the TipTap
document. A flow is one buyer (order email, lower-cased) on one sequence:
`running`, `paused` (the buyer clicked "Stop these emails", which pauses all
their flows until they buy again) or `done`; `run` counts restarts of an item
flow. A send row is one step of one flow run: `pending` until the 5-minute
retry cron sends it, then `sent`, `skipped` (with `reason`) or `failed`.
`orders.post_purchase_flows_at` marks an order already processed for flows.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0091_post_purchase_sequences.sql lib/post-purchase-schema.integration.test.ts docs/DATABASE.md
git commit -m "0091: store series, one flow per buyer, sends by flow

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 2: The store series can be saved

**Files:**
- Modify: `lib/post-purchase-store.ts`
- Modify: `app/admin/post-purchase/actions.ts`
- Test: `lib/post-purchase-store.test.ts`, `lib/post-purchase-store.integration.test.ts`, `lib/post-purchase-actions.test.ts` (append)

**Interfaces:**
- Produces: `type OwnerType = "store" | "offer" | "product"`; `saveInputSchema.ownerType` accepts `"store"`; `saveProblem` requires a delay of at least 1 on every store email; `saveSequence` keeps a store series' email-1 delay. `savePostPurchaseAction` saves a store series under `getStoreId()` whatever `ownerId` was sent and revalidates `/admin/settings`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/post-purchase-store.test.ts` (it defines `email(over)` and `input(over)` helpers returning `SaveInput` pieces):

```ts
describe("the store series", () => {
  const store = (over: Partial<SaveInput> = {}) => input({ ownerType: "store", ...over });

  it("needs a delay on email 1 too, because the welcome goes first", () => {
    expect(saveProblem(store({ emails: [email({ delayAmount: 0, delayUnit: "hours" })] }))).toMatch(/Email 1 needs a delay of at least 1 hour/);
    expect(saveProblem(store({ emails: [email({ delayAmount: 2 })] }))).toBeNull();
  });
});
```

Append inside the `describe.skipIf(!canRun)` block of `lib/post-purchase-store.integration.test.ts` (it defines `email(subject, delayAmount)` and pushes owners to `owners` for cleanup):

```ts
  it("keeps the store series' first delay: every store email follows the welcome", async () => {
    // A random owner, never this store's own id, so a developer's local store series is never touched.
    const owner = crypto.randomUUID();
    owners.push(owner);
    const r = await saveSequence({ ownerType: "store", ownerId: owner, enabled: true, layout: LAYOUT_DEFAULTS, emails: [email("First", 3)] });
    expect(r.ok).toBe(true);
    expect((await getSequence("store", owner)).emails[0].delayAmount).toBe(3);
  });
```

Append to `lib/post-purchase-actions.test.ts` (it mocks `next/cache`, `@/lib/admin-guard` with a `guard.admin` switch, `@/lib/post-purchase-store` with `saveSequence` as the `save` mock, `@/lib/email` and `@/lib/settings`, and imports the two actions):

```ts
vi.mock("@/lib/store", () => ({ getStoreId: async () => "22222222-2222-4222-8222-222222222222" }));

it("saves the store series under this store, whatever id the page sent, and refreshes Settings", async () => {
  const { revalidatePath } = await import("next/cache");
  const { LAYOUT_DEFAULTS } = await import("@/lib/post-purchase-layout");
  guard.admin = true;
  const res = await savePostPurchaseAction({
    ownerType: "store", ownerId: "11111111-1111-4111-8111-111111111111", enabled: false, layout: LAYOUT_DEFAULTS, emails: [],
  });
  expect(res.ok).toBe(true);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ ownerType: "store", ownerId: "22222222-2222-4222-8222-222222222222" }));
  expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/admin/settings");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/post-purchase-store.test.ts lib/post-purchase-store.integration.test.ts lib/post-purchase-actions.test.ts`
Expected: FAIL (zod refuses owner type `store`; the store delay rule does not exist).

- [ ] **Step 3: Implement in lib/post-purchase-store.ts**

Change the type and schema:

```ts
export type OwnerType = "store" | "offer" | "product";
```

```ts
export const saveInputSchema = z.object({
  ownerType: z.enum(["store", "offer", "product"]),
  ownerId: z.uuid(),
  enabled: z.boolean(),
  layout: layoutSchema,
  emails: z.array(emailInputSchema).max(20),
});
```

In `saveProblem`, replace the delay line with:

```ts
    // An item's email 1 goes right after the welcome; every store email follows it.
    if ((input.ownerType === "store" || i > 0) && e.delayAmount < 1) return `Email ${n} needs a delay of at least 1 ${e.delayUnit === "hours" ? "hour" : "day"}.`;
```

In `saveSequence`, replace the `delay_amount` line in the row mapping with:

```ts
    delay_amount: i === 0 && input.ownerType !== "store" ? 0 : e.delayAmount,
```

- [ ] **Step 4: Implement in app/admin/post-purchase/actions.ts**

Add the import:

```ts
import { getStoreId } from "@/lib/store";
```

Replace `savePostPurchaseAction` with:

```ts
const pathFor = (ownerType: "store" | "offer" | "product", ownerId: string) =>
  ownerType === "store" ? "/admin/settings" : ownerType === "offer" ? `/admin/offers/${ownerId}` : `/admin/products/${ownerId}`;

export async function savePostPurchaseAction(input: unknown) {
  await requireAdmin();
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Something in this sequence is out of range. Check the widths, sizes and delays." };
  // The store series always belongs to this store, whatever the page sent.
  const data = parsed.data.ownerType === "store" ? { ...parsed.data, ownerId: await getStoreId() } : parsed.data;
  const res = await saveSequence(data);
  if (res.ok) revalidatePath(pathFor(data.ownerType, data.ownerId));
  return res;
}
```

In `sendPostPurchaseTestAction`, replace the `stopUrl:` line with:

```ts
    // Every store email carries the stop link; an item's first email does not.
    stopUrl: sequence.ownerType === "store" || index > 0 ? `${settings.accessUrl}#test-stop-link` : null,
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run lib/post-purchase-store.test.ts lib/post-purchase-store.integration.test.ts lib/post-purchase-actions.test.ts lib/admin-access.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exit 0. (`components/admin/post-purchase-section.tsx` still typechecks: widening `OwnerType` adds a case it does not use yet.)

- [ ] **Step 6: Commit**

```bash
git add lib/post-purchase-store.ts app/admin/post-purchase/actions.ts lib/post-purchase-store.test.ts lib/post-purchase-store.integration.test.ts lib/post-purchase-actions.test.ts
git commit -m "The store series can be saved: every store email waits after the welcome

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 3: The flow engine

**Files:**
- Modify (rewrite): `lib/post-purchase-sequences.ts`
- Modify (rewrite): `lib/post-purchase-sequences.test.ts`, `lib/post-purchase-sequences.integration.test.ts`
- Modify: `lib/post-purchase-send.ts` (the queue call)
- Modify: `docs/errors-and-retries.md`

**Interfaces:**
- Consumes: tables from Task 1; `saveSequence`, `getSequence` (Task 2, tests only); `stopUrl(flowId: string): string` from `lib/post-purchase-stop.ts` (unchanged signature; Task 4 changes what it stops); `renderPostPurchaseEmail`, `sendEmail`, `recordError`, `messageOf`, `firstNameOf`, `getSettingsOrDefaults`, `delayMs`.
- Produces: `buyerKey(email: string): string`; `startFlowsForOrder(orderId: string, now?: Date): Promise<number>` (rows queued); `requeueMissedSequences(now?: Date): Promise<number>`; `sendDueSequenceEmails(opts?: { now?: Date; limit?: number }): Promise<SequenceSendSummary>`; `type SequenceSendSummary = { sent: number; skipped: number; failed: number }`. `queueSequencesForOrder` is removed. `recordError` context for sends is `{ sendId, flowId }`.

- [ ] **Step 1: Write the failing integration tests**

Replace the whole of `lib/post-purchase-sequences.integration.test.ts` with the file below. Then carry over one test from the current file before replacing it: the F1 case where a pending, unexpired `oto_tokens` row keeps `requeueMissedSequences` from processing the order. Keep its `oto_tokens` insert exactly as it is (its columns are right), adapt the fixture calls to the helpers below, and change its assertion to `expect(await flowOf(seq.id!, b.email)).toBeNull()`. Put it inside the "the re-queue sweep" section.

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const sent: { to: string; subject: string; headers?: Record<string, string> }[] = [];
let nextResult: "sent" | "failed" | "disabled" = "sent";
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (to: string, mail: { subject: string }, over?: { headers?: Record<string, string> }) => {
    if (nextResult === "sent") sent.push({ to, subject: mail.subject, headers: over?.headers });
    return nextResult;
  },
}));
// Pinned rather than read from the local store: tests switch the welcome per case.
const settings = vi.hoisted(() => ({ welcome: false }));
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({
    postPurchaseEmail: { enabled: settings.welcome, accessUrl: "https://grow.greaterinside.com/login", senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "" },
  }),
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { saveSequence, getSequence } = await import("@/lib/post-purchase-store");
const { startFlowsForOrder, requeueMissedSequences, sendDueSequenceEmails } = await import("@/lib/post-purchase-sequences");
const { LAYOUT_DEFAULTS, starterDoc } = await import("@/lib/post-purchase-layout");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const users: string[] = [];
const offers: string[] = [];
const sequences: string[] = [];
let storeId = "";
/** A store series a developer made locally. The store tests skip rather than overwrite it. */
let devStoreSeries = false;

beforeEach(() => {
  sent.length = 0;
  nextResult = "sent";
  settings.welcome = false;
});

type Buyer = { userId: string; email: string };
type Bought = { orderId: string; itemId: string };

describe.skipIf(!canRun)("post-purchase flows (integration)", () => {
  beforeAll(async () => {
    storeId = await getStoreId();
    devStoreSeries = !!(await getSequence("store", storeId)).id;
  });

  const db = () => createServiceClient();
  /** A prefix that makes this test's subjects its own, whatever else is in the shared store. */
  const tag = () => `T${Math.random().toString(36).slice(2, 8)}`;
  const mine = (email: string, t: string) =>
    sent.filter((s) => s.to === email && s.subject.startsWith(`${t} `)).map((s) => s.subject.slice(t.length + 1));

  async function makeOffer(): Promise<string> {
    const id = crypto.randomUUID();
    offers.push(id);
    const r = await db().from("offers").insert({
      id, store_id: storeId, key: `zz-ppf-${id}`, name: "zz Funnel App", grant_type: "subscription",
      grant_app_id: APP, grant_entitlement_key: `zz-ppf-${id}`, grant_channels: [], billing_type: "one_time",
      price_cents: 2900, currency: "usd", headline: "fixture", description: "fixture",
    });
    if (r.error) throw new Error(`fixture offer: ${r.error.message}`);
    return id;
  }

  async function series(ownerType: "offer" | "store", ownerId: string, subjects: string[], opts: { delays?: number[]; unit?: "hours" | "days"; enabled?: boolean } = {}) {
    const res = await saveSequence({
      ownerType, ownerId, enabled: opts.enabled ?? true, layout: LAYOUT_DEFAULTS,
      emails: subjects.map((subject, i) => ({ id: null, delayAmount: opts.delays?.[i] ?? 2, delayUnit: opts.unit ?? "days", subject, preheader: "", doc: starterDoc("x") })),
    });
    if (!res.ok) throw new Error(res.error);
    const seq = await getSequence(ownerType, ownerId);
    sequences.push(seq.id!);
    return seq;
  }

  async function buyer(email = `zzppf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`): Promise<Buyer> {
    const created = await db().auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db().from("users").insert({ id: userId, store_id: storeId, email, username: "Priya Shah" });
    return { userId, email };
  }

  async function buy(b: Buyer, offerId: string, opts: { kind?: string; email?: string } = {}): Promise<Bought> {
    const { data: order, error } = await db().from("orders")
      .insert({ store_id: storeId, user_id: b.userId, email: opts.email ?? b.email, status: "paid", total_cents: 2900, subtotal_cents: 2900, currency: "usd" })
      .select("id").single();
    if (error || !order) throw new Error(`fixture order: ${error?.message}`);
    const { data: item } = await db().from("order_items")
      .insert({ store_id: storeId, order_id: order.id, kind: opts.kind ?? "oto", description: "zz Funnel App", amount_cents: 2900, offer_id: offerId })
      .select("id").single();
    const { data: held } = await db().from("ownership").select("id").eq("user_id", b.userId).eq("offer_id", offerId).limit(1);
    if (!held?.length) {
      const own = await db().from("ownership").insert({ store_id: storeId, user_id: b.userId, app_id: APP, offer_id: offerId, status: "active", source: "purchase" });
      if (own.error) throw new Error(`fixture ownership: ${own.error.message}`);
    }
    return { orderId: order.id as string, itemId: item!.id as string };
  }

  async function flowOf(sequenceId: string, email: string) {
    const { data } = await db().from("post_purchase_flows").select("id, status, run, order_id").eq("sequence_id", sequenceId).eq("email", email.toLowerCase()).maybeSingle();
    return data as { id: string; status: string; run: number; order_id: string | null } | null;
  }

  async function sendsOf(flowId: string) {
    const { data } = await db().from("post_purchase_sends").select("run, position, status, reason, due_at, email_id").eq("flow_id", flowId).order("run").order("position");
    return (data ?? []) as { run: number; position: number; status: string; reason: string | null; due_at: string; email_id: string | null }[];
  }

  describe("item flows", () => {
    it("a first purchase starts the item's flow: email 1 a minute after checkout, processed once", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const now = new Date();
      expect(await startFlowsForOrder(o.orderId, now)).toBeGreaterThanOrEqual(1);
      expect(await startFlowsForOrder(o.orderId, now)).toBe(0);
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ status: "running", run: 1, order_id: o.orderId });
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.run, r.position, r.status])).toEqual([[1, 1, "pending"]]);
      expect(new Date(rows[0].due_at).getTime()).toBe(now.getTime() + 60_000);
    });

    it("a renewal starts nothing, and the order is still marked processed", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer, { kind: "renewal" });
      expect(await startFlowsForOrder(o.orderId)).toBe(0);
      expect(await flowOf(seq.id!, b.email)).toBeNull();
      const { data } = await db().from("orders").select("post_purchase_flows_at").eq("id", o.orderId).single();
      expect(data!.post_purchase_flows_at).not.toBeNull();
    });

    it("sends email 1 once without a stop link, then email 2 its delay later with one, then the flow is done", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      const at = new Date(t0.getTime() + 61_000);
      await Promise.all([sendDueSequenceEmails({ now: at }), sendDueSequenceEmails({ now: at })]);
      expect(mine(b.email, t)).toEqual(["One"]);
      expect(sent.find((s) => s.subject === `${t} One`)?.headers).toBeUndefined();
      const flow = (await flowOf(seq.id!, b.email))!;
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "pending"]]);
      expect(new Date(rows[1].due_at).getTime()).toBe(at.getTime() + 2 * DAY);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
      expect(sent.find((s) => s.subject === `${t} Two`)?.headers?.["List-Unsubscribe"]).toMatch(/\/email\/stop\?t=/);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
    });

    type Case = { orderId: string; userId: string; offer: string; seqId: string };
    it.each([
      ["order refunded", async (x: Case) => { await db().from("orders").update({ status: "refunded" }).eq("id", x.orderId); }],
      ["access ended", async (x: Case) => { await db().from("ownership").update({ status: "canceled" }).eq("user_id", x.userId).eq("offer_id", x.offer); }],
      ["sequence switched off", async (x: Case) => { await db().from("post_purchase_sequences").update({ enabled: false }).eq("id", x.seqId); }],
    ])("ends the flow when the %s", async (reason, act) => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      await act({ orderId: o.orderId, userId: b.userId, offer, seqId: seq.id! });
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
      const flow = (await flowOf(seq.id!, b.email))!;
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", reason]]);
      expect(flow.status).toBe("done");
      expect(mine(b.email, t)).toEqual(["One"]);
    });

    it("buying the same thing again while its flow runs sends no second copy", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const o2 = await buy(b, offer);
      await startFlowsForOrder(o2.orderId, new Date(t0.getTime() + HOUR));
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ run: 1, status: "running", order_id: o1.orderId });
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "pending"]]);
    });

    it("buying again after the flow finished starts it from email 1, as run 2", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
      const o2 = await buy(b, offer);
      const t1 = new Date(t0.getTime() + 5 * DAY);
      await startFlowsForOrder(o2.orderId, t1);
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ run: 2, status: "running", order_id: o2.orderId });
      const run2 = (await sendsOf(flow.id)).filter((r) => r.run === 2);
      expect(run2.map((r) => [r.position, r.status])).toEqual([[1, "pending"]]);
      expect(new Date(run2[0].due_at).getTime()).toBe(t1.getTime() + 60_000);
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 61_000) });
      expect(mine(b.email, t)).toEqual(["One", "One"]);
    });

    it("a paused flow resumes on the buyer's next purchase of anything, after its own delay", async () => {
      const t = tag();
      const a = await makeOffer();
      const seq = await series("offer", a, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, a);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const before = (await flowOf(seq.id!, b.email))!;
      // What the stop link does (Task 4 tests the link itself).
      await db().from("post_purchase_flows").update({ status: "paused" }).eq("id", before.id);
      await db().from("post_purchase_sends").update({ status: "skipped", reason: "buyer stopped these emails" }).eq("flow_id", before.id).eq("status", "pending");
      const other = await makeOffer();
      const o2 = await buy(b, other);
      const t1 = new Date(t0.getTime() + 10 * DAY);
      await startFlowsForOrder(o2.orderId, t1);
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ status: "running", order_id: o2.orderId });
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "skipped"], [3, "pending"]]);
      expect(new Date(rows[2].due_at).getTime()).toBe(t1.getTime() + 2 * DAY);
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 2 * DAY + 1000) });
      expect(mine(b.email, t)).toEqual(["One", "Two"]);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
    });

    it("a paused flow's queued email is skipped at send time and the flow stays paused", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      const flow = (await flowOf(seq.id!, b.email))!;
      await db().from("post_purchase_flows").update({ status: "paused" }).eq("id", flow.id);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      expect((await sendsOf(flow.id)).map((r) => [r.status, r.reason])).toEqual([["skipped", "buyer stopped these emails"]]);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("paused");
      expect(mine(b.email, t)).toEqual([]);
    });

    it("a sequence switched off leaves a paused buyer paused when they buy again", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      await startFlowsForOrder(o1.orderId);
      const flow = (await flowOf(seq.id!, b.email))!;
      await db().from("post_purchase_flows").update({ status: "paused" }).eq("id", flow.id);
      await db().from("post_purchase_sequences").update({ enabled: false }).eq("id", seq.id!);
      const o2 = await buy(b, await makeOffer());
      await startFlowsForOrder(o2.orderId);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("paused");
    });

    it("the same buyer with a differently cased email is one buyer, one flow", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      await startFlowsForOrder(o1.orderId);
      const o2 = await buy(b, offer, { email: b.email.toUpperCase() });
      await startFlowsForOrder(o2.orderId);
      const { data } = await db().from("post_purchase_flows").select("id").eq("sequence_id", seq.id!);
      expect(data).toHaveLength(1);
      expect(await sendsOf(data![0].id as string)).toHaveLength(1);
    });

    it("an email deleted mid-flow is skipped and the next one goes, once", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`, `${t} Three`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const [one, , three] = (await getSequence("offer", offer)).emails;
      await saveSequence({ ownerType: "offer", ownerId: offer, enabled: true, layout: LAYOUT_DEFAULTS, emails: [one, three] });
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 30 * DAY) });
      expect(mine(b.email, t)).toEqual(["One", "Three"]);
      expect(seq.id).toBeTruthy();
    });

    it("a reorder mid-flow sends every email once, none twice, none lost", async () => {
      const t = tag();
      const offer = await makeOffer();
      await series("offer", offer, [`${t} One`, `${t} Two`, `${t} Three`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const [one, two, three] = (await getSequence("offer", offer)).emails;
      await saveSequence({ ownerType: "offer", ownerId: offer, enabled: true, layout: LAYOUT_DEFAULTS, emails: [three, two, one] });
      for (const d of [3, 6, 9, 30]) await sendDueSequenceEmails({ now: new Date(t0.getTime() + d * DAY) });
      expect(mine(b.email, t)).toEqual(["One", "Two", "Three"]);
    });

    it("a send the provider refuses is recorded and ends the chain", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      nextResult = "failed";
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const flow = (await flowOf(seq.id!, b.email))!;
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status])).toEqual([[1, "failed"]]);
      const { data: errs } = await db().from("error_events").select("context").eq("source", "post_purchase_sequence").order("created_at", { ascending: false }).limit(20);
      expect((errs ?? []).some((e) => (e.context as { flowId?: string }).flowId === flow.id)).toBe(true);
    });

    it("the checkout ending starts flows even with the welcome off", async () => {
      const { sendPostPurchaseIfDue } = await import("@/lib/post-purchase-send");
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      expect(await sendPostPurchaseIfDue(o.orderId)).toBe("disabled");
      expect((await flowOf(seq.id!, b.email))?.status).toBe("running");
    });
  });

  describe("the re-queue sweep", () => {
    it("processes a paid order the checkout step missed, once, even after its flow finished", async () => {
      settings.welcome = true;
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const now = new Date();
      await db().from("orders").update({ created_at: new Date(now.getTime() - 20 * 60_000).toISOString(), post_purchase_sent_at: now.toISOString() }).eq("id", o.orderId);
      expect(await requeueMissedSequences(now)).toBeGreaterThanOrEqual(1);
      await sendDueSequenceEmails({ now: new Date(now.getTime() + 61_000) });
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
      await requeueMissedSequences(new Date(now.getTime() + 2 * 60_000));
      expect((await flowOf(seq.id!, b.email))).toMatchObject({ status: "done", run: 1 });
    });

    it("leaves an order whose welcome is still to come", async () => {
      settings.welcome = true;
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const now = new Date();
      await db().from("orders").update({ created_at: new Date(now.getTime() - 20 * 60_000).toISOString() }).eq("id", o.orderId);
      await requeueMissedSequences(now);
      expect(await flowOf(seq.id!, b.email)).toBeNull();
    });
  });

  describe("the store series", () => {
    it("a first purchase starts it after the welcome; a later purchase adds nothing", async (ctx) => {
      if (devStoreSeries) return ctx.skip();
      const t = tag();
      const store = await series("store", storeId, [`${t} S1 {{offer_name}}`, `${t} S2`], { delays: [3, 2], unit: "hours" });
      const offer = await makeOffer();
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      const flow = (await flowOf(store.id!, b.email))!;
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "pending"]]);
      expect(new Date(rows[0].due_at).getTime()).toBe(t0.getTime() + 3 * HOUR);
      const o2 = await buy(b, offer);
      await startFlowsForOrder(o2.orderId, new Date(t0.getTime() + HOUR));
      expect(await sendsOf(flow.id)).toHaveLength(1);
      expect((await flowOf(store.id!, b.email))!.order_id).toBe(o1.orderId);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * HOUR + 1000) });
      // "What they bought" is the first item of the purchase that started it; every store email can be stopped.
      const s1 = sent.find((s) => s.to === b.email && s.subject === `${t} S1 zz Funnel App`);
      expect(s1?.headers?.["List-Unsubscribe"]).toMatch(/\/email\/stop\?t=/);
    });

    it("a finished store series stays finished after a stop and a new purchase", async (ctx) => {
      if (devStoreSeries) return ctx.skip();
      const t = tag();
      const store = await series("store", storeId, [`${t} S1`], { delays: [1], unit: "hours" });
      const offer = await makeOffer();
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + HOUR + 1000) });
      const flow = (await flowOf(store.id!, b.email))!;
      expect(flow.status).toBe("done");
      const o2 = await buy(b, offer);
      await startFlowsForOrder(o2.orderId, new Date(t0.getTime() + 2 * DAY));
      expect((await flowOf(store.id!, b.email))!.status).toBe("done");
      expect(await sendsOf(flow.id)).toHaveLength(1);
    });

    it("ends when every order of that buyer is refunded, and only that buyer's", async (ctx) => {
      if (devStoreSeries) return ctx.skip();
      const t = tag();
      const store = await series("store", storeId, [`${t} S1`, `${t} S2`], { delays: [1, 1], unit: "hours" });
      const offer = await makeOffer();
      const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      // B's address matches A's if the underscore were a LIKE wildcard.
      const a = await buyer(`zz_a${stamp}@example.com`);
      const bb = await buyer(`zzxa${stamp}@example.com`);
      const oa = await buy(a, offer);
      const t0 = new Date();
      await startFlowsForOrder(oa.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + HOUR + 1000) });
      await db().from("orders").update({ status: "refunded" }).eq("id", oa.orderId);
      await buy(bb, offer);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * HOUR) });
      const flow = (await flowOf(store.id!, a.email))!;
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", "every order refunded"]]);
      expect(flow.status).toBe("done");
    });
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  const seqIds = [...new Set(sequences)];
  if (seqIds.length) {
    const { data: flows } = await c.from("post_purchase_flows").select("id").in("sequence_id", seqIds);
    for (const f of flows ?? []) await c.from("error_events").delete().eq("source", "post_purchase_sequence").contains("context", { flowId: f.id });
    // Emails, flows and sends go with their sequence (on delete cascade).
    await c.from("post_purchase_sequences").delete().in("id", seqIds);
  }
  for (const u of users) {
    await c.from("ownership").delete().eq("user_id", u);
    const { data: orders } = await c.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) await c.from("order_items").delete().eq("order_id", o.id);
    await c.from("orders").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
    await c.auth.admin.deleteUser(u);
  }
  for (const o of offers) await c.from("offers").delete().eq("id", o);
});
```

- [ ] **Step 2: Write the failing unit tests**

Replace the whole of `lib/post-purchase-sequences.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests (no database) for the Supabase-error handling in
 * lib/post-purchase-sequences.ts. A scripted fake query builder stands in for
 * the client: every chain method returns the builder, and awaiting it (or
 * `.maybeSingle()` / `.single()`) resolves `{ data, error }` from a script
 * keyed by "table:operation", in call order.
 */

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; op: string; filters: Record<string, unknown>; payload?: unknown };

const calls: Call[] = [];
const scripts = new Map<string, Result[]>();
const push = (key: string, r: Result) => scripts.set(key, [...(scripts.get(key) ?? []), r]);
const nextResult = (key: string): Result => scripts.get(key)?.shift() ?? { data: null, error: null };

function makeBuilder(table: string) {
  let op = "select";
  let opSet = false;
  let payload: unknown;
  const filters: Record<string, unknown> = {};
  const setOp = (name: string, p?: unknown) => {
    if (!opSet) { op = name; opSet = true; }
    if (p !== undefined) payload = p;
  };
  const run = (): Promise<Result> => {
    calls.push({ table, op, filters: { ...filters }, payload });
    return Promise.resolve(nextResult(`${table}:${op}`));
  };
  const filter = (col: string, val: unknown) => { filters[col] = val; return builder; };
  const builder = {
    select: () => { setOp("select"); return builder; },
    update: (p: unknown) => { setOp("update", p); return builder; },
    upsert: (p: unknown) => { setOp("upsert", p); return builder; },
    insert: (p: unknown) => { setOp("insert", p); return builder; },
    delete: () => { setOp("delete"); return builder; },
    eq: filter, in: filter, is: filter, gt: filter, gte: filter, lte: filter, ilike: filter,
    not: (col: string, _op: string, val: unknown) => filter(col, val),
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => run(),
    single: () => run(),
    then: (resolve: (r: Result) => void, reject: (e: unknown) => void) => run().then(resolve, reject),
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: (t: string) => makeBuilder(t) }) }));
const sendEmailMock = vi.fn(async (..._a: unknown[]): Promise<"sent" | "failed" | "disabled"> => "sent");
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
const recordErrorMock = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/errors", async (orig) => ({
  ...(await orig<typeof import("@/lib/errors")>()),
  recordError: (...a: unknown[]) => recordErrorMock(...a),
}));
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({
    postPurchaseEmail: { enabled: true, accessUrl: "https://grow.example.com/login", senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "" },
  }),
}));
vi.mock("@/lib/post-purchase-stop", () => ({ stopUrl: (id: string) => `https://grow.example.com/email/stop?t=${id}` }));

const { startFlowsForOrder, sendDueSequenceEmails } = await import("@/lib/post-purchase-sequences");

const NOW = new Date("2026-10-01T10:00:00Z");
const CLAIMED = { id: "send-1", flow_id: "flow-1", run: 1, sequence_id: "seq-1", email_id: "email-1", position: 1, to_email: "buyer@example.com", store_id: "store-1" };
const FLOW = { id: "flow-1", store_id: "store-1", sequence_id: "seq-1", email: "buyer@example.com", status: "running", run: 1, order_id: "order-1" };
const SEQ = { id: "seq-1", enabled: true, layout: {}, owner_type: "offer", owner_id: "offer-1" };
const ORDER = { id: "order-1", status: "paid", user_id: "user-1", email: "buyer@example.com" };
const EMAIL = (id: string, position: number) => ({ id, position, subject: `Subject ${position}`, preheader: "", doc: { type: "doc", content: [] }, delay_amount: 2, delay_unit: "days" });

/** Everything a clean send of email 1 reads, in order, up to the send itself. */
function scriptUpToSend() {
  push("post_purchase_sends:select", { data: [{ id: "send-1" }], error: null }); // the due list
  push("post_purchase_sends:update", { data: CLAIMED, error: null }); // the claim
  push("post_purchase_flows:select", { data: FLOW, error: null });
  push("post_purchase_sequences:select", { data: SEQ, error: null });
  push("orders:select", { data: ORDER, error: null });
  push("ownership:select", { data: [{ id: "own-1" }], error: null });
  push("post_purchase_sends:select", { data: [], error: null }); // sentEmailIds
  push("post_purchase_emails:select", { data: [EMAIL("email-1", 1), EMAIL("email-2", 2)], error: null }); // emailToSend
  push("users:select", { data: { username: "Priya Shah" }, error: null });
  push("offers:select", { data: { name: "Funnel App" }, error: null });
}

beforeEach(() => {
  calls.length = 0;
  scripts.clear();
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(async () => "sent");
  recordErrorMock.mockClear();
});

describe("database errors while sending", () => {
  it("a failed mark-sent write never queues the next email or re-sends this one", async () => {
    scriptUpToSend();
    push("post_purchase_sends:update", { data: null, error: { message: "mark-sent failed" } });
    push("post_purchase_emails:select", { data: [EMAIL("email-1", 1), EMAIL("email-2", 2)], error: null }); // queueNext would find email 2
    const out = await sendDueSequenceEmails({ now: NOW });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const afterSend = calls.slice(calls.findIndex((c) => c.table === "users"));
    expect(afterSend.some((c) => c.table === "post_purchase_sends" && c.op === "upsert")).toBe(false);
    expect(afterSend.some((c) => c.table === "post_purchase_sends" && (c.payload as { status?: string })?.status === "pending")).toBe(false);
    expect(recordErrorMock.mock.calls.some((a) => String((a[0] as { message: string }).message).includes("email sent but the chain could not continue"))).toBe(true);
    expect(out.sent).toBe(1);
  });

  it("a read error before sending puts the email back half an hour later and records it", async () => {
    push("post_purchase_sends:select", { data: [{ id: "send-1" }], error: null });
    push("post_purchase_sends:update", { data: CLAIMED, error: null });
    push("post_purchase_flows:select", { data: null, error: { message: "flows read failed" } });
    await sendDueSequenceEmails({ now: NOW });
    expect(sendEmailMock).not.toHaveBeenCalled();
    const revert = calls.find((c) => c.table === "post_purchase_sends" && (c.payload as { status?: string })?.status === "pending");
    expect(new Date((revert!.payload as { due_at: string }).due_at).getTime()).toBe(NOW.getTime() + 30 * 60_000);
    expect(calls.some((c) => (c.payload as { status?: string })?.status === "skipped")).toBe(false);
    expect(recordErrorMock).toHaveBeenCalled();
  });

  it("email sending not configured is retried later, not skipped", async () => {
    scriptUpToSend();
    sendEmailMock.mockImplementation(async () => "disabled");
    await sendDueSequenceEmails({ now: NOW });
    const revert = calls.find((c) => c.table === "post_purchase_sends" && (c.payload as { status?: string })?.status === "pending");
    expect(new Date((revert!.payload as { due_at: string }).due_at).getTime()).toBe(NOW.getTime() + 30 * 60_000);
    expect(calls.some((c) => (c.payload as { status?: string })?.status === "skipped")).toBe(false);
    expect(recordErrorMock.mock.calls.some((a) => String((a[0] as { message: string }).message).includes("not configured"))).toBe(true);
  });
});

describe("database errors while starting flows", () => {
  it("a failed order read rejects rather than reading as nothing to do", async () => {
    push("orders:select", { data: null, error: { message: "orders read failed" } });
    await expect(startFlowsForOrder("order-1", NOW)).rejects.toThrow(/startFlowsForOrder: orders/);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run lib/post-purchase-sequences.test.ts lib/post-purchase-sequences.integration.test.ts`
Expected: FAIL (`startFlowsForOrder` is not exported; the flows table is unused).

- [ ] **Step 4: Rewrite lib/post-purchase-sequences.ts**

Replace the whole file with:

```ts
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
 * Post-purchase flows: started or resumed when a checkout is over, their
 * emails sent when due.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 * (Part 2 is the flow model and its rules table).
 *
 * A flow is one buyer (order email, lower-cased) on one sequence: the store
 * series, or one offer's or product's. It is running, paused (the buyer
 * clicked stop, which pauses all their flows) or done. Only the next email is
 * ever queued; each later one is queued when the one before it is sent, so a
 * sequence edited in between is followed as it stands now.
 */

/** An item's email 1 waits this long, so the welcome email arrives first. Nothing is ever queued sooner. */
const FIRST_EMAIL_AFTER_MS = 60_000;
/**
 * How far a row reverted to pending (an error before delivery) is pushed out.
 * The sweep takes the oldest-due 50 rows; a row stuck on a permanent failure
 * that kept its due time would retry every sweep and crowd out the rows
 * behind it.
 */
const RETRY_AFTER_MS = 30 * 60_000;
const HOLDS = ["active", "trialing", "past_due"];

type OwnerType = "store" | "offer" | "product";
type Line = { id: string; kind: string; offer_id: string | null; product_id: string | null };
type Order = { id: string; store_id: string; email: string | null; status: string; post_purchase_flows_at: string | null };
type Flow = { id: string; store_id: string; sequence_id: string; email: string; status: "running" | "paused" | "done"; run: number; order_id: string | null };
type Sequence = { id: string; enabled: boolean; layout: unknown; owner_type: OwnerType; owner_id: string };
type EmailRow = { id: string; position: number; subject: string; preheader: string; doc: DocNode; delay_amount: number; delay_unit: DelayUnit };
/** What a queued step needs to know about its flow. A claimed send row carries the same fields. */
type StepTarget = { store_id: string; flow_id: string; sequence_id: string; to_email: string };

const FLOW_COLUMNS = "id, store_id, sequence_id, email, status, run, order_id";
const SEQUENCE_COLUMNS = "id, enabled, layout, owner_type, owner_id";

/** A buyer is their order email, trimmed and lower-cased. */
export const buyerKey = (email: string) => email.trim().toLowerCase();

const targetOf = (f: Flow): StepTarget => ({ store_id: f.store_id, flow_id: f.id, sequence_id: f.sequence_id, to_email: f.email });

function ownerOf(line: Pick<Line, "offer_id" | "product_id">): { ownerType: "offer" | "product"; ownerId: string } | null {
  if (line.offer_id) return { ownerType: "offer", ownerId: line.offer_id };
  if (line.product_id) return { ownerType: "product", ownerId: line.product_id };
  return null;
}

/**
 * supabase-js reports a network or 5xx failure as `{ error }`, not a thrown
 * exception, so every read and write in this file is unwrapped through here.
 * A transient failure must become a visible error, never a silently empty
 * result that reads as "nothing to do".
 */
async function unwrap<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/**
 * Apply the rules table to one purchase, once. Called when the checkout is
 * over (lib/post-purchase-send.ts) and by the re-queue sweep; both may call it
 * for the same order, so every step is safe to run twice and the order is
 * stamped when done.
 */
export async function startFlowsForOrder(orderId: string, now = new Date()): Promise<number> {
  const db = createServiceClient();
  const order = (await unwrap(
    db.from("orders").select("id, store_id, email, status, post_purchase_flows_at").eq("id", orderId).maybeSingle(),
    "startFlowsForOrder: orders",
  )) as Order | null;
  if (!order || order.status !== "paid" || order.post_purchase_flows_at) return 0;

  let queued = 0;
  if (order.email) {
    const email = buyerKey(order.email);
    const lines = ((await unwrap(
      db.from("order_items").select("id, kind, offer_id, product_id").eq("order_id", orderId).order("created_at"),
      "startFlowsForOrder: order_items",
    )) ?? []) as Line[];
    // A renewal is a payment on something bought earlier, not a purchase.
    const bought = lines.filter((l) => l.kind !== "renewal");
    if (bought.length > 0) {
      // Buying again removes a stop: every flow the buyer paused picks up where it stopped.
      queued += await resumePausedFlows(order, email, now);
      const store = await enabledSequence(order.store_id, "store", order.store_id);
      if (store) queued += await startFlow(order, email, store, now);
      for (const line of bought) {
        const owner = ownerOf(line);
        if (!owner) continue;
        const seq = await enabledSequence(order.store_id, owner.ownerType, owner.ownerId);
        if (seq) queued += await startFlow(order, email, seq, now);
      }
    }
  }
  // Processed: the re-queue sweep never takes this order again.
  await unwrap(
    db.from("orders").update({ post_purchase_flows_at: now.toISOString() }).eq("id", orderId).is("post_purchase_flows_at", null),
    "startFlowsForOrder: stamp order",
  );
  return queued;
}

async function resumePausedFlows(order: Order, email: string, now: Date): Promise<number> {
  const db = createServiceClient();
  const paused = ((await unwrap(
    db.from("post_purchase_flows").select(FLOW_COLUMNS).eq("store_id", order.store_id).eq("email", email).eq("status", "paused").order("created_at"),
    "resumePausedFlows: flows",
  )) ?? []) as Flow[];
  let queued = 0;
  for (const f of paused) {
    // A sequence switched off stays paused: it has nothing to send.
    if (!(await sequenceById(f.sequence_id))?.enabled) continue;
    const flipped = (await unwrap(
      db.from("post_purchase_flows")
        .update({ status: "running", order_id: order.id, updated_at: now.toISOString() })
        .eq("id", f.id).eq("status", "paused")
        .select(FLOW_COLUMNS),
      "resumePausedFlows: resume",
    )) as Flow[] | null;
    const flow = flipped?.[0];
    if (!flow) continue;
    const sent = await sentEmailIds(flow.id, flow.run);
    const next = (await emailsInOrder(flow.sequence_id)).find((e) => !sent.has(e.id));
    if (!next) {
      await markDone(flow.id, flow.run);
      continue;
    }
    // Its own delay, counted from this purchase, and never ahead of this purchase's welcome.
    const wait = Math.max(delayMs(next.delay_amount, next.delay_unit), FIRST_EMAIL_AFTER_MS);
    queued += await queueStep(targetOf(flow), flow.run, (await lastPosition(flow.id, flow.run)) + 1, next.id, new Date(now.getTime() + wait));
  }
  return queued;
}

/** Start, restart or leave alone this buyer's flow on one sequence, per the rules table. */
async function startFlow(order: Order, email: string, seq: Sequence, now: Date): Promise<number> {
  const db = createServiceClient();
  const existing = (await unwrap(
    db.from("post_purchase_flows").select(FLOW_COLUMNS).eq("sequence_id", seq.id).eq("email", email).maybeSingle(),
    "startFlow: flows",
  )) as Flow | null;

  if (!existing) {
    const created = (await unwrap(
      db.from("post_purchase_flows")
        .upsert(
          { store_id: order.store_id, sequence_id: seq.id, email, status: "running", run: 1, order_id: order.id },
          { onConflict: "sequence_id,email", ignoreDuplicates: true },
        )
        .select(FLOW_COLUMNS),
      "startFlow: create flow",
    )) as Flow[] | null;
    const flow = created?.[0];
    // No row back: another request created it a moment ago.
    return flow ? queueFirst(flow, seq, now) : 0;
  }
  // Already handled for this purchase.
  if (existing.order_id === order.id) return 0;
  // Running carries on, with no second copy. Paused was resumed above.
  if (existing.status !== "done") return 0;
  // A finished store series stays finished.
  if (seq.owner_type === "store") return 0;
  // A finished item flow starts again from email 1, as a new run.
  const restarted = (await unwrap(
    db.from("post_purchase_flows")
      .update({ status: "running", run: existing.run + 1, order_id: order.id, updated_at: now.toISOString() })
      .eq("id", existing.id).eq("status", "done").eq("run", existing.run)
      .select(FLOW_COLUMNS),
    "startFlow: restart flow",
  )) as Flow[] | null;
  const flow = restarted?.[0];
  return flow ? queueFirst(flow, seq, now) : 0;
}

async function queueFirst(flow: Flow, seq: Sequence, now: Date): Promise<number> {
  const first = (await emailsInOrder(seq.id))[0];
  if (!first) {
    await markDone(flow.id, flow.run);
    return 0;
  }
  // Every store email follows the welcome, so even the first waits its delay; an item's email 1 goes a minute after checkout.
  const wait = seq.owner_type === "store" ? Math.max(delayMs(first.delay_amount, first.delay_unit), FIRST_EMAIL_AFTER_MS) : FIRST_EMAIL_AFTER_MS;
  return queueStep(targetOf(flow), flow.run, 1, first.id, new Date(now.getTime() + wait));
}

async function queueStep(t: StepTarget, run: number, position: number, emailId: string, dueAt: Date): Promise<number> {
  const inserted = await unwrap(
    createServiceClient()
      .from("post_purchase_sends")
      .upsert(
        { store_id: t.store_id, flow_id: t.flow_id, run, sequence_id: t.sequence_id, email_id: emailId, position, to_email: t.to_email, due_at: dueAt.toISOString() },
        { onConflict: "flow_id,run,position", ignoreDuplicates: true },
      )
      .select("id"),
    "queueStep: post_purchase_sends",
  );
  return (inserted as unknown[] | null)?.length ?? 0;
}

async function enabledSequence(storeId: string, ownerType: OwnerType, ownerId: string): Promise<Sequence | null> {
  const seq = (await unwrap(
    createServiceClient().from("post_purchase_sequences").select(SEQUENCE_COLUMNS).eq("store_id", storeId).eq("owner_type", ownerType).eq("owner_id", ownerId).maybeSingle(),
    "enabledSequence",
  )) as Sequence | null;
  return seq?.enabled ? seq : null;
}

async function sequenceById(id: string): Promise<Sequence | null> {
  return (await unwrap(
    createServiceClient().from("post_purchase_sequences").select(SEQUENCE_COLUMNS).eq("id", id).maybeSingle(),
    "sequenceById",
  )) as Sequence | null;
}

async function lastPosition(flowId: string, run: number): Promise<number> {
  const row = (await unwrap(
    createServiceClient().from("post_purchase_sends").select("position").eq("flow_id", flowId).eq("run", run).order("position", { ascending: false }).limit(1).maybeSingle(),
    "lastPosition",
  )) as { position: number } | null;
  return row?.position ?? 0;
}

async function markDone(flowId: string, run: number): Promise<void> {
  await unwrap(
    createServiceClient().from("post_purchase_flows").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", flowId).eq("run", run).eq("status", "running"),
    "markDone",
  );
}

/**
 * The safety net under the checkout-over step. completeOfferCheckout
 * (lib/offer-checkout.ts) marks an order paid before its order_items line is
 * guaranteed to exist, and a transient failure can stop processing part-way;
 * orders not yet stamped with post_purchase_flows_at are processed here.
 *
 * Only orders the welcome can no longer come before: post_purchase_sent_at
 * set, or the welcome switched off. With the welcome on and still to come, the
 * welcome path processes the order first. The owner chose "right after the welcome".
 * ponytail: the 2-hour window also means a sequence switched on now starts for
 * buyers from the last 2 hours. The 50-order limit is fine at this store's volume.
 */
export async function requeueMissedSequences(now = new Date()): Promise<number> {
  const db = createServiceClient();
  const welcomeOn = (await getSettingsOrDefaults()).postPurchaseEmail.enabled;
  let query = db
    .from("orders")
    .select("id")
    .eq("status", "paid")
    .is("post_purchase_flows_at", null)
    .gte("created_at", new Date(now.getTime() - 2 * 3_600_000).toISOString())
    .lte("created_at", new Date(now.getTime() - 5 * 60_000).toISOString());
  if (welcomeOn) query = query.not("post_purchase_sent_at", "is", null);
  const orders = await unwrap(query.order("created_at").limit(50), "requeueMissedSequences: orders");
  let queued = 0;
  for (const o of orders ?? []) {
    const orderId = o.id as string;
    try {
      // Still deciding on an upsell, so the checkout is not over: the same test sendPostPurchaseIfDue makes.
      const pending = await unwrap(
        db.from("oto_tokens").select("id").eq("order_id", orderId).eq("status", "pending").gt("expires_at", now.toISOString()).limit(1),
        "requeueMissedSequences: oto_tokens",
      );
      if (pending?.length) continue;
      queued += await startFlowsForOrder(orderId, now);
    } catch (e) {
      await recordError({ source: "post_purchase_sequence", message: `could not queue post-purchase emails: ${messageOf(e)}`, context: { orderId } });
    }
  }
  return queued;
}

export type SequenceSendSummary = { sent: number; skipped: number; failed: number };

export async function sendDueSequenceEmails(opts: { now?: Date; limit?: number } = {}): Promise<SequenceSendSummary> {
  const now = opts.now ?? new Date();
  const due = await unwrap(
    createServiceClient()
      .from("post_purchase_sends")
      .select("id")
      .eq("status", "pending")
      .lte("due_at", now.toISOString())
      .order("due_at")
      .order("id")
      .limit(opts.limit ?? 50),
    "sendDueSequenceEmails: post_purchase_sends",
  );
  const out: SequenceSendSummary = { sent: 0, skipped: 0, failed: 0 };
  for (const d of due ?? []) {
    const r = await sendOne(d.id as string, now);
    if (r) out[r] += 1;
  }
  return out;
}

type Claimed = StepTarget & { id: string; run: number; email_id: string | null; position: number };

/** The provider itself said no. Kept distinct from every other failure: this one still ends the chain and marks the row failed. */
class SendRefused extends Error {}

async function sendOne(sendId: string, now: Date): Promise<keyof SequenceSendSummary | null> {
  const db = createServiceClient();
  // Claim before anything else: two sweeps racing get one send. No row back
  // means someone else has it; an error on the claim means nothing was
  // claimed, so there is nothing to undo.
  const { data: claimed, error: claimError } = await db
    .from("post_purchase_sends")
    .update({ status: "sending" })
    .eq("id", sendId)
    .eq("status", "pending")
    .select("id, flow_id, run, sequence_id, email_id, position, to_email, store_id")
    .maybeSingle();
  if (claimError) {
    console.error(`[post_purchase_sequence] could not claim send ${sendId}: ${claimError.message}`);
    return null;
  }
  if (!claimed) return null;
  const row = claimed as Claimed;
  // Set the moment sendEmail reports "sent". After that, never retry the send itself.
  let delivered = false;

  const skip = async (reason: string) => {
    await unwrap(db.from("post_purchase_sends").update({ status: "skipped", reason }).eq("id", sendId), "sendOne: mark skipped");
    return "skipped" as const;
  };
  // A stop rule ends the flow too, so a later purchase of the item starts it again.
  const end = async (reason: string) => {
    await skip(reason);
    await markDone(row.flow_id, row.run);
    return "skipped" as const;
  };

  try {
    const flow = (await unwrap(db.from("post_purchase_flows").select(FLOW_COLUMNS).eq("id", row.flow_id).maybeSingle(), "sendOne: flow")) as Flow | null;
    if (!flow) return await skip("flow gone");
    if (flow.run !== row.run) return await skip("flow started again");
    if (flow.status === "paused") return await skip("buyer stopped these emails");
    if (flow.status === "done") return await skip("flow finished");

    const seq = await sequenceById(row.sequence_id);
    if (!seq?.enabled) return await end("sequence switched off");

    const order = flow.order_id
      ? ((await unwrap(db.from("orders").select("id, status, user_id, email").eq("id", flow.order_id).maybeSingle(), "sendOne: order")) as
          | { id: string; status: string; user_id: string | null; email: string }
          | null)
      : null;
    if (seq.owner_type === "store") {
      if (!(await hasPaidOrder(flow))) return await end("every order refunded");
    } else {
      if (!order || order.status !== "paid") return await end("order refunded");
      if (!order.user_id || !(await stillHolds(order.user_id, seq))) return await end("access ended");
    }

    const sent = await sentEmailIds(row.flow_id, row.run);
    const email = await emailToSend(row, sent);
    if (!email) return await end("no email left in the sequence");

    const settings = (await getSettingsOrDefaults()).postPurchaseEmail;
    // By email, the way the welcome finds the name typed at checkout.
    const profile = await unwrap(db.from("users").select("username").eq("email", order?.email ?? flow.email).limit(1).maybeSingle(), "sendOne: users");
    // Every store email follows the welcome and can be stopped; an item's first email of a run is not.
    const stop = seq.owner_type === "store" || sent.size > 0 ? stopUrl(flow.id) : null;
    const mail = renderPostPurchaseEmail({
      doc: email.doc,
      subject: email.subject,
      preheader: email.preheader,
      layout: seq.layout,
      vars: {
        first_name: firstNameOf(profile?.username as string | null),
        offer_name: await whatTheyBought(seq, flow.order_id),
        access_link: settings.accessUrl,
      },
      stopUrl: stop,
    });
    const res = await sendEmail(row.to_email, mail, {
      from: settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail,
      replyTo: settings.replyTo,
      ...(stop ? { headers: { "List-Unsubscribe": `<${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    });
    // Not set up yet is not a no: retried later like any other failure before delivery.
    if (res === "disabled") throw new Error("email sending is not configured");
    if (res === "failed") throw new SendRefused("the email provider refused the send");
    delivered = true;

    await unwrap(db.from("post_purchase_sends").update({ status: "sent", sent_at: now.toISOString(), email_id: email.id }).eq("id", sendId), "sendOne: mark sent");
    await queueNext(row, new Set([...sent, email.id]), now);
    return "sent";
  } catch (e) {
    const context = { sendId, flowId: row.flow_id };
    if (e instanceof SendRefused) {
      await db.from("post_purchase_sends").update({ status: "failed", reason: messageOf(e).slice(0, 500) }).eq("id", sendId);
      await recordError({ source: "post_purchase_sequence", message: messageOf(e), context });
      return "failed";
    }
    if (!delivered) {
      // Nothing went out: put the claim back, half an hour out, so a later sweep retries it.
      await db
        .from("post_purchase_sends")
        .update({ status: "pending", due_at: new Date(now.getTime() + RETRY_AFTER_MS).toISOString() })
        .eq("id", sendId)
        .eq("status", "sending");
      await recordError({ source: "post_purchase_sequence", message: messageOf(e), context });
      return null;
    }
    // The buyer already has the email. A retry would send it twice, so the row
    // is left as it is and this only surfaces on the Errors page.
    await recordError({ source: "post_purchase_sequence", message: `email sent but the chain could not continue: ${messageOf(e)}`, context });
    return "sent";
  }
}

/**
 * Any order of this buyer still paid. Matched without case, like buyerKey;
 * LIKE's wildcards in the address are escaped, so "a_b@x" never matches "axb@x".
 */
async function hasPaidOrder(flow: Flow): Promise<boolean> {
  const data = await unwrap(
    createServiceClient()
      .from("orders")
      .select("id")
      .eq("store_id", flow.store_id)
      .eq("status", "paid")
      .ilike("email", flow.email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1),
    "hasPaidOrder: orders",
  );
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

async function stillHolds(userId: string, seq: Sequence): Promise<boolean> {
  const data = await unwrap(
    createServiceClient()
      .from("ownership")
      .select("id")
      .eq("user_id", userId)
      .eq(seq.owner_type === "offer" ? "offer_id" : "product_id", seq.owner_id)
      .in("status", HOLDS)
      .limit(1),
    "stillHolds: ownership",
  );
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

/*
 * The owner may reorder or delete emails while buyers are part-way through.
 * One rule covers every case: the next email is the first one, in the
 * sequence's current order, not yet sent in this run.
 */
async function sentEmailIds(flowId: string, run: number): Promise<Set<string>> {
  const data = await unwrap(
    createServiceClient().from("post_purchase_sends").select("email_id").eq("flow_id", flowId).eq("run", run).eq("status", "sent"),
    "sentEmailIds",
  );
  return new Set(((data ?? []) as { email_id: string | null }[]).map((r) => r.email_id).filter((id): id is string => !!id));
}

async function emailsInOrder(sequenceId: string): Promise<EmailRow[]> {
  const data = await unwrap(
    createServiceClient().from("post_purchase_emails").select("id, position, subject, preheader, doc, delay_amount, delay_unit").eq("sequence_id", sequenceId).order("position"),
    "emailsInOrder",
  );
  return (data ?? []) as EmailRow[];
}

/** The email this row was queued for, while it exists and is unsent in this run; else the first unsent one. */
async function emailToSend(row: Claimed, sent: Set<string>): Promise<EmailRow | null> {
  const all = await emailsInOrder(row.sequence_id);
  return all.find((e) => e.id === row.email_id && !sent.has(e.id)) ?? all.find((e) => !sent.has(e.id)) ?? null;
}

async function queueNext(row: Claimed, sent: Set<string>, now: Date): Promise<void> {
  const next = (await emailsInOrder(row.sequence_id)).find((e) => !sent.has(e.id));
  if (!next) {
    await markDone(row.flow_id, row.run);
    return;
  }
  await queueStep(row, row.run, row.position + 1, next.id, new Date(now.getTime() + delayMs(next.delay_amount, next.delay_unit)));
}

/** "What they bought": the item for an item flow; for the store series, the first item of the purchase that started or resumed it. */
async function whatTheyBought(seq: Sequence, orderId: string | null): Promise<string> {
  const db = createServiceClient();
  if (seq.owner_type === "offer") {
    const data = (await unwrap(db.from("offers").select("name").eq("id", seq.owner_id).maybeSingle(), "whatTheyBought: offers")) as { name: string } | null;
    if (data?.name) return data.name;
  }
  if (seq.owner_type === "product") {
    const data = (await unwrap(db.from("products").select("title").eq("id", seq.owner_id).maybeSingle(), "whatTheyBought: products")) as { title: string } | null;
    if (data?.title) return data.title;
  }
  if (seq.owner_type === "store" && orderId) {
    const data = (await unwrap(
      db.from("order_items").select("description").eq("order_id", orderId).order("created_at").limit(1).maybeSingle(),
      "whatTheyBought: order_items",
    )) as { description: string | null } | null;
    if (data?.description) return data.description;
  }
  return "your purchase";
}
```

- [ ] **Step 5: Wire the checkout-over step**

In `lib/post-purchase-send.ts`, change the import from `queueSequencesForOrder` to `startFlowsForOrder`, and in `sendPostPurchaseIfDue` replace `await queueSequencesForOrder(orderId);` with `await startFlowsForOrder(orderId);`. Replace the comment above that try block (the lines from "The checkout is over. Each item's own post-purchase sequence starts now" to just before the `ponytail:` line) with:

```ts
  // The checkout is over. Post-purchase flows (the store series and each
  // item's sequence) start or resume now, whether or not the store's welcome
  // email is switched on: they are sent in addition to it, not through it.
  // Processed once per order (post_purchase_flows_at), so the sweep calling
  // this again changes nothing. A failure here must not cost the buyer their
  // welcome.
```

Keep the `ponytail:` lines and the rest of the function as they are.

- [ ] **Step 6: Update the errors doc**

In `docs/errors-and-retries.md`, replace the paragraph that begins "`retry-sweep` also sends due post-purchase sequence emails" (and the sentence after it about re-queueing, if it is a separate paragraph) with:

```markdown
`retry-sweep` also runs post-purchase flows (lib/post-purchase-sequences.ts).
First `requeueMissedSequences` processes paid orders from the last two hours
that were never processed for flows (`orders.post_purchase_flows_at` empty,
no open upsell, and with the welcome on, only orders whose welcome has gone).
Then `sendDueSequenceEmails` sends up to 50 due emails, each claimed before
sending. A send the provider refuses is marked `failed`, logged here as
`post_purchase_sequence`, and ends that buyer's chain; an error before
delivery puts the email back half an hour later and logs it.
`sendPostPurchaseIfDue` processes each order for flows once the checkout is
over, whether or not the welcome is on.
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run lib/post-purchase-sequences.test.ts lib/post-purchase-sequences.integration.test.ts app/api/cron/retry/route.test.ts lib/post-purchase-send.test.ts lib/purchase-email-reaches-every-end.test.ts && npx tsc --noEmit`
Expected: PASS (4 unit tests; 20 integration tests including the `it.each` three and the carried-over upsell test, or fewer passing plus three skipped if a local store series exists); tsc exit 0. If `grep -rn queueSequencesForOrder lib app components` finds anything outside comments, change it to `startFlowsForOrder`.

- [ ] **Step 8: Commit**

```bash
git add lib/post-purchase-sequences.ts lib/post-purchase-sequences.test.ts lib/post-purchase-sequences.integration.test.ts lib/post-purchase-send.ts docs/errors-and-retries.md
git commit -m "Post-purchase flows: one per buyer per sequence, started, resumed and restarted per the rules

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 4: Stop pauses the buyer

**Files:**
- Modify (rewrite): `lib/post-purchase-stop.ts`, `app/email/stop/route.ts`, `lib/post-purchase-stop.test.ts`
- Test: append to `lib/post-purchase-sequences.integration.test.ts`

**Interfaces:**
- Consumes: flows and sends tables (Task 1); `startFlowsForOrder`, `sendDueSequenceEmails` and the integration file's helpers (Task 3).
- Produces: `stopToken(flowId)`, `verifyStopToken(t)`, `stopUrl(flowId)` (unchanged signatures, now naming a flow); `stopBuyer(flowId: string): Promise<{ ok: boolean }>`. `stopSequence` and `stopName` are removed.

- [ ] **Step 1: Write the failing unit tests**

Replace the whole of `lib/post-purchase-stop.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  otoSigningSecret: () => "test-signing-secret-aaaaaaaaaaaa",
  siteUrl: () => "https://grow.greaterinside.com",
}));

type Write = { table: string; patch: unknown; filters: Record<string, unknown> };
const writes: Write[] = [];
const fail = vi.hoisted(() => ({ read: false }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let patch: unknown = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (p: unknown) => { patch = p; return q; };
      q.eq = (c: string, v: unknown) => { filters[c] = v; return q; };
      q.in = (c: string, v: unknown) => { filters[c] = v; return q; };
      q.maybeSingle = async () =>
        fail.read ? { data: null, error: { message: "boom" } } : { data: { store_id: "store-1", email: "priya@example.com" }, error: null };
      q.then = (res: (v: unknown) => unknown) => {
        writes.push({ table, patch, filters: { ...filters } });
        const data = table === "post_purchase_flows" ? [{ id: "flow-1" }, { id: "flow-2" }] : null;
        return Promise.resolve({ data, error: null }).then(res);
      };
      return q;
    },
  }),
}));

const { stopToken, verifyStopToken, stopUrl } = await import("@/lib/post-purchase-stop");
const { GET, POST } = await import("@/app/email/stop/route");

const FLOW = "3f1e2d4c-5b6a-4789-8abc-def012345678";
beforeEach(() => {
  writes.length = 0;
  fail.read = false;
});

describe("the stop token", () => {
  it("round-trips the flow it was made for", () => {
    expect(verifyStopToken(stopToken(FLOW))).toBe(FLOW);
  });

  it("refuses an edited, truncated or missing token", () => {
    const t = stopToken(FLOW);
    const other = Buffer.from("00000000-0000-0000-0000-000000000000").toString("base64url");
    expect(verifyStopToken(`${other}.${t.split(".")[1]}`)).toBeNull();
    expect(verifyStopToken(t.slice(0, -2))).toBeNull();
    expect(verifyStopToken(null)).toBeNull();
    expect(verifyStopToken("nodot")).toBeNull();
  });

  it("builds an absolute link on the store's own address", () => {
    expect(stopUrl(FLOW)).toMatch(/^https:\/\/grow\.greaterinside\.com\/email\/stop\?t=/);
  });
});

describe("the stop page", () => {
  const req = (t: string, method = "GET") => new Request(`https://grow.greaterinside.com/email/stop?t=${t}`, { method });

  it("opening the link only asks, and writes nothing", async () => {
    const t = stopToken(FLOW);
    const res = await GET(req(t));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Stop these emails? You won't get any more follow-up emails from us until you buy again.");
    expect(html).toContain(`action="/email/stop?t=${encodeURIComponent(t)}"`);
    expect(writes).toHaveLength(0);
  });

  it("the button pauses every running flow for the buyer and skips what is queued", async () => {
    const res = await POST(req(stopToken(FLOW), "POST"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Done. You won't get any more of these emails.");
    expect(writes[0]).toMatchObject({
      table: "post_purchase_flows",
      patch: expect.objectContaining({ status: "paused" }),
      filters: { store_id: "store-1", email: "priya@example.com", status: "running" },
    });
    expect(writes[1]).toMatchObject({
      table: "post_purchase_sends",
      patch: { status: "skipped", reason: "buyer stopped these emails" },
      filters: { flow_id: ["flow-1", "flow-2"], status: "pending" },
    });
  });

  it("says the same on a second click", async () => {
    await POST(req(stopToken(FLOW), "POST"));
    const again = await POST(req(stopToken(FLOW), "POST"));
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("Done.");
  });

  it("says so when the stop could not be saved", async () => {
    fail.read = true;
    const res = await POST(req(stopToken(FLOW), "POST"));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("were not stopped");
    expect(writes).toHaveLength(0);
  });

  it("refuses a bad link and stops nothing", async () => {
    for (const method of ["GET", "POST"]) {
      const res = await (method === "GET" ? GET : POST)(req("forged.token", method));
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("This link is not valid");
    }
    expect(writes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write the failing integration test**

Append inside the `describe("item flows", ...)` block of `lib/post-purchase-sequences.integration.test.ts`:

```ts
    it("stop pauses every flow for the buyer and skips what is queued; buying again resumes each, once", async () => {
      const { stopBuyer } = await import("@/lib/post-purchase-stop");
      const t = tag();
      const a = await makeOffer();
      const seqA = await series("offer", a, [`${t} A1`, `${t} A2`]);
      const c = await makeOffer();
      const seqC = await series("offer", c, [`${t} C1`, `${t} C2`]);
      const b = await buyer();
      const t0 = new Date();
      await startFlowsForOrder((await buy(b, a)).orderId, t0);
      await startFlowsForOrder((await buy(b, c)).orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const flowA = (await flowOf(seqA.id!, b.email))!;
      const flowC = (await flowOf(seqC.id!, b.email))!;

      expect(await stopBuyer(flowA.id)).toEqual({ ok: true });
      expect((await flowOf(seqA.id!, b.email))!.status).toBe("paused");
      expect((await flowOf(seqC.id!, b.email))!.status).toBe("paused");
      expect((await sendsOf(flowC.id)).map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", "buyer stopped these emails"]]);
      // A second click changes nothing.
      expect(await stopBuyer(flowA.id)).toEqual({ ok: true });

      // Nothing goes out while stopped.
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 5 * DAY) });
      expect(mine(b.email, t).sort()).toEqual(["A1", "C1"]);

      // Buying anything resumes both, each after its own delay from that purchase, once.
      const t1 = new Date(t0.getTime() + 6 * DAY);
      await startFlowsForOrder((await buy(b, await makeOffer())).orderId, t1);
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 2 * DAY + 1000) });
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 30 * DAY) });
      expect(mine(b.email, t).sort()).toEqual(["A1", "A2", "C1", "C2"]);
    });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run lib/post-purchase-stop.test.ts lib/post-purchase-sequences.integration.test.ts`
Expected: FAIL (`stopBuyer` is not exported; the GET copy differs).

- [ ] **Step 4: Rewrite lib/post-purchase-stop.ts**

```ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { otoSigningSecret, siteUrl } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * "Stop these emails" in a post-purchase follow-up.
 *
 * The token names one flow (a buyer on one sequence) and is signed with the
 * same secret as the preview and view-as tokens. No expiry: a buyer may open
 * an old email months later. Stopping pauses every flow for that buyer, not
 * only this one; their next purchase resumes them (lib/post-purchase-sequences.ts).
 */
const sign = (body: string) => createHmac("sha256", otoSigningSecret()).update(`pp-stop:${body}`).digest("base64url");

export function stopToken(flowId: string): string {
  const body = Buffer.from(flowId).toString("base64url");
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

export function stopUrl(flowId: string): string {
  return `${siteUrl()}/email/stop?t=${stopToken(flowId)}`;
}

/**
 * Pause every running flow for this flow's buyer and skip what is queued for
 * them. Safe to call again. Queued rows are skipped here, not left for the
 * send loop, so a purchase before they were due resumes cleanly at the next
 * unsent email.
 */
export async function stopBuyer(flowId: string): Promise<{ ok: boolean }> {
  const db = createServiceClient();
  const { data: flow, error: readErr } = await db.from("post_purchase_flows").select("store_id, email").eq("id", flowId).maybeSingle();
  if (readErr) {
    console.error("[post-purchase stop] could not read the flow:", readErr.message);
    return { ok: false };
  }
  // Its sequence was deleted: nothing is left to stop.
  if (!flow) return { ok: true };
  const { data: paused, error: pauseErr } = await db
    .from("post_purchase_flows")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("store_id", flow.store_id)
    .eq("email", flow.email)
    .eq("status", "running")
    .select("id");
  if (pauseErr) {
    console.error("[post-purchase stop] could not pause the flows:", pauseErr.message);
    return { ok: false };
  }
  const ids = ((paused ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    const { error: skipErr } = await db
      .from("post_purchase_sends")
      .update({ status: "skipped", reason: "buyer stopped these emails" })
      .in("flow_id", ids)
      .eq("status", "pending");
    if (skipErr) {
      console.error("[post-purchase stop] could not skip the queued emails:", skipErr.message);
      return { ok: false };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 5: Rewrite app/email/stop/route.ts**

```ts
import { stopBuyer, verifyStopToken } from "@/lib/post-purchase-stop";

export const dynamic = "force-dynamic";

const INVALID = "This link is not valid. If you want to stop these emails, reply to any of them and we will do it for you.";

function page(status: number, message: string, after = ""): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#fafaf8;color:#0b0b0d;">
<main style="max-width:480px;margin:15vh auto;padding:0 20px;font-size:16px;line-height:1.6;"><p>${message}</p>${after}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Opening the link only asks. Mail security gateways fetch the links in
 * incoming mail on their own, so a GET that stopped the emails would stop
 * them for buyers who never clicked.
 */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!verifyStopToken(t)) return page(400, INVALID);
  return page(
    200,
    "Stop these emails? You won't get any more follow-up emails from us until you buy again.",
    `<form method="post" action="/email/stop?t=${encodeURIComponent(t)}"><button type="submit" style="font:inherit;padding:10px 18px;border:0;border-radius:6px;background:#0b0b0d;color:#ffffff;cursor:pointer;">Stop these emails</button></form>`,
  );
}

/** The page's button, and one-click unsubscribe (RFC 8058): inboxes POST to the List-Unsubscribe URL. */
export async function POST(req: Request) {
  const id = verifyStopToken(new URL(req.url).searchParams.get("t"));
  if (!id) return page(400, INVALID);
  const { ok } = await stopBuyer(id);
  if (!ok) return page(500, "Something went wrong and your emails were not stopped. Reply to any of them and we will stop them for you.");
  return page(200, "Done. You won't get any more of these emails.");
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run lib/post-purchase-stop.test.ts lib/post-purchase-sequences.integration.test.ts && npx tsc --noEmit && grep -rn "stopSequence\|stopName" lib app components`
Expected: PASS; tsc exit 0; grep prints nothing.

- [ ] **Step 7: Commit**

```bash
git add lib/post-purchase-stop.ts app/email/stop/route.ts lib/post-purchase-stop.test.ts lib/post-purchase-sequences.integration.test.ts
git commit -m "Stop these emails pauses everything for the buyer until they buy again

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 5: The store series in Settings

**Files:**
- Modify (rewrite): `components/admin/post-purchase-section.tsx`
- Modify: `components/admin/settings-screen.tsx`, `app/admin/settings/page.tsx`
- Test: append to `components/admin/post-purchase-section.test.tsx`

**Interfaces:**
- Consumes: `OwnerType` with `"store"` and `getSequence` (Task 2); `savePostPurchaseAction` store handling (Task 2).
- Produces: `PostPurchaseSection` accepts `ownerType="store"`; `SettingsScreen` accepts `emailFollowUps?: ReactNode`, rendered under the Email group outside its form.

- [ ] **Step 1: Write the failing tests**

Append to `components/admin/post-purchase-section.test.tsx` (the file already has `root`, `click`, the mocked `save` action and imports `PostPurchaseSection` and `LAYOUT_DEFAULTS`):

```tsx
function mountStore() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <PostPurchaseSection ownerType="store" ownerId="22222222-2222-4222-8222-222222222222" ownerName="Funnel App"
        initial={{ id: null, enabled: false, layout: LAYOUT_DEFAULTS, emails: [] }} senderName="Ajit" accessUrl="https://grow.greaterinside.com/login" />,
    );
  });
  return host;
}

describe("the store series section", () => {
  it("names itself as the welcome email's follow-ups", () => {
    const host = mountStore();
    expect(host.querySelector("#pp-title")?.textContent).toContain("Follow-up emails");
    expect(host.textContent).toContain("Later purchases get only the welcome");
  });

  it("turning it on starts one follow-up 2 days after the welcome, which can be deleted", () => {
    const host = mountStore();
    click(host.querySelector('input[type="checkbox"]'));
    expect(host.textContent).toContain("2 days after the welcome email");
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Delete email")).toBe(true);
  });

  it("saves email 1's own delay", async () => {
    const host = mountStore();
    click(host.querySelector('input[type="checkbox"]'));
    await act(async () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!));
    const payload = save.mock.calls.at(-1)?.[0] as { ownerType: string; emails: { delayAmount: number }[] };
    expect(payload.ownerType).toBe("store");
    expect(payload.emails[0].delayAmount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/admin/post-purchase-section.test.tsx`
Expected: FAIL (the title reads "Post-purchase emails"; email 1 shows "Right after the welcome email").

- [ ] **Step 3: Rewrite the section**

Replace the whole of `components/admin/post-purchase-section.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import { EmailEditor } from "@/components/admin/email-editor";
import { savePostPurchaseAction, sendPostPurchaseTestAction } from "@/app/admin/post-purchase/actions";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { EMAIL_FONTS, LAYOUT_DEFAULTS, fillLine, starterDoc, type DelayUnit, type DocNode, type EmailLayout } from "@/lib/post-purchase-layout";
import type { OwnerType, Sequence } from "@/lib/post-purchase-store";

type Draft = { key: string; id: string | null; delayAmount: number; delayUnit: DelayUnit; subject: string; preheader: string; doc: DocNode };
const SAMPLE = (name: string, accessUrl: string) => ({ first_name: "Priya", offer_name: name, access_link: accessUrl });
const FOLLOW_UP_DOC: DocNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Write your follow-up here." }] }] };
let seq = 0;
const newKey = () => `e${Date.now()}${seq++}`;

function when(d: Draft, i: number, store: boolean) {
  if (i === 0 && !store) return "Right after the welcome email";
  const unit = d.delayUnit === "hours" ? (d.delayAmount === 1 ? "hour" : "hours") : d.delayAmount === 1 ? "day" : "days";
  return `${d.delayAmount} ${unit} after ${i === 0 ? "the welcome email" : `email ${i}`}`;
}

/**
 * Post-purchase emails for one offer or product, or the store series that
 * follows the welcome email. Off until turned on. An item's first email goes
 * right after the welcome; every store email waits its delay.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 */
export function PostPurchaseSection({ ownerType, ownerId, ownerName, initial, senderName, accessUrl }: {
  ownerType: OwnerType;
  ownerId: string;
  /** What the buyer bought, for the preview's personal details. */
  ownerName: string;
  initial: Sequence;
  /** From the store's email settings, so the preview shows what buyers get. */
  senderName: string;
  accessUrl: string;
}) {
  const store = ownerType === "store";
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
      setEmails([
        store
          ? { key: newKey(), id: null, delayAmount: 2, delayUnit: "days", subject: "", preheader: "", doc: FOLLOW_UP_DOC }
          : { key: newKey(), id: null, delayAmount: 0, delayUnit: "days", subject: `{{first_name}}, thank you for getting ${ownerName}`, preheader: "Everything is ready in your library.", doc: starterDoc(ownerName) },
      ]);
      setIdx(0);
    }
  };
  const add = () => {
    setEmails((all) => [...all, { key: newKey(), id: null, delayAmount: 2, delayUnit: "days", subject: "", preheader: "", doc: FOLLOW_UP_DOC }]);
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
    emails: emails.map((e, i) => ({ id: e.id, delayAmount: i === 0 && !store ? 0 : e.delayAmount, delayUnit: e.delayUnit, subject: e.subject, preheader: e.preheader, doc: e.doc })),
  });

  // A thrown action (offline, a deploy mid-save) leaves the draft as it is.
  const unreachable = { kind: "error", text: "Could not reach the server. Your changes are still here; try again." } as const;
  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await savePostPurchaseAction(payload());
      if (!res.ok) return setStatus({ kind: "error", text: res.error });
      setEmails((all) => all.map((e, i) => ({ ...e, id: res.emailIds[i] ?? e.id })));
      setStatus({ kind: "ok", text: "Saved." });
    } catch {
      setStatus(unreachable);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await sendPostPurchaseTestAction({ sequence: payload(), index: idx, ownerName });
      setStatus(res.ok ? { kind: "ok", text: `Test sent to ${res.to}.` } : { kind: "error", text: res.error });
    } catch {
      setStatus(unreachable);
    } finally {
      setBusy(false);
    }
  };

  const rendered = useMemo(
    () =>
      current && preview
        ? renderPostPurchaseEmail({ doc: current.doc, subject: current.subject, preheader: current.preheader, layout, vars: SAMPLE(ownerName, accessUrl), stopUrl: store || idx > 0 ? "https://grow.greaterinside.com/email/stop" : null })
        : null,
    [current, preview, layout, ownerName, accessUrl, idx, store],
  );

  const num = (k: keyof EmailLayout, v: string) => setLayout((l) => ({ ...l, [k]: Number(v) }));
  const inputCls = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

  return (
    <section className="rounded-2xl border border-border bg-surface" aria-labelledby="pp-title">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <h2 id="pp-title" className="text-base font-semibold">
            {store ? "Follow-up emails" : "Post-purchase emails"}{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-emerald-600/10 text-emerald-700" : "bg-surface-2 text-muted"}`}>{enabled ? "On" : "Off"}</span>
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            {store
              ? "Sent after the welcome email, on a buyer's first purchase. Later purchases get only the welcome. A buyer who clicks Stop these emails gets no more follow-ups, from here or any offer, until they buy again."
              : "Emails sent to the buyer after they buy this, in addition to the store’s welcome email. The first goes right after the welcome. Add follow-ups with a delay between each."}
          </p>
        </div>
        <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer">
          <input type="checkbox" className="peer sr-only" checked={enabled} onChange={(e) => turn(e.target.checked)} aria-label={store ? "Send follow-up emails after the welcome" : `Send post-purchase emails for ${ownerName}`} />
          <span className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      {!enabled && emails.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-muted">
          {store
            ? "No follow-ups are sent after the welcome. Turn this on to write the first one."
            : "Nothing extra is sent for this. Turn it on to write the email; a starter email is filled in for you to edit."}
        </p>
      ) : (
        current && (
          <>
            <div className="grid gap-3 border-t border-border px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Emails in this sequence</h3>
                <span className="text-xs text-muted">
                  {store
                    ? "Each email waits its delay after the one before. Edits reach buyers who are part-way through. Turning this off stops the rest for everyone."
                    : "The rest stop if the order is refunded or access ends. Stop these emails pauses every follow-up for that buyer until they buy again. Edits reach buyers who are part-way through. Turning this off stops the rest for everyone."}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Emails in this sequence">
                {emails.map((e, i) => (
                  <button key={e.key} type="button" role="tab" aria-selected={i === idx} onClick={() => { setIdx(i); setPreview(false); }}
                    className={`grid w-52 shrink-0 gap-0.5 rounded-xl border p-3 text-left ${i === idx ? "border-primary bg-primary/5" : "border-border hover:border-primary"}`}>
                    <span className="text-[11px] font-semibold text-muted">Email {i + 1}</span>
                    <span className="text-xs font-semibold text-primary">{when(e, i, store)}</span>
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
                  {idx === 0 && !store ? (
                    <span>Sent right after the welcome email, once checkout is over.</span>
                  ) : (
                    <>
                      <span>Send</span>
                      <input aria-label="Delay" type="number" min={1} max={365} className="w-20 rounded-lg border border-border bg-surface px-2 py-1" value={current.delayAmount} onChange={(e) => patch({ delayAmount: Math.max(1, Number(e.target.value) || 1) })} />
                      <select aria-label="Delay unit" className="rounded-lg border border-border bg-surface px-2 py-1" value={current.delayUnit} onChange={(e) => patch({ delayUnit: e.target.value as DelayUnit })}>
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                      <span>after {idx === 0 ? "the welcome email" : `email ${idx}`}</span>
                      <span className="flex-1" />
                      <button type="button" className="rounded-md px-2 py-1 disabled:opacity-40" disabled={idx <= (store ? 0 : 1)} onClick={() => move(idx - 1)} aria-label="Move earlier">↑</button>
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
                  <iframe title="Email preview" srcDoc={rendered.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mx-auto h-[640px] w-full rounded-xl border border-border bg-white" style={{ maxWidth: view === "mobile" ? 375 : "100%" }} />
                ) : (
                  <EmailEditor doc={current.doc} docKey={current.key} onChange={(doc) => patch({ doc })} layout={layout} view={view} />
                )}
              </div>

              <aside className="grid content-start gap-5 border-t border-border p-5 lg:border-l lg:border-t-0" aria-label="Email layout">
                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold">Inbox preview</h3>
                  <div className="grid gap-0.5 rounded-xl border border-border p-3 text-sm">
                    <span className="font-semibold">{senderName}</span>
                    <span>{fillLine(current.subject, SAMPLE(ownerName, accessUrl)) || "(no subject yet)"}</span>
                    <span className="truncate text-xs text-muted">{fillLine(current.preheader, SAMPLE(ownerName, accessUrl)) || "Preview text shows here"}</span>
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

- [ ] **Step 4: Give Settings a slot under the Email group**

In `components/admin/settings-screen.tsx`, add `import type { ReactNode } from "react";` beside the existing react import, add the prop to `SettingsScreen`'s parameter list and type:

```tsx
  emailFollowUps,
```

```tsx
  /** The store series' follow-ups, shown under the Email group. Outside the settings form: it saves itself. */
  emailFollowUps?: ReactNode;
```

and after the existing `{open === "typography" && <FontLibrary installed={fonts} />}` line add:

```tsx
          {open === "email" && emailFollowUps}
```

- [ ] **Step 5: Mount it from the settings page**

Replace `app/admin/settings/page.tsx` with:

```tsx
import { SettingsScreen } from "@/components/admin/settings-screen";
import { PostPurchaseSection } from "@/components/admin/post-purchase-section";
import { getSettings } from "@/lib/settings";
import { legalPlaceholdersFrom } from "@/lib/legal";
import { listFonts, fontFaceCss } from "@/lib/fonts";
import { getStoreId } from "@/lib/store";
import { getSequence } from "@/lib/post-purchase-store";
import { createServiceClient } from "@/lib/supabase/server";

/** A real offer's name for the preview's "What they bought"; the store series has no single item. */
async function sampleOfferName(storeId: string): Promise<string> {
  const { data } = await createServiceClient().from("offers").select("name").eq("store_id", storeId).order("created_at").limit(1).maybeSingle();
  return (data?.name as string | undefined) ?? "your purchase";
}

export default async function AdminSettingsPage() {
  const [settings, fonts, storeId] = await Promise.all([getSettings(), listFonts(), getStoreId()]);
  const [storeSeries, sample] = await Promise.all([getSequence("store", storeId), sampleOfferName(storeId)]);
  const mail = settings.postPurchaseEmail;
  return (
    <>
      {/* The faces, declared for this page only.
          Only @font-face — no --font-heading override — so a font that fails
          to load cannot change the admin's own typography. It exists so the
          specimen below shows the real face rather than an approximation of
          it, which is the entire point of a specimen. */}
      <style
        dangerouslySetInnerHTML={{
          __html: fontFaceCss(fonts, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
        }}
      />
      <SettingsScreen
      settings={settings}
      legalPlaceholders={legalPlaceholdersFrom(settings)}
      fonts={fonts.map((f) => ({
        id: f.id,
        family: f.family,
        source: f.source,
        count: f.files.length,
      }))}
      emailFollowUps={
        <PostPurchaseSection
          ownerType="store"
          ownerId={storeId}
          ownerName={sample}
          initial={storeSeries}
          senderName={mail.senderName || mail.senderEmail}
          accessUrl={mail.accessUrl}
        />
      }
      />
    </>
  );
}
```

(The comment inside is the file's existing comment, kept verbatim.)

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run components/admin/post-purchase-section.test.tsx lib/post-purchase-actions.test.ts app/admin/settings/save-group.test.ts && npx tsc --noEmit && npx eslint components/admin/post-purchase-section.tsx components/admin/settings-screen.tsx app/admin/settings/page.tsx`
Expected: PASS (the existing section tests plus 3 new); tsc exit 0; no lint errors.

- [ ] **Step 7: Commit**

```bash
git add components/admin/post-purchase-section.tsx components/admin/post-purchase-section.test.tsx components/admin/settings-screen.tsx app/admin/settings/page.tsx
git commit -m "Follow-up emails after the welcome, edited in Settings

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 6: Verify, document, hand over

**Files:**
- Modify: `docs/lessons.md` (append)

- [ ] **Step 1: Record the lesson**

Append to `docs/lessons.md`:

```markdown
## Post-purchase flows are per buyer, not per purchase (30 Sep 2026)

A flow is one buyer (order email, trimmed and lower-cased) on one sequence.
"Stop these emails" pauses all of that buyer's flows; their next purchase
resumes them. `orders.post_purchase_flows_at` is what makes processing an
order once-only: the thank-you page and the re-queue sweep both process it,
and without the stamp a flow that finished in between would start again. The
store-series integration tests skip themselves when a local store series
exists, rather than overwrite a developer's work.
```

- [ ] **Step 2: Full suite, tsc, lint**

Run: `set -o pipefail; npx vitest run 2>&1 | tail -30; echo "SUITE=${PIPESTATUS[0]}"; npx tsc --noEmit; echo "TSC=$?"`
Expected: `SUITE=0` (390+ files), `TSC=0`. Known flake: `lib/product-recurring.integration.test.ts` can time out under full-suite load and passes alone; if it is the only failure, run it alone and the suite once more.

- [ ] **Step 3: Commit**

```bash
git add docs/lessons.md
git commit -m "Lesson: post-purchase flows are per buyer

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

- [ ] **Step 4: Visual check (controller)**

Signed-in headless screenshots on the local dev server (browse `localhost`, not `127.0.0.1`; see memory `visual-verification-loop`): Settings, Email group, with the follow-ups section off, on (one follow-up "2 days after the welcome email"), and previewed. Also re-shoot one offer page to confirm the item section is unchanged apart from its note.

- [ ] **Step 5: Hand over (do not push)**

Report what was built, the screenshots, and the release order: apply 0091 by hand to production first (it creates the final shape; production never had Part 1's), check anon/authenticated have no privileges on the four tables, then the 60-second deploy notice and push on the owner's word.
