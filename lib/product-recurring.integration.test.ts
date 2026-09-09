import { describe, it, expect, afterAll } from "vitest";
import { createCheckoutIntent, finalizeOrder, ownershipFor, resolveOtoForOrder } from "@/lib/checkout";
import { syncSubscriptionOwnership } from "@/lib/subscription-sync";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

// Real money path: local Supabase + Stripe TEST mode. Skips if either is
// missing, so a unit-only run stays green.
const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const createdEmails: string[] = [];
const createdProductIds: string[] = [];
const createdSubs: string[] = [];
const createdOfferIds: string[] = [];
const APP = "00000000-0000-0000-0000-0000000000a1";

/**
 * An offer for this test to upsell with, owned by this test.
 *
 * It used to grab whatever active offer the store happened to hold first. That
 * is a shared table other suites insert throwaway offers into and delete again
 * mid-run, so the upsell was sometimes pointed at a row that no longer existed
 * by the time the token was resolved — a missing upsell, indistinguishable
 * from the bug this test exists to catch.
 */
async function makeUpsellOffer(): Promise<string> {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  createdOfferIds.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-rec-upsell-${id}`,
    name: "zz upsell fixture (product-recurring test)",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "recurring",
    interval: "month",
    interval_count: 1,
    trial_days: 7,
    price_cents: 2900,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
  });
  if (error) throw new Error(`test fixture: upsell offer: ${error.message}`);
  return id;
}

/**
 * Buying a product on a recurring price, end to end.
 *
 * The reason this is worth the seconds it costs: every part of this fork is
 * invisible when it goes wrong. A subscription created with the wrong interval
 * bills correctly once and wrongly for ever after; a trial that does not carry
 * means somebody is charged today who was promised a week; access granted
 * without a subscription is a customer nobody is billing. None of it surfaces
 * as an error — it surfaces as money, weeks later.
 */
async function makeProduct(price: {
  billing_type: "one_time" | "recurring";
  interval?: string;
  interval_count?: number;
  trial_days?: number | null;
  price_cents: number;
}) {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const slug = `it-rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: product, error } = await db
    .from("products")
    .insert({
      store_id: storeId,
      slug,
      title: "Integration — recurring product",
      status: "published",
      currency: "usd",
      price_cents: price.price_cents,
    })
    .select("id")
    .single();
  if (error || !product) throw new Error(`product insert: ${error?.message}`);
  createdProductIds.push(product.id as string);

  // The backfill trigger has already given it a one-off row from price_cents.
  // Clear that and write the one this test is about.
  await db.from("product_prices").delete().eq("product_id", product.id);
  const { error: priceErr } = await db.from("product_prices").insert({
    product_id: product.id,
    billing_type: price.billing_type,
    interval: price.interval ?? null,
    interval_count: price.interval_count ?? 1,
    trial_days: price.trial_days ?? null,
    price_cents: price.price_cents,
    sort_order: 0,
  });
  if (priceErr) throw new Error(`price insert: ${priceErr.message}`);
  return { id: product.id as string, slug };
}

async function buy(slug: string) {
  const email = `it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  createdEmails.push(email);
  const res = await createCheckoutIntent({
    productSlug: slug,
    email,
    fullName: "Test Buyer",
    bumpChoice: "none",
    priceChoice: 0,
  });
  if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
  return { email, res };
}

describe.skipIf(!canRun)("a product sold on a recurring price (integration)", () => {
  it("saves the card, subscribes on the right terms, and grants access", async () => {
    const product = await makeProduct({
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 7,
      price_cents: 900,
    });
    const { email, res } = await buy(product.slug);
    if (!res.ok) throw new Error("unreachable");

    // A trial charges nothing today, so this MUST be a SetupIntent. A $0
    // PaymentIntent is not a thing Stripe will make.
    expect(res.mode).toBe("setup");
    const siId = res.clientSecret.split("_secret_")[0];
    expect(siId.startsWith("seti_")).toBe(true);

    // And it books its own line. A subscription order used to carry NO
    // order_items at all — the insert lived in the one-time branch, after this
    // one had already returned — so the receipt listed nothing and the welcome
    // email said "your purchase" rather than the product's name. $0 because
    // that is what today costs on a trial, matching the order's total beside it.
    {
      const db2 = createServiceClient();
      const { data: order } = await db2
        .from("orders")
        .select("id")
        .eq("stripe_setup_intent_id", siId)
        .single();
      const { data: items } = await db2
        .from("order_items")
        .select("kind, product_id, amount_cents")
        .eq("order_id", order!.id);
      expect(items).toHaveLength(1);
      expect(items![0].kind).toBe("product");
      expect(items![0].product_id).toBe(product.id);
      expect(items![0].amount_cents).toBe(0);
    }

    // Confirm with a test card, the equivalent of the Element flow.
    await stripe().setupIntents.confirm(siId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });

    // Twice on purpose: the thank-you page and the Stripe webhook both call it.
    await finalizeOrder(siId);
    await finalizeOrder(siId);

    const db = createServiceClient();
    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    const { data: own } = await db
      .from("ownership")
      .select("product_id, status, source, stripe_subscription_id, product_price_id")
      .eq("user_id", user!.id);

    // One grant, not two — the double finalize must not duplicate anything.
    expect(own).toHaveLength(1);
    const row = own![0];
    expect(row.product_id).toBe(product.id);
    expect(row.source).toBe("purchase");
    expect(row.product_price_id).toBeTruthy();
    // Access is recorded against the subscription that pays for it.
    expect(row.stripe_subscription_id).toBeTruthy();
    createdSubs.push(row.stripe_subscription_id as string);

    // What Stripe actually holds. This is the assertion that matters: the terms
    // a buyer was shown have to be the terms they are on.
    const sub = await stripe().subscriptions.retrieve(row.stripe_subscription_id as string);
    expect(sub.status).toBe("trialing");

    // And OUR record has to say the same thing. It said "active" for a
    // subscription Stripe was trialing — so the CRM tagged them a buyer, the
    // admin showed a paid sale, and the row was already selected here without
    // anybody asserting on it.
    expect(row.status).toBe("trialing");
    const item = sub.items.data[0];
    expect(item.price.unit_amount).toBe(900);
    expect(item.price.recurring?.interval).toBe("month");
    expect(item.price.recurring?.interval_count).toBe(1);

    // The order books today's charge, which on a trial is nothing.
    const { data: order } = await db
      .from("orders")
      .select("status, total_cents")
      .eq("stripe_setup_intent_id", siId)
      .single();
    expect(order!.status).toBe("paid");
    expect(order!.total_cents).toBe(0);
  }, 60_000);

  it("loses access when the subscription is cancelled", async () => {
    // The thing that makes a recurring product honest. Access is granted for as
    // long as it is paid for, and this is the whole of that promise: cancel in
    // Stripe, the webhook syncs, the product stops being owned.
    const product = await makeProduct({
      billing_type: "recurring",
      interval: "month",
      price_cents: 1200,
    });
    const { email, res } = await buy(product.slug);
    if (!res.ok) throw new Error("unreachable");
    const siId = res.clientSecret.split("_secret_")[0];
    await stripe().setupIntents.confirm(siId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(siId);

    const db = createServiceClient();
    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    const { data: own } = await db
      .from("ownership")
      .select("stripe_subscription_id")
      .eq("user_id", user!.id)
      .single();
    const subId = own!.stripe_subscription_id as string;
    createdSubs.push(subId);

    // Owned while it is being paid for.
    expect((await ownershipFor(user!.id)).productIds.has(product.id)).toBe(true);

    // Cancelled in Stripe — what the billing portal does — then the webhook's
    // handler, which is what actually runs in production.
    await stripe().subscriptions.cancel(subId);
    await syncSubscriptionOwnership(subId, "canceled");

    expect((await ownershipFor(user!.id)).productIds.has(product.id)).toBe(false);
  }, 60_000);

  it("still offers the upsell after a subscription order", async () => {
    // The last unproven path in the funnel. resolveOtoForOrder was written for
    // PaymentIntents and now has to recognise a SetupIntent order too — get it
    // wrong and every buyer on a recurring price silently skips the upsell,
    // which looks like nothing at all rather than like a bug.
    const db = createServiceClient();
    // An offer to upsell them to, created here so nothing else can retire it
    // between the purchase and the assertion.
    const offerId = await makeUpsellOffer();

    const product = await makeProduct({
      billing_type: "recurring",
      interval: "month",
      price_cents: 800,
    });
    await db.from("products").update({ upsell_offer_id: offerId }).eq("id", product.id);

    const { email, res } = await buy(product.slug);
    if (!res.ok) throw new Error("unreachable");
    expect(res.mode).toBe("setup");
    const siId = res.clientSecret.split("_secret_")[0];
    await stripe().setupIntents.confirm(siId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(siId);

    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    const { data: own } = await db
      .from("ownership")
      .select("stripe_subscription_id")
      .eq("user_id", user!.id)
      .not("stripe_subscription_id", "is", null)
      .maybeSingle();
    if (own?.stripe_subscription_id) createdSubs.push(own.stripe_subscription_id as string);

    // The token is what the complete route redirects to the upsell with.
    const token = await resolveOtoForOrder(siId);
    expect(token).toBeTruthy();
  }, 60_000);

  it("still takes a one-off product as a payment, not a setup", async () => {
    // The fork must not have moved every product onto the subscription path.
    const product = await makeProduct({ billing_type: "one_time", price_cents: 1500 });
    const { res } = await buy(product.slug);
    if (!res.ok) throw new Error("unreachable");
    expect(res.mode).toBe("payment");
    expect(res.clientSecret.startsWith("pi_")).toBe(true);
  }, 60_000);
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of createdSubs) {
    await stripe().subscriptions.cancel(id).catch(() => {});
  }
  for (const email of createdEmails) {
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (!user) continue;
    await db.from("ownership").delete().eq("user_id", user.id);
    await db.from("order_items").delete().eq("store_id", await getStoreId()).is("order_id", null);
  }
  for (const id of createdOfferIds) {
    // Tokens first: oto_tokens.offer_id is ON DELETE RESTRICT, so an offer that
    // ever minted one cannot be deleted while it exists — and this delete does
    // not check its error, so the failure was silent. Left alone it leaked one
    // live `zz-` offer per run into the local store every suite shares, which is
    // how an unrelated checkout test ended up buying a throwaway fixture.
    await db.from("oto_tokens").delete().eq("offer_id", id);
    const { error } = await db.from("offers").delete().eq("id", id);
    if (error) console.error(`[product-recurring cleanup] offer ${id}: ${error.message}`);
  }
  for (const id of createdProductIds) {
    const { data: orders } = await db.from("orders").select("id").eq("store_id", await getStoreId());
    for (const o of orders ?? []) {
      await db.from("order_items").delete().eq("order_id", o.id).eq("product_id", id);
    }
    await db.from("product_prices").delete().eq("product_id", id);
    await db.from("products").delete().eq("id", id);
  }
});
