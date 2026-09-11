import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];
const madeVisits: string[] = [];

// A throwaway offer + user, the shared shape both new visit_id tests need.
// Its own function rather than reusing the fixture inline twice — the two
// tests differ only in whether a visit is passed to startOfferCheckout.
async function makeOfferAndBuyer(keyPrefix: string) {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const offerId = crypto.randomUUID();
  made.push(offerId);
  const { error } = await db.from("offers").insert({
    id: offerId,
    store_id: storeId,
    key: `zz-${keyPrefix}-${offerId}`,
    name: `zz ${keyPrefix} fixture`,
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "one_time",
    trial_days: null,
    price_cents: 4700,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
  });
  if (error) throw new Error(`fixture offer: ${error.message}`);

  const email = `${keyPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.test`;
  const createdUser = await db.auth.admin.createUser({ email, email_confirm: true });
  const userId = createdUser.data.user!.id;
  users.push(userId);
  await db.from("users").insert({ id: userId, store_id: storeId, email });
  return { offerId, userId, email };
}

async function makeVisit() {
  const db = createServiceClient();
  const { data, error } = await db
    .from("visits")
    .insert({
      store_id: await getStoreId(),
      anon_id: `zz-offervisit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      landing_path: "/zz",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`fixture visit: ${error?.message}`);
  madeVisits.push(data.id as string);
  return data.id as string;
}

describe.skipIf(!canRun)("buying a one-time offer (integration)", () => {
  it("takes one on-session payment and grants exactly once", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    const offerId = crypto.randomUUID();
    made.push(offerId);
    const { error } = await db.from("offers").insert({
      id: offerId,
      store_id: storeId,
      key: `zz-onetime-${offerId}`,
      name: "zz one-time fixture",
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      grant_channels: [],
      billing_type: "one_time",
      trial_days: null,
      price_cents: 4700,
      currency: "usd",
      headline: "fixture",
      description: "fixture",
    });
    if (error) throw new Error(`fixture offer: ${error.message}`);

    const email = `onetime_${Date.now()}@example.test`;
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    const userId = created.data.user!.id;
    users.push(userId);
    await db.from("users").insert({ id: userId, store_id: storeId, email });

    const start = await startOfferCheckout({ userId, email, offerId });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.mode).toBe("payment");

    const piId = start.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });

    expect(await completeOfferCheckout(piId)).toEqual({ ok: true, orderId: expect.any(String) });

    const own = await db.from("ownership").select("status").eq("user_id", userId);
    expect(own.data).toHaveLength(1);
    expect(own.data![0].status).toBe("active");

    const orders = await db
      .from("orders")
      .select("total_cents, stripe_payment_intent_id, stripe_setup_intent_id")
      .eq("user_id", userId);
    expect(orders.data).toHaveLength(1);
    expect(orders.data![0].total_cents).toBe(4700);
    expect(orders.data![0].stripe_payment_intent_id).toBe(piId);
    expect(orders.data![0].stripe_setup_intent_id).toBeNull();

    // The buyer refreshes the return page. This is prevented by the sequential
    // guarantee (eligibility re-check); the concurrent race (webhook + return route
    // landing at once) is covered separately by Promise.all tests in
    // offer-checkout-complete.integration.test.ts. orderId still comes back on
    // this PAID path's short-circuit (findable by intent id) — that's what lets
    // a webhook-wins race still resolve its OTO on the buyer's own trip here.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true, orderId: expect.any(String) });
    const again = await db.from("ownership").select("id").eq("user_id", userId);
    expect(again.data).toHaveLength(1);

    // And exactly one charge exists for this purchase.
    const pi = await stripe().paymentIntents.retrieve(piId);
    expect(pi.amount).toBe(4700);
    expect(pi.status).toBe("succeeded");
  });

  // book-launch-system is priced 0 in production today. Before this fix,
  // paymentIntents.create threw on anything under Stripe's own floor, and
  // nothing between there and the browser caught it: onSubmit awaits this
  // server action with no try/catch of its own, so the throw became an
  // unhandled rejection and setBusy(false) never ran — the button sat on
  // "Processing" forever with no message. The whole point of this test is
  // that the call below RESOLVES rather than rejects.
  it("refuses a one-time offer priced below the minimum charge, rather than hanging with no message", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    for (const priceCents of [0, 49]) {
      const offerId = crypto.randomUUID();
      made.push(offerId);
      const { error } = await db.from("offers").insert({
        id: offerId,
        store_id: storeId,
        key: `zz-toolow-${offerId}`,
        name: "zz too-low fixture",
        grant_type: "subscription",
        grant_app_id: APP,
        grant_entitlement_key: "content-engine",
        grant_channels: [],
        billing_type: "one_time",
        trial_days: null,
        price_cents: priceCents,
        currency: "usd",
        headline: "fixture",
        description: "fixture",
      });
      if (error) throw new Error(`fixture offer: ${error.message}`);

      const email = `toolow_${priceCents}_${Date.now()}@example.test`;
      const created = await db.auth.admin.createUser({ email, email_confirm: true });
      const userId = created.data.user!.id;
      users.push(userId);
      await db.from("users").insert({ id: userId, store_id: storeId, email });

      const start = await startOfferCheckout({ userId, email, offerId });
      expect(start.ok, `price_cents ${priceCents} should refuse, not throw`).toBe(false);
      if (start.ok) continue;
      expect(start.error.length).toBeGreaterThan(0); // a message, not blank
    }
  });

  // Fix round 1, Important 2: nothing exercised the visit id anywhere on
  // this path — the intent's metadata, the order's visit_id, or the
  // purchase milestone. A dropped write at any of those points would have
  // shipped green.
  it("carries visitId from the intent's metadata onto the order and records the purchase milestone against it", async () => {
    const { offerId, userId, email } = await makeOfferAndBuyer("offervisit");
    const visitId = await makeVisit();

    const start = await startOfferCheckout({ userId, email, offerId, visitId });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const piId = start.clientSecret.split("_secret_")[0];

    // Proves startOfferCheckout itself wrote it — before completion touches
    // anything.
    const piBefore = await stripe().paymentIntents.retrieve(piId);
    expect(piBefore.metadata.visitId).toBe(visitId);

    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    const result = await completeOfferCheckout(piId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("visit_id, total_cents")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(order!.visit_id).toBe(visitId);

    // recordVisitStep's own upsert runs before completeOfferCheckout returns
    // (unlike finalizeOrder's placement, this one is awaited transitively by
    // the time the function resolves the surrounding try — but it is still
    // `void`-called, so poll rather than assume).
    let steps: { order_id: string | null; value_cents: number | null }[] | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await db
        .from("visit_steps")
        .select("order_id, value_cents")
        .eq("visit_id", visitId)
        .eq("step", "purchase");
      if (data && data.length > 0) {
        steps = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(steps).toHaveLength(1);
    expect(steps![0].order_id).toBe(result.orderId);
    expect(steps![0].value_cents).toBe(order!.total_cents);
  });

  // Fix round 1, Important 2: Stripe metadata is strings-only, so a null
  // visitId is written as "" at start (lib/offer-checkout.ts) and must read
  // back as null, never as the empty string or the literal text "null".
  it("writes a null visit_id, not the string \"null\" or empty string, when no visit was resolved at checkout", async () => {
    const { offerId, userId, email } = await makeOfferAndBuyer("offernovisit");

    const start = await startOfferCheckout({ userId, email, offerId });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const piId = start.clientSecret.split("_secret_")[0];

    const piBefore = await stripe().paymentIntents.retrieve(piId);
    expect(piBefore.metadata.visitId).toBe(""); // the encoding, proven directly

    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true, orderId: expect.any(String) });

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("visit_id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(order!.visit_id).toBeNull();
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id);
    await db.from("orders").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  for (const id of made) await db.from("offers").delete().eq("id", id);
  // visit_steps cascades off visits (0080); orders.visit_id is ON DELETE SET
  // NULL, so this is safe even though the orders above are deleted first.
  if (madeVisits.length) await db.from("visits").delete().in("id", madeVisits);
});
