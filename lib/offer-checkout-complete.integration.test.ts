import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// completeOfferCheckout's own DB claim (orders_payment_intent_idx, 0070) is
// what the race-and-retry cases below exist to cover — a real Stripe
// confirm+redirect round trip is orthogonal to that, since the thing being
// raced is the `orders` insert, not anything Stripe does. Stubbing what
// paymentIntents.retrieve hands back, by id, keeps both halves of a
// concurrent pair deterministic instead of racing real network calls too.
// oto-after-bump.integration.test.ts mocks @/lib/stripe the same way for the
// same reason.
const PI_RESPONSES = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  stripe: () => ({
    paymentIntents: {
      retrieve: async (id: string) => {
        const res = PI_RESPONSES.get(id);
        if (!res) throw new Error(`no fixture PaymentIntent registered for ${id}`);
        return res;
      },
    },
    customers: { update: async () => ({}) },
  }),
}));

import { completeOfferCheckout } from "@/lib/offer-checkout";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("what completeOfferCheckout will accept", () => {
  it("refuses an id that is neither kind of intent rather than guessing", async () => {
    expect(await completeOfferCheckout("cus_notanintent")).toEqual({
      ok: false,
      error: "unknown_intent",
    });
  });
});

// ---------------------------------------------------------------------------
// The claim: two callers racing the same PaymentIntent, and a retry after a
// voided order. See lib/offer-checkout.ts (the 23505 branch of the orders
// insert) and supabase/migrations/0070_order_payment_intent_unique.sql.
// ---------------------------------------------------------------------------

const PRICE_CENTS = 4700;
const orderIds: string[] = [];
const userIds: string[] = [];
let fixtureOfferId = "";
let fixtureProductId = "";

// A fresh buyer per test — eligibility is per (user, product), so sharing a
// user across cases would make the second completeOfferCheckout call a
// legitimate re-entry (already owns it) rather than the race/retry being
// tested.
async function buyer(tag: string) {
  const db = createServiceClient();
  const email = `offercomplete_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.test`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const userId = created.data.user.id;
  userIds.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email });
  return { userId, email };
}

describe.skipIf(!canRun)("completeOfferCheckout's claim on a race (0070)", () => {
  beforeAll(async () => {
    if (!canRun) return;
    const db = createServiceClient();
    const storeId = await getStoreId();
    fixtureProductId = crypto.randomUUID();
    fixtureOfferId = crypto.randomUUID();
    // type is nullable since 0008 — omitted, same as oto-after-bump's fixture.
    const { error: prodErr } = await db.from("products").insert({
      id: fixtureProductId,
      store_id: storeId,
      slug: `zz-race-product-${fixtureProductId}`,
      title: "zz race fixture product",
      price_cents: PRICE_CENTS,
      currency: "usd",
      status: "published",
    });
    if (prodErr) throw new Error(`fixture product: ${prodErr.message}`);
    // grant_type "product" rather than "subscription": it skips
    // grantOfferOwnership's pushAppEntitlement call (a best-effort push to a
    // connected app), which has nothing to do with the DB race under test.
    const { error: offerErr } = await db.from("offers").insert({
      id: fixtureOfferId,
      store_id: storeId,
      key: `zz-race-offer-${fixtureOfferId}`,
      name: "zz race fixture offer",
      grant_type: "product",
      grant_product_id: fixtureProductId,
      billing_type: "one_time",
      price_cents: PRICE_CENTS,
      currency: "usd",
      headline: "fixture",
      active: true,
    });
    if (offerErr) throw new Error(`fixture offer: ${offerErr.message}`);
  });

  afterAll(async () => {
    if (!canRun) return;
    const db = createServiceClient();
    for (const id of orderIds) {
      await db.from("order_items").delete().eq("order_id", id);
      await db.from("orders").delete().eq("id", id);
    }
    for (const id of userIds) {
      await db.from("ownership").delete().eq("user_id", id);
      await db.from("users").delete().eq("id", id);
      await db.auth.admin.deleteUser(id);
    }
    // The offer references the product (grant_product_id, on delete
    // restrict) — it has to go first or the product delete is refused.
    if (fixtureOfferId) await db.from("offers").delete().eq("id", fixtureOfferId);
    if (fixtureProductId) await db.from("products").delete().eq("id", fixtureProductId);
  });

  it("two concurrent completions for the same PaymentIntent book exactly one order, one order_items row, and one ownership row", async () => {
    const db = createServiceClient();
    const { userId } = await buyer("race");
    const storeId = await getStoreId();
    const piId = `pi_race_${crypto.randomUUID()}`;
    PI_RESPONSES.set(piId, {
      id: piId,
      object: "payment_intent",
      status: "succeeded",
      amount: PRICE_CENTS,
      customer: `cus_race_${crypto.randomUUID()}`,
      payment_method: `pm_race_${crypto.randomUUID()}`,
      metadata: {
        userId,
        offerId: fixtureOfferId,
        storeId,
        offerPriceId: "",
        couponCode: "",
        newAccount: "false",
      },
    });

    // Promise.all, not two sequential awaits: the return route and the
    // Stripe webhook dispatch independently and can genuinely overlap. A
    // sequential pair would only exercise the eligibility check at the top
    // of completeOfferCheckout (which already handled that case before this
    // fix) rather than the insert-level claim this test exists to cover.
    const [a, b] = await Promise.all([completeOfferCheckout(piId), completeOfferCheckout(piId)]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });

    const { data: orders } = await db.from("orders").select("id, status").eq("user_id", userId);
    expect(orders).toHaveLength(1);
    expect(orders![0].status).toBe("paid");
    orderIds.push(orders![0].id as string);

    const { data: items } = await db.from("order_items").select("id").eq("order_id", orders![0].id);
    expect(items).toHaveLength(1);

    const { data: owned } = await db
      .from("ownership")
      .select("id")
      .eq("user_id", userId)
      .eq("offer_id", fixtureOfferId);
    expect(owned).toHaveLength(1);
  });

  it("a retry after a voided order still grants rather than failing", async () => {
    const db = createServiceClient();
    const { userId, email } = await buyer("retry");
    const storeId = await getStoreId();
    const piId = `pi_retry_${crypto.randomUUID()}`;

    // Stands in for a first attempt that inserted the order, then had
    // fulfilOffer throw and got voided by completeOfferCheckout's own catch
    // block, before this test's own call to completeOfferCheckout ever runs.
    // Before this fix, the unique index alone would make this retry collide
    // and fail for ever with order_failed — the exact bug an earlier task on
    // this branch shipped, where the buyer was left looking at a blank page.
    const { data: voided } = await db
      .from("orders")
      .insert({
        livemode: false,
        store_id: storeId,
        user_id: userId,
        email,
        status: "failed",
        currency: "usd",
        subtotal_cents: PRICE_CENTS,
        total_cents: PRICE_CENTS,
        stripe_customer_id: `cus_retry_${crypto.randomUUID()}`,
        stripe_payment_intent_id: piId,
      })
      .select("id")
      .single();
    if (!voided) throw new Error("failed to seed the voided-order fixture");
    orderIds.push(voided.id as string);

    PI_RESPONSES.set(piId, {
      id: piId,
      object: "payment_intent",
      status: "succeeded",
      amount: PRICE_CENTS,
      customer: `cus_retry_${crypto.randomUUID()}`,
      payment_method: `pm_retry_${crypto.randomUUID()}`,
      metadata: {
        userId,
        offerId: fixtureOfferId,
        storeId,
        offerPriceId: "",
        couponCode: "",
        newAccount: "false",
      },
    });

    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });

    const { data: orders } = await db.from("orders").select("id, status").eq("user_id", userId);
    expect(orders).toHaveLength(1);
    expect(orders![0].id).toBe(voided.id); // reclaimed the same row, not a second one
    expect(orders![0].status).toBe("paid");

    const { data: items } = await db.from("order_items").select("id").eq("order_id", voided.id as string);
    expect(items).toHaveLength(1);

    const { data: owned } = await db
      .from("ownership")
      .select("id")
      .eq("user_id", userId)
      .eq("offer_id", fixtureOfferId);
    expect(owned).toHaveLength(1);
  });
});
