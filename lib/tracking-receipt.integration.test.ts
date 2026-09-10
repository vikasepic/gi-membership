import { describe, it, expect, afterAll, vi } from "vitest";

// Real Postgres. Skips without a service-role key.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * A repeat buyer's trial conversion must report the campaign of the ORDER
 * that trial came from, not whatever order happens to be their most recent.
 *
 * reportTrialConverted used to take utm_first/utm_last/referrer off "the
 * most recent order for this user with a visitor_id" — right for IP, country
 * and click ids, which are person-level and stable across a buyer's orders,
 * and wrong for campaign, which is order-level. A buyer who took a trial on
 * one product from one campaign, then later bought something else from a
 * different campaign, had the trial's Subscribe event — GA4's own comment
 * calls it "the event worth optimising towards" — reported under the LATER
 * order's campaign. Real rows, not a mock of the DB: the whole question is
 * which order the join lands on.
 */

const sent: unknown[] = [];
vi.mock("@/lib/tracking", async (orig) => ({
  ...(await orig<typeof import("@/lib/tracking")>()),
  trackServerEvent: async (e: unknown) => {
    sent.push(e);
  },
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { reportTrialConverted } = await import("@/lib/tracking-receipt");

const APP = "00000000-0000-0000-0000-0000000000a1"; // seeded fixture app, reused by other suites

const createdEmails: string[] = [];
const createdOfferIds: string[] = [];
const createdOrderIds: string[] = [];
const createdVisitorIds: string[] = [];
const SUB_ID = `zz_sub_${Date.now()}`;

async function buyer() {
  const db = createServiceClient();
  const email = `zztrialattr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
  createdEmails.push(email);
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const userId = created.data.user.id;
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: "trialattr" });
  return { userId, email };
}

async function makeOffer() {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  createdOfferIds.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-trialattr-${id}`,
    name: "zz trial-attribution fixture",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "recurring",
    interval: "month",
    interval_count: 1,
    trial_days: 7,
    price_cents: 1900,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
  });
  if (error) throw new Error(`test fixture: offer: ${error.message}`);
  return id;
}

describe.skipIf(!canRun)("reportTrialConverted's campaign (integration)", () => {
  it("reports the trial's own order, not a later, different order's", async () => {
    const db = createServiceClient();
    const { userId } = await buyer();
    const offerId = await makeOffer();

    // A visitor row, so the OLD ("most recent order with a visitor") query has
    // something to pick — attached to the LATER order, never the trial's own.
    const { data: visitor, error: visitorErr } = await db
      .from("visitors")
      .insert({ store_id: await getStoreId(), anon_id: `zz-trialattr-${Date.now()}` })
      .select("id")
      .single();
    if (visitorErr || !visitor) throw new Error(`test fixture: visitor: ${visitorErr?.message}`);
    createdVisitorIds.push(visitor.id as string);

    // The order the trial subscription actually came from — older, no
    // visitor attached, so the buggy "most recent with a visitor" read would
    // never have picked it.
    const { data: trialOrder, error: trialOrderErr } = await db
      .from("orders")
      .insert({
        store_id: await getStoreId(),
        user_id: userId,
        email: "zz@example.com",
        status: "paid",
        created_at: "2026-01-01T00:00:00Z",
        utm_first: { utm_source: "ig", utm_campaign: "TRIAL-ORIGIN" },
        utm_last: { utm_source: "meta", utm_campaign: "TRIAL-ORIGIN" },
        referrer: null,
      })
      .select("id")
      .single();
    if (trialOrderErr || !trialOrder) throw new Error(`test fixture: trial order: ${trialOrderErr?.message}`);
    createdOrderIds.push(trialOrder.id as string);

    // A later, unrelated order — the one the OLD code would have borrowed
    // campaign from, because it is more recent AND carries a visitor_id.
    const { data: laterOrder, error: laterOrderErr } = await db
      .from("orders")
      .insert({
        store_id: await getStoreId(),
        user_id: userId,
        email: "zz@example.com",
        status: "paid",
        created_at: "2026-06-01T00:00:00Z",
        visitor_id: visitor.id,
        utm_first: { utm_source: "google", utm_campaign: "WRONG-CAMPAIGN" },
        utm_last: { utm_source: "google", utm_campaign: "WRONG-CAMPAIGN" },
        referrer: null,
      })
      .select("id")
      .single();
    if (laterOrderErr || !laterOrder) throw new Error(`test fixture: later order: ${laterOrderErr?.message}`);
    createdOrderIds.push(laterOrder.id as string);

    // The line that ties the subscription id to the trial's order — exactly
    // what fulfilOffer writes.
    const { error: itemErr } = await db.from("order_items").insert({
      store_id: await getStoreId(),
      order_id: trialOrder.id,
      kind: "oto",
      offer_id: offerId,
      description: "zz trial-attribution fixture",
      amount_cents: 0,
      stripe_subscription_id: SUB_ID,
    });
    if (itemErr) throw new Error(`test fixture: order_items: ${itemErr.message}`);

    // What makes this the trial reportTrialConverted looks up: an ownership
    // row keyed on the subscription, carrying the offer.
    const { error: ownErr } = await db.from("ownership").insert({
      store_id: await getStoreId(),
      user_id: userId,
      app_id: APP,
      offer_id: offerId,
      source: "grant",
      stripe_subscription_id: SUB_ID,
      status: "trialing",
    });
    if (ownErr) throw new Error(`test fixture: ownership: ${ownErr.message}`);

    await reportTrialConverted(SUB_ID, userId);

    expect(sent).toHaveLength(1);
    const event = sent[0] as { attribution: { last: Record<string, string>; first: Record<string, string> } };
    expect(event.attribution.last.utm_campaign).toBe("TRIAL-ORIGIN");
    expect(event.attribution.first.utm_source).toBe("ig");
    expect(event.attribution.last.utm_campaign).not.toBe("WRONG-CAMPAIGN");
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  await db.from("order_items").delete().eq("stripe_subscription_id", SUB_ID);
  await db.from("ownership").delete().eq("stripe_subscription_id", SUB_ID);
  for (const id of createdOrderIds) await db.from("orders").delete().eq("id", id);
  for (const id of createdVisitorIds) await db.from("visitors").delete().eq("id", id);
  for (const id of createdOfferIds) await db.from("offers").delete().eq("id", id);
  for (const email of createdEmails) {
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (!user) continue;
    await db.from("users").delete().eq("id", user.id);
    await db.auth.admin.deleteUser(user.id as string);
  }
});
