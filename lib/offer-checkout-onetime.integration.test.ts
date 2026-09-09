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

    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });

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
    // offer-checkout-complete.integration.test.ts.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });
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
});
