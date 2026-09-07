# One access record per thing bought — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one person hold several subscriptions to the same connected app — one per offer — so Instagram and LinkedIn can be bought, trialled and cancelled independently.

**Architecture:** The unique index on `ownership` moves from `(store_id, user_id, app_id)` to `(store_id, user_id, app_id, offer_id)` with `NULLS NOT DISTINCT`, and the revive branch that exists to bring a returning subscriber's cancelled row back to life keys on the offer too. The purchase-time app notification stops sending one offer's channels and goes through the existing `unionEntitlement`. Three readers that assumed one row per app are corrected.

**Tech Stack:** Postgres 15.8 (self-hosted Supabase), Next.js 15 server code, Stripe subscriptions, vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-ownership-per-offer-design.md`

## Global Constraints

- The new index is `(store_id, user_id, app_id, offer_id)` **`nulls not distinct`**, partial on `where app_id is not null`. The NULLS clause is required — app-originated rows carry no `offer_id` and one such row is live in production; without it they could duplicate without limit.
- `ownership_user_product_uq` is **untouched**. Product grants keep their shape.
- The revive branch stays. A returning subscriber's cancelled row must still be revived, not duplicated — it just keys on the offer now.
- Every app notification is **best-effort**. An app being down must never break a purchase, a webhook or a refund. Existing try/catch and retry-queueing behaviour is unchanged.
- `syncSubscriptionOwnership` matching on `stripe_subscription_id` is **already correct** and must not be changed — it becomes right on its own once a row exists per offer.
- This index governs **every** connected app, not only Content Engine. The Funnel App is subject to it and must be unaffected in row shape and count.
- Migrations do not run on deploy in this repo; they are applied by hand.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0069_ownership_per_offer.sql` (create) | Swaps the unique index. |
| `lib/checkout.ts` (modify, ~1338–1373) | Revive keys on the offer; the hand-built notify call is replaced by `pushAppEntitlement`. |
| `lib/app-sync.ts` (modify) | Adds `pushAppEntitlement`; fixes the app-originated update to touch only its own row. |
| `lib/library.ts` (modify, ~109–119) | `subscribedToApp` stops using `maybeSingle` and counts only live rows. |

---

## Task 1: The key becomes the thing bought

**Files:**
- Create: `supabase/migrations/0069_ownership_per_offer.sql`
- Modify: `lib/checkout.ts` (the `23505` revive branch, ~1338–1356)
- Test: `lib/ownership-per-offer.integration.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the index `ownership_user_app_offer_uq`; `grantOfferOwnership` inserting one row per offer.

**These two ship together and must not be split.** The old revive matches `(store, user, app)` with no offer filter — under the new index that update would rewrite *every* one of a person's channel rows on any purchase. The migration alone is worse than neither.

- [ ] **Step 1: Write the failing test**

Create `lib/ownership-per-offer.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const USER_EMAIL = "zz-ownership-per-offer@example.test";

describe.skipIf(!canRun)("one access record per thing bought (integration)", () => {
  let storeId: string;
  let userId: string;

  beforeEach(async () => {
    const db = createServiceClient();
    storeId = await getStoreId();
    const { data } = await db
      .from("users")
      .insert({ store_id: storeId, email: USER_EMAIL })
      .select("id")
      .single();
    userId = data!.id as string;
  });

  afterEach(async () => {
    const db = createServiceClient();
    await db.from("ownership").delete().eq("user_id", userId);
    await db.from("users").delete().eq("id", userId);
  });

  const row = (offerId: string | null) => ({
    store_id: storeId,
    user_id: userId,
    app_id: APP,
    offer_id: offerId,
    source: "grant",
    status: "active",
  });

  it("admits two rows for the same app when the offers differ", async () => {
    // The whole point. Instagram and LinkedIn are two purchases of one app.
    const db = createServiceClient();
    const a = await db.from("ownership").insert(row("00000000-0000-0000-0000-0000000000c1"));
    const b = await db.from("ownership").insert(row("07f3d2f5-1694-4a2f-bc9e-7fec9dc164ed"));
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it("still refuses a second row for the same offer", async () => {
    const db = createServiceClient();
    await db.from("ownership").insert(row("00000000-0000-0000-0000-0000000000c1"));
    const again = await db.from("ownership").insert(row("00000000-0000-0000-0000-0000000000c1"));
    expect(again.error?.code).toBe("23505");
  });

  it("refuses a second offer-less row, which NULLS NOT DISTINCT is what buys", async () => {
    // Postgres treats NULLs as distinct in a unique index by default, so
    // without that clause every app-originated row could duplicate forever.
    // One such row is live in production, so this is not hypothetical.
    const db = createServiceClient();
    const first = await db.from("ownership").insert(row(null));
    const second = await db.from("ownership").insert(row(null));
    expect(first.error).toBeNull();
    expect(second.error?.code).toBe("23505");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ownership-per-offer.integration.test.ts`
Expected: FAIL — "admits two rows for the same app when the offers differ" gets a `23505`, because the old index forbids it.

If every test is SKIPPED, load the env with `set -a; source .env.local; set +a` and run again. Do not proceed on a skipped suite.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0069_ownership_per_offer.sql`:

```sql
-- One access record per thing bought, not per app.
--
-- Content Engine is now sold as three offers — Instagram, LinkedIn, and both —
-- and a person may hold more than one at a time. The old key allowed one
-- ownership row per (store, user, app), so buying the second offer did not add
-- a record: grantOfferOwnership caught the 23505 and overwrote the first row in
-- place, taking its stripe_subscription_id with it.
--
-- Three things followed from that, all silent: the first subscription was
-- orphaned, so a later cancellation webhook found no row and did nothing while
-- the card kept being charged; and the app was told at the moment of the second
-- purchase to revoke the first channel.
alter table ownership drop constraint if exists ownership_user_app_uq;
drop index if exists ownership_user_app_uq;

-- NULLS NOT DISTINCT is required, not tidiness. Postgres treats NULLs as
-- distinct in a unique index by default, and app-originated rows — source
-- 'app', inserted by the bridge when an app reports a sale it made itself —
-- carry no offer_id. Without this clause those rows could duplicate without
-- limit. One of them is live today, so this is a real case.
create unique index if not exists ownership_user_app_offer_uq
  on ownership (store_id, user_id, app_id, offer_id)
  nulls not distinct
  where app_id is not null;

-- Product grants keep their own shape; nothing here touches them.
```

- [ ] **Step 4: Apply it locally**

Run: `npx supabase db reset`
Expected: every migration applies with no error, including `0069`.

- [ ] **Step 5: Key the revive on the offer**

In `lib/checkout.ts`, in `grantOfferOwnership`'s `23505` branch (~1345), the update currently matches three columns. Add the fourth, and extend the comment to say why:

```ts
    // 23505 means a row for this (store, user, app, OFFER) already exists. It is
    // NOT simply a duplicate to ignore: a returning subscriber's old row is
    // still there marked `canceled`, and now that cancelled rows no longer count
    // as owned, they can buy again — so the row must be revived. Swallowing the
    // conflict would leave them paid up with status `canceled` and no access.
    //
    // Keyed on the offer since 0069. Without that this update would rewrite
    // EVERY one of a person's channel rows on any purchase — buying LinkedIn
    // would point the Instagram row at the LinkedIn subscription.
    if (error?.code === "23505") {
      const { error: reviveErr } = await db
        .from("ownership")
        .update({
          offer_id: offer.id,
          source,
          stripe_subscription_id: subscriptionId,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("store_id", storeId)
        .eq("user_id", userId)
        .eq("app_id", offer.grantAppId)
        .eq("offer_id", offer.id);
      if (reviveErr) throw new Error(`grant offer (app revive): ${reviveErr.message}`);
    } else if (error) {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/ownership-per-offer.integration.test.ts`
Expected: PASS, 3 cases, none skipped.

- [ ] **Step 7: Run the whole suite and the typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, and PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0069_ownership_per_offer.sql lib/checkout.ts lib/ownership-per-offer.integration.test.ts
git commit -m "Key an app's access record on the offer that granted it"
```

---

## Task 2: The app hears the union at purchase

**Files:**
- Modify: `lib/app-sync.ts` (add `pushAppEntitlement`)
- Modify: `lib/checkout.ts` (~1360–1380, replace the hand-built notify call)
- Test: `lib/entitlement-union.test.ts` (extend)

**Interfaces:**
- Consumes: `unionEntitlement(rows: { channels: string[]; status: OwnershipStatus }[])` from `lib/app-sync.ts`, already built and tested.
- Produces:

```ts
export async function pushAppEntitlement(
  storeId: string,
  userId: string,
  appId: string,
  ctx: { email: string; fullName?: string | null; stripeCustomerId: string | null },
): Promise<void>
```

**Why:** `grantOfferOwnership` builds its own `notifyAppEntitlement` call from the offer it just granted, so at the moment LinkedIn is bought the app hears `channels: ["linkedin"]` and Instagram goes dark. Meanwhile `pushOwnershipStateToApps` sends the union. Two paths, two answers, and whichever ran last won.

- [ ] **Step 1: Write the failing test**

Append to `lib/entitlement-union.test.ts`:

```ts
import { readFileSync } from "node:fs";

describe("the purchase path and the sync path agree", () => {
  it("grantOfferOwnership sends the union, not one offer's channels", () => {
    // The bug this closes: buying LinkedIn told the app channels:["linkedin"],
    // revoking Instagram at the moment of the second purchase. Two code paths
    // that answer the same question differently is the defect, not the wording.
    const src = readFileSync("lib/checkout.ts", "utf8");
    expect(src).toContain("pushAppEntitlement");
    // The hand-built call passed the single offer's channels straight through.
    expect(src).not.toMatch(/channels:\s*offer\.grantChannels/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/entitlement-union.test.ts`
Expected: FAIL — `lib/checkout.ts` has no `pushAppEntitlement` and still contains `channels: offer.grantChannels`.

- [ ] **Step 3: Write `pushAppEntitlement`**

Add to `lib/app-sync.ts`, below `unionEntitlement`:

```ts
/**
 * Tell an app everything one person is entitled to in it, right now.
 *
 * Called at the moment of a purchase, where the tempting thing is to send the
 * channels of the offer just bought. That was the bug: a person buying
 * LinkedIn while holding Instagram had the app told `channels: ["linkedin"]`,
 * and the receiving app replaces its list, so Instagram went dark at the exact
 * moment they paid for more.
 *
 * Reads the rows back rather than trusting what the caller just wrote, so this
 * and `pushOwnershipStateToApps` cannot disagree — they now compute the same
 * answer from the same place.
 *
 * Best-effort, like every other app call: a failure here never breaks a
 * purchase, and the handoff re-provisions on first open.
 */
export async function pushAppEntitlement(
  storeId: string,
  userId: string,
  appId: string,
  ctx: { email: string; fullName?: string | null; stripeCustomerId: string | null },
): Promise<void> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("ownership")
    .select("offer_id, status, stripe_subscription_id")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .eq("app_id", appId);
  if (!rows || rows.length === 0) return;

  const offerIds = [...new Set(rows.map((r) => r.offer_id).filter(Boolean) as string[])];
  const { data: offers } = offerIds.length
    ? await db.from("offers").select("id, grant_entitlement_key, grant_channels").in("id", offerIds)
    : { data: [] as { id: string; grant_entitlement_key: string | null; grant_channels: string[] | null }[] };
  const byOffer = new Map((offers ?? []).map((o) => [o.id as string, o]));

  const shaped = rows.map((r) => ({
    channels: (byOffer.get(r.offer_id as string)?.grant_channels as string[] | null) ?? [],
    status: r.status as OwnershipStatus,
  }));
  const { channels, status } = unionEntitlement(shaped);

  const live = rows.find((r) => r.status === "active" || r.status === "trialing") ?? rows[0];
  const entitlementKey =
    (byOffer.get(live.offer_id as string)?.grant_entitlement_key as string | null) ?? null;

  await notifyAppEntitlement({
    appId,
    email: ctx.email,
    fullName: ctx.fullName ?? null,
    entitlementKey,
    channels,
    status,
    stripeCustomerId: ctx.stripeCustomerId,
    stripeSubscriptionId: (live.stripe_subscription_id as string) ?? null,
  });
}
```

- [ ] **Step 4: Call it from the purchase path**

In `lib/checkout.ts`, `grantOfferOwnership`'s `if (ctx) { … }` block currently looks up the buyer's username and then calls `notifyAppEntitlement` by hand with `channels: offer.grantChannels`. Replace the whole `notifyAppEntitlement({ … })` call — keeping the username lookup that feeds `fullName` — with:

```ts
      await pushAppEntitlement(storeId, userId, offer.grantAppId, {
        email: ctx.email,
        fullName: ctx.fullName ?? (buyer?.username as string | null) ?? null,
        stripeCustomerId: ctx.stripeCustomerId,
      });
```

Import `pushAppEntitlement` from `@/lib/app-sync`. If `notifyAppEntitlement` is left unused in this file, remove its import; if it is used elsewhere in the file, leave it.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run lib/entitlement-union.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. Existing tests asserting the old hand-built call's shape need updating to the new one — update them to assert the union behaviour rather than deleting them.

- [ ] **Step 7: Commit**

```bash
git add lib/app-sync.ts lib/checkout.ts lib/entitlement-union.test.ts
git commit -m "Tell an app the whole entitlement at the moment of purchase"
```

---

## Task 3: The readers that assumed one row

**Files:**
- Modify: `lib/library.ts` (~109–119, `subscribedToApp`)
- Modify: `lib/app-sync.ts` (~277–310, `upsertAppOwnership`)
- Test: `lib/ownership-per-offer.integration.test.ts` (extend)

**Interfaces:**
- Consumes: the index from Task 1.
- Produces: no new exports.

**Two bugs, both silent:**

`subscribedToApp` uses `.maybeSingle()` on `(user_id, app_id)`. With two rows PostgREST returns an error, `data` is null, and the function reports **not subscribed** — so the library would offer someone a standing offer for something they already pay for. It also counts cancelled rows as subscribed today, which is wrong in the other direction.

`upsertAppOwnership` updates every row matching `(store_id, user_id, app_id)`. With channel rows in play, an app reporting one subscription's status would rewrite **all** of them.

- [ ] **Step 1: Write the failing test**

Append to `lib/ownership-per-offer.integration.test.ts`, inside the existing describe block:

```ts
  it("counts someone with two live rows as subscribed", async () => {
    // maybeSingle() over two rows errors, and the caller reads that as "not
    // subscribed" — which would offer them something they already pay for.
    const db = createServiceClient();
    await db.from("ownership").insert(row("00000000-0000-0000-0000-0000000000c1"));
    await db.from("ownership").insert(row("07f3d2f5-1694-4a2f-bc9e-7fec9dc164ed"));
    const { subscribedToApp } = await import("@/lib/library");
    expect(await subscribedToApp(userId, APP)).toBe(true);
  });

  it("does not count someone whose every row is cancelled", async () => {
    const db = createServiceClient();
    await db.from("ownership").insert({ ...row("00000000-0000-0000-0000-0000000000c1"), status: "canceled" });
    const { subscribedToApp } = await import("@/lib/library");
    expect(await subscribedToApp(userId, APP)).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ownership-per-offer.integration.test.ts`
Expected: FAIL on both — the first because `maybeSingle` errors over two rows, the second because a cancelled row currently counts.

- [ ] **Step 3: Fix `subscribedToApp`**

In `lib/library.ts`, replace the function body:

```ts
export async function subscribedToApp(userId: string, appId: string): Promise<boolean> {
  const db = createServiceClient();
  // Not maybeSingle: since 0069 a person can hold one row per offer of the same
  // app, and maybeSingle over two rows errors — which this function would have
  // read as "not subscribed", offering them something they already pay for.
  //
  // And only LIVE rows count. A cancelled row is a record that they once had
  // it, not a subscription.
  const { data } = await db
    .from("ownership")
    .select("id")
    .eq("user_id", userId)
    .eq("app_id", appId)
    .in("status", ["active", "trialing", "past_due"])
    .limit(1);
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Fix the app-originated update**

In `lib/app-sync.ts`, `upsertAppOwnership` must touch only the row it means. Replace its update with one that prefers the subscription id when the caller has one, and otherwise the offer-less row this function itself creates:

```ts
  const db = createServiceClient();
  // Since 0069 a person can hold one row per offer of the same app, so this
  // must name the row it means. An app reporting one subscription's status
  // would otherwise rewrite every channel a person holds.
  let q = db
    .from("ownership")
    .update({
      status: args.status,
      stripe_subscription_id: args.stripeSubscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", args.storeId)
    .eq("user_id", args.userId)
    .eq("app_id", args.appId);
  q = args.stripeSubscriptionId
    ? q.eq("stripe_subscription_id", args.stripeSubscriptionId)
    : q.is("offer_id", null);
  const { data: updated } = await q.select("id");
  if (updated && updated.length > 0) return;
```

Also update the comment above the function — it currently says the index is on `(store_id, user_id, app_id)`, which stopped being true in 0069.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run lib/ownership-per-offer.integration.test.ts && npx tsc --noEmit`
Expected: PASS, 5 cases, none skipped; typecheck clean.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/library.ts lib/app-sync.ts lib/ownership-per-offer.integration.test.ts
git commit -m "Stop assuming one access record per app"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Index moves to `(store_id, user_id, app_id, offer_id)` | 1 |
| `nulls not distinct`, and it is load-bearing | 1 (asserted by a test) |
| `ownership_user_product_uq` untouched | 1 (migration touches only the app index) |
| Revive keys on the offer | 1 |
| Returning subscriber still revived, not duplicated | 1 (asserted) |
| `pushAppEntitlement` sends the union at purchase | 2 |
| The two paths finally agree | 2 |
| `subscribedToApp` handles two rows and counts only live ones | 3 |
| App-originated update touches only its own row | 3 |
| `app-backfill` needs no change | none — verified correct as-is in the spec |
| `syncSubscriptionOwnership` needs no change | none — becomes correct on its own |
| Best-effort app calls unchanged | 2 (stated in the constraint block) |

No gaps.

**2. Placeholder scan.** No "TBD", no "handle errors". Task 2 Step 4 and Task 3 Step 4 describe an edit to a block whose exact current shape the implementer reads, but both name the file, the function, the replacement code and the invariant.

**3. Type consistency.** `pushAppEntitlement(storeId, userId, appId, ctx)` is declared once and called once with that arity. `unionEntitlement` takes `{ channels, status }[]` — `pushAppEntitlement` shapes its rows to exactly that. `OwnershipStatus` is the existing union type and is used unchanged.
