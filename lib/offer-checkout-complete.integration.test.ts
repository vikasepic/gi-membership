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

// Lets one case force grantOfferOwnership to throw for a chosen userId, to
// cover the catch block that voids the order when granting (not just
// fulfilOffer itself) fails after the claim — see Important 2 of fix round
// 3 in task-4-5-report.md. Every other export, and every OTHER call to
// grantOfferOwnership, runs the real implementation; the flag is consumed
// (deleted) on use so the very next call — the retry the test makes itself —
// goes through untouched.
const { grantOfferOwnershipShouldThrow } = vi.hoisted(() => ({
  grantOfferOwnershipShouldThrow: new Set<string>(),
}));
vi.mock("@/lib/checkout", async (orig) => {
  const real = await orig<typeof import("@/lib/checkout")>();
  return {
    ...real,
    grantOfferOwnership: async (...args: Parameters<typeof real.grantOfferOwnership>) => {
      const [, userId] = args;
      if (grantOfferOwnershipShouldThrow.has(userId)) {
        grantOfferOwnershipShouldThrow.delete(userId);
        throw new Error("simulated grantOfferOwnership failure");
      }
      return real.grantOfferOwnership(...args);
    },
  };
});

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
    // Both racers hand back an orderId — the winner from its own fresh
    // insert, the loser from the 23505 branch's read of the row the winner
    // just claimed. Not asserted to be the SAME id here (the length-1 checks
    // below already prove there is only one order); expect.any(String) is
    // enough to prove each caller actually named one.
    expect(a).toEqual({ ok: true, orderId: expect.any(String) });
    expect(b).toEqual({ ok: true, orderId: expect.any(String) });

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

    // orderId names the reclaimed row itself, not just some order.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true, orderId: voided.id });

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

  it("two callers racing an already-failed row book exactly one order_items row", async () => {
    const db = createServiceClient();
    const { userId, email } = await buyer("racefailed");
    const storeId = await getStoreId();
    const piId = `pi_racefailed_${crypto.randomUUID()}`;

    // Stands in for an even earlier attempt that claimed this row and then
    // had fulfilOffer throw — reachable with three or more calls for one
    // intent (a claim-then-fail, then a webhook redelivery racing the buyer
    // reloading the return URL). The two calls below are the SECOND and
    // THIRD against this same intent, both landing on a row that is already
    // "failed" — unlike the concurrency test above, which races two FRESH
    // inserts and so only ever sends one caller down the reclaim branch at
    // all.
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
        stripe_customer_id: `cus_racefailed_${crypto.randomUUID()}`,
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
      customer: `cus_racefailed_${crypto.randomUUID()}`,
      payment_method: `pm_racefailed_${crypto.randomUUID()}`,
      metadata: {
        userId,
        offerId: fixtureOfferId,
        storeId,
        offerPriceId: "",
        couponCode: "",
        newAccount: "false",
      },
    });

    // Promise.all, same reason as the fresh-insert race above: both callers
    // have to actually overlap at the DB, not just run one after the other.
    const [a, b] = await Promise.all([completeOfferCheckout(piId), completeOfferCheckout(piId)]);
    // Both name the seeded row itself — the winner via the reclaim's own
    // orderId assignment, the loser via the "someone else reclaimed it
    // first" branch's read of the same `existing.id`.
    expect(a).toEqual({ ok: true, orderId: voided.id });
    expect(b).toEqual({ ok: true, orderId: voided.id });

    const { data: orders } = await db.from("orders").select("id, status").eq("user_id", userId);
    expect(orders).toHaveLength(1);
    expect(orders![0].id).toBe(voided.id); // reclaimed the seeded row, not a second one
    expect(orders![0].status).toBe("paid");

    // The assertion an unguarded reclaim update fails: both racers used to
    // see "failed" and both would fall through into fulfilment, appending
    // their own order_items line to the one real order.
    const { data: items } = await db.from("order_items").select("id").eq("order_id", voided.id as string);
    expect(items).toHaveLength(1);

    const { data: owned } = await db
      .from("ownership")
      .select("id")
      .eq("user_id", userId)
      .eq("offer_id", fixtureOfferId);
    expect(owned).toHaveLength(1);
  });

  it("a grant failure after the claim voids the order instead of leaving it paid forever, and a later call then delivers", async () => {
    const db = createServiceClient();
    const { userId } = await buyer("grantfail");
    const storeId = await getStoreId();
    const piId = `pi_grantfail_${crypto.randomUUID()}`;
    PI_RESPONSES.set(piId, {
      id: piId,
      object: "payment_intent",
      status: "succeeded",
      amount: PRICE_CENTS,
      customer: `cus_grantfail_${crypto.randomUUID()}`,
      payment_method: `pm_grantfail_${crypto.randomUUID()}`,
      metadata: {
        userId,
        offerId: fixtureOfferId,
        storeId,
        offerPriceId: "",
        couponCode: "",
        newAccount: "false",
      },
    });

    // The claim succeeds (fresh insert, no conflict) and fulfilOffer is a
    // no-op on this prepaid one-time offer, so the only way this call can
    // fail is grantOfferOwnership itself — forced here rather than found,
    // since every real ownership/product fixture in this file satisfies its
    // own foreign keys by construction.
    grantOfferOwnershipShouldThrow.add(userId);
    // grant_failed, not charge_failed: the PaymentIntent above has already
    // succeeded by the time this call is made, so "nothing was charged" would
    // be false. charge_failed keeps that meaning for the setup/off-session
    // paths that never take this branch — see lib/offer-checkout.ts.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: false, error: "grant_failed" });

    const { data: firstPass } = await db.from("orders").select("id, status").eq("user_id", userId);
    expect(firstPass).toHaveLength(1);
    // The order this catches — not left "paid" with nothing granted, which
    // is what every later delivery would have read as a done deal.
    expect(firstPass![0].status).toBe("failed");
    orderIds.push(firstPass![0].id as string);

    const { data: noOwnership } = await db
      .from("ownership")
      .select("id")
      .eq("user_id", userId)
      .eq("offer_id", fixtureOfferId);
    expect(noOwnership).toHaveLength(0);

    const { data: noItems } = await db
      .from("order_items")
      .select("id")
      .eq("order_id", firstPass![0].id as string);
    expect(noItems).toHaveLength(0);

    // grantOfferOwnershipShouldThrow was consumed by the call above — this
    // one gets the real implementation. Reclaims the same "failed" row
    // (Important 1's own guarded update) and this time the grant lands, all
    // the way to the end of the function — so orderId names that same row.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true, orderId: firstPass![0].id });

    const { data: secondPass } = await db.from("orders").select("id, status").eq("user_id", userId);
    expect(secondPass).toHaveLength(1);
    expect(secondPass![0].id).toBe(firstPass![0].id); // same row, not a second one
    expect(secondPass![0].status).toBe("paid");

    const { data: owned } = await db
      .from("ownership")
      .select("id")
      .eq("user_id", userId)
      .eq("offer_id", fixtureOfferId);
    expect(owned).toHaveLength(1);

    const { data: items } = await db
      .from("order_items")
      .select("id")
      .eq("order_id", firstPass![0].id as string);
    expect(items).toHaveLength(1);
  });
});
