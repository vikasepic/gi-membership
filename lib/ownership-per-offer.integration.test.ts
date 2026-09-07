import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const USER_EMAIL = "zz-ownership-per-offer@example.test";
const SEEDED_OFFER = "00000000-0000-0000-0000-0000000000c1";

describe.skipIf(!canRun)("one access record per thing bought (integration)", () => {
  let storeId: string;
  let userId: string;
  let secondOfferId: string;

  beforeEach(async () => {
    const db = createServiceClient();
    storeId = await getStoreId();
    // users.id has no default (it mirrors auth.users.id) — every other
    // integration test in this repo supplies it explicitly; the brief's
    // insert omitted it and fails with 23502, so it is added here too.
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: storeId, email: USER_EMAIL });

    // The test needs two distinct *existing* offer ids (offer_id has an FK to
    // offers). The brief's second id is a real production offer that isn't in
    // the local seed, so insert a throwaway one here instead — same shape as
    // the seeded Content Engine offer, just a second row pointing at the same
    // app, so "two purchases of one app" is exercised with real FK targets.
    secondOfferId = crypto.randomUUID();
    const { error: offerErr } = await db.from("offers").insert({
      id: secondOfferId,
      store_id: storeId,
      key: `zz-ownership-per-offer-${secondOfferId}`,
      name: "zz throwaway offer (ownership-per-offer test)",
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 7,
      price_cents: 4700,
      currency: "usd",
      headline: "throwaway",
      description: "throwaway",
    });
    if (offerErr) throw new Error(`test fixture: insert throwaway offer: ${offerErr.message}`);
  });

  afterEach(async () => {
    const db = createServiceClient();
    // ownership rows reference the offer, so they must go first.
    await db.from("ownership").delete().eq("user_id", userId);
    await db.from("users").delete().eq("id", userId);
    await db.from("offers").delete().eq("id", secondOfferId);
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
    const a = await db.from("ownership").insert(row(SEEDED_OFFER));
    const b = await db.from("ownership").insert(row(secondOfferId));
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it("still refuses a second row for the same offer", async () => {
    const db = createServiceClient();
    await db.from("ownership").insert(row(SEEDED_OFFER));
    const again = await db.from("ownership").insert(row(SEEDED_OFFER));
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

  it("counts someone with two live rows as subscribed", async () => {
    // maybeSingle() over two rows errors, and the caller reads that as "not
    // subscribed" — which would offer them something they already pay for.
    const db = createServiceClient();
    await db.from("ownership").insert(row(SEEDED_OFFER));
    await db.from("ownership").insert(row(secondOfferId));
    const { subscribedToApp } = await import("@/lib/library");
    expect(await subscribedToApp(userId, APP)).toBe(true);
  });

  it("does not count someone whose every row is cancelled", async () => {
    const db = createServiceClient();
    await db.from("ownership").insert({ ...row(SEEDED_OFFER), status: "canceled" });
    const { subscribedToApp } = await import("@/lib/library");
    expect(await subscribedToApp(userId, APP)).toBe(false);
  });
});
