import { describe, it, expect, afterAll } from "vitest";

const { createServiceClient } = await import("@/lib/supabase/server");
const { recordMismatches, ourSubscriptionIds } = await import("@/lib/money-reconcile");
const { getStoreId } = await import("@/lib/store");

/**
 * A mismatch is reported once and stays on /admin/errors until someone deals
 * with it, rather than adding a row every night it is still true.
 */

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY = `refunded_here_not_in_stripe:zz-${Date.now()}`;

describe.skipIf(!canRun)("recording mismatches (integration)", () => {
  const rows = async () =>
    (await createServiceClient().from("error_events").select("id, resolved_at").eq("source", "money_reconcile").contains("context", { key: KEY })).data ?? [];
  const mismatch = { key: KEY, kind: "refunded_here_not_in_stripe" as const, message: "zz test mismatch", context: {} };

  it("records a new mismatch once, however many nights it is found", async () => {
    expect(await recordMismatches([mismatch])).toBe(1);
    expect(await recordMismatches([mismatch])).toBe(0);
    expect(await rows()).toHaveLength(1);
  });

  it("reports it again once the row is resolved but the mismatch is still there", async () => {
    // Resolving should mean fixing. A mismatch still true the next night is news.
    const [row] = await rows();
    await createServiceClient().from("error_events").update({ resolved_at: new Date().toISOString() }).eq("id", row.id);
    expect(await recordMismatches([mismatch])).toBe(1);
  });
});

describe.skipIf(!canRun)("which subscriptions are ours (integration)", () => {
  it("only those with a Grow offer or product: the table also holds other apps' (1 Oct 2026 dry run flagged 31 of their invoices)", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    // Its own offer, not the store's oldest: standing-offer-order inserts
    // offers dated 2000-2002 and deletes them after each test, so in a parallel
    // run "the oldest" was often one of those, gone (offer_id SET NULL) before
    // ourSubscriptionIds read it back.
    const { data: offer, error: offerErr } = await db
      .from("offers")
      .insert({
        store_id: storeId, key: `zz-reconcile-${Date.now()}`, name: "zz reconcile fixture", grant_type: "subscription",
        grant_app_id: "00000000-0000-0000-0000-0000000000a1", grant_entitlement_key: "content-engine", grant_channels: [],
        billing_type: "recurring", interval: "month", interval_count: 1, price_cents: 12000, currency: "usd",
        headline: "fixture", description: "fixture", active: false,
      })
      .select("id")
      .single();
    if (offerErr || !offer) throw new Error(`fixture offer: ${offerErr?.message}`);
    const row = (sub: string, offerId: string | null) => ({
      store_id: storeId, stripe_subscription_id: sub, offer_id: offerId, status: "active", amount_cents: 12000, currency: "usd",
      cancel_at_period_end: false, paid_invoices: 1, paid_total_cents: 12000, livemode: false, started_at: new Date().toISOString(),
    });
    const grow = `sub_zz_grow_${Date.now()}`;
    const other = `sub_zz_other_${Date.now()}`;
    await db.from("subscriptions").insert([row(grow, offer!.id as string), row(other, null)]);
    try {
      const ids = await ourSubscriptionIds();
      expect(ids.has(grow)).toBe(true);
      expect(ids.has(other)).toBe(false);
    } finally {
      await db.from("subscriptions").delete().in("stripe_subscription_id", [grow, other]);
      await db.from("offers").delete().eq("id", offer.id);
    }
  });
});

afterAll(async () => {
  if (!canRun) return;
  await createServiceClient().from("error_events").delete().eq("source", "money_reconcile").contains("context", { key: KEY });
});
