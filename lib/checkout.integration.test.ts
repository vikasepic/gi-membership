import { describe, it, expect, afterAll } from "vitest";
import {
  createCheckoutIntent,
  finalizeOrder,
  resolveOtoForOrder,
  acceptOto,
} from "@/lib/checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

// Real money-path test: local Supabase + Stripe TEST mode. Skips if either
// isn't configured (so unit-only / CI-without-services runs stay green).
const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const createdEmails: string[] = [];

async function buy(withBump: boolean, visitId?: string | null) {
  const email = `it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  createdEmails.push(email);
  const res = await createCheckoutIntent({
    productSlug: "placeholder-offer",
    email,
    fullName: "Test Buyer",
    bumpChoice: withBump ? ("main" as const) : ("none" as const),
    ...(visitId !== undefined ? { visitId } : {}),
  });
  if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
  const piId = res.clientSecret.split("_secret_")[0];
  // Confirm with a Stripe test PaymentMethod (equivalent to the Element flow).
  await stripe().paymentIntents.confirm(piId, {
    payment_method: "pm_card_visa",
    return_url: "http://localhost:3000/checkout/complete",
  });
  return { email, piId };
}

async function ownershipFor(email: string) {
  const db = createServiceClient();
  const { data: user } = await db.from("users").select("id").eq("email", email).single();
  const { data } = await db
    .from("ownership")
    .select("product_id, app_id, source, status")
    .eq("user_id", user!.id);
  return data ?? [];
}

describe.skipIf(!canRun)("checkout money path (integration)", () => {
  it("buy + bump → one $27 charge, base ownership, a SEPARATE trial subscription, idempotent", async () => {
    const { email, piId } = await buy(true);
    await finalizeOrder(piId);
    await finalizeOrder(piId); // called twice on purpose — must be idempotent

    const own = await ownershipFor(email);
    expect(own.find((o) => o.source === "purchase" && o.product_id)).toBeTruthy();
    const bump = own.find((o) => o.source === "bump" && o.app_id);
    expect(bump).toBeTruthy();
    expect(bump!.status).toBe("trialing"); // trial sub, $0 now — not one charge
    expect(own).toHaveLength(2); // no duplicate grants from the double finalize
  });

  // The real duplicate came from CONCURRENT finalizes, not sequential ones:
  // the thank-you page and the Stripe webhook fire within milliseconds, both
  // read status 'pending', and both fulfil the bump. The existing test called
  // finalizeOrder twice in a row, which the old guard survived — so it passed
  // while production produced two bump lines on one order.
  it("fulfils the bump once when the page and the webhook finalize at the same instant", async () => {
    const { email, piId } = await buy(true);
    await Promise.all([finalizeOrder(piId), finalizeOrder(piId), finalizeOrder(piId)]);

    const db = createServiceClient();
    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    const { data: order } = await db
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    const { data: items } = await db
      .from("order_items")
      .select("kind, stripe_subscription_id")
      .eq("order_id", order!.id);

    // Exactly one product line and one bump line — not two of either.
    expect(items!.filter((i) => i.kind === "product")).toHaveLength(1);
    expect(items!.filter((i) => i.kind === "bump")).toHaveLength(1);

    // And one subscription, one ownership row.
    const subs = new Set(items!.map((i) => i.stripe_subscription_id).filter(Boolean));
    expect(subs.size).toBe(1);
    const { data: own } = await db.from("ownership").select("id").eq("user_id", user!.id);
    expect(own).toHaveLength(2); // the product and the app
  });

  // The Stripe account is shared with the connected apps, so every object we
  // create must be identifiable as ours from Stripe alone — that is all Zapier,
  // the dashboard filters and the CSV exports can see. Asserted against the real
  // object rather than the call, because metadata that silently stops being sent
  // looks identical to metadata that was never read.
  it("tags its Stripe objects as store-created and human-readable", async () => {
    const { piId } = await buy(true);
    await finalizeOrder(piId); // the bump subscription is created here, not by buy()
    const pi = await stripe().paymentIntents.retrieve(piId);

    expect(pi.metadata.store_created).toBe("true");
    expect(pi.metadata.productSlug).toBe("placeholder-offer");
    expect(pi.metadata.productTitle).toBeTruthy();
    expect(pi.description).toContain(pi.metadata.productTitle);

    // The bump subscription is a separate object and needs the same tagging.
    const subs = await stripe().subscriptions.list({
      customer: pi.customer as string,
      limit: 1,
    });
    expect(subs.data[0]?.metadata.store_created).toBe("true");
    expect(subs.data[0]?.metadata.offerName).toBeTruthy();
  });

  it("buy (bump declined) + OTO accept + replay → fulfils once, replay blocked (no double charge)", async () => {
    const { email, piId } = await buy(false);
    await finalizeOrder(piId);

    const token = await resolveOtoForOrder(piId);
    expect(token).toBeTruthy();

    expect(await acceptOto(token!)).toEqual({ ok: true });
    // Replay the exact same token — single-use guard must block it.
    expect(await acceptOto(token!)).toEqual({ ok: false, error: "used" });

    const own = await ownershipFor(email);
    expect(own.find((o) => o.source === "oto" && o.app_id)).toBeTruthy();
    expect(own.filter((o) => o.app_id)).toHaveLength(1); // exactly one subscription grant
  });

  it("rejects a tampered OTO token without consuming or charging", async () => {
    const { piId } = await buy(false);
    await finalizeOrder(piId);
    const token = await resolveOtoForOrder(piId);
    const tampered = token!.split(".")[0] + ".deadbeef";
    expect(await acceptOto(tampered)).toEqual({ ok: false, error: "invalid" });
    // The real token still works afterwards (tampered attempt didn't consume it).
    expect(await acceptOto(token!)).toEqual({ ok: true });
  });

  it("writes the campaign it came from onto the order and the PaymentIntent, beside the keys already there", async () => {
    const email = `it_${Date.now()}_utm@example.com`;
    createdEmails.push(email);
    const attribution = {
      first: { utm_source: "ig", utm_medium: "paid", utm_campaign: "Launch A" },
      last: {
        utm_source: "meta",
        utm_medium: "paid_social",
        utm_campaign: "AJ | LAL | Book Writer",
        utm_adset: "LAL 1%",
        utm_content: "Reel 3",
      },
      referrer: "https://l.facebook.com/l.php",
    };
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
      attribution,
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("utm_first, utm_last, referrer")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(order?.utm_last).toEqual(attribution.last);
    expect(order?.utm_first).toEqual(attribution.first);
    expect(order?.referrer).toBe(attribution.referrer);

    const pi = await stripe().paymentIntents.retrieve(piId);
    expect(pi.metadata.utm_source).toBe("meta");
    expect(pi.metadata.utm_adset).toBe("LAL 1%");
    expect(pi.metadata.first_utm_source).toBe("ig");
    expect(pi.metadata.referrer).toBe(attribution.referrer);
    // The keys another platform already reads must be exactly where they were.
    expect(pi.metadata.store_created).toBe("true");
    expect(pi.metadata.productSlug).toBe("placeholder-offer");
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const email of createdEmails) {
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    await db.from("orders").delete().eq("email", email); // cascades order_items + oto_tokens
    if (user) {
      await db.from("users").delete().eq("id", user.id); // cascades ownership
      await db.auth.admin.deleteUser(user.id);
    }
  }
});

// --- A recurring bump that bills its first period immediately -------------
//
// createCheckoutIntent folds a bump's money into TODAY's charge only when it
// is one_time — bumpNowCents is deliberately 0 for any recurring bump, even
// one (like this fixture) with no trial that bills in FULL, off-session, the
// moment fulfilBump creates its subscription. The seeded placeholder-offer
// bump (Content Engine, 7-day trial) can't tell a fix from the regression it
// exists to catch: immediateChargeCents is 0 for a trial either way, so a
// no-trial fixture is the only shape where "booked $0" and "booked the
// headline" actually differ.
describe.skipIf(!canRun)("a recurring bump with no trial (integration)", () => {
  const email = `it_rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  let productId = "";
  let offerId = "";

  it("books the bump's headline on the order line, not $0", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    offerId = crypto.randomUUID();
    const { error: offerErr } = await db.from("offers").insert({
      id: offerId,
      store_id: storeId,
      key: `zz-recurring-bump-${offerId}`,
      name: "zz recurring bump (no trial)",
      grant_type: "subscription",
      grant_app_id: "00000000-0000-0000-0000-0000000000a1", // seeded Content Engine app
      grant_entitlement_key: "content-engine",
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 0,
      price_cents: 1500,
      currency: "usd",
      headline: "zz recurring bump",
      description: "fixture",
      active: true,
    });
    if (offerErr) throw new Error(`fixture offer: ${offerErr.message}`);

    productId = crypto.randomUUID();
    const productSlug = `zz-recurring-bump-host-${productId}`;
    const { error: productErr } = await db.from("products").insert({
      id: productId,
      store_id: storeId,
      slug: productSlug,
      title: "zz recurring-bump host",
      price_cents: 2700,
      status: "published",
      bump_offer_id: offerId,
    });
    if (productErr) throw new Error(`fixture product: ${productErr.message}`);

    const res = await createCheckoutIntent({
      productSlug,
      email,
      fullName: "Test Buyer",
      bumpChoice: "main",
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(piId);

    const { data: order } = await db
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    const { data: items } = await db
      .from("order_items")
      .select("kind, amount_cents")
      .eq("order_id", order!.id as string);
    const bump = items!.find((i) => i.kind === "bump");
    // THE bug this test exists to catch: bumpAmountCents used to be written
    // as the string "0" (bumpNowCents — correctly 0, nothing is charged
    // TODAY as part of the base intent) and read back as a truthy value, so
    // fulfilBump's `args.amountCents ?? immediateChargeCents(offer)` kept
    // that 0 rather than falling back — even though the subscription was
    // just charged 1500 off-session, in full, no trial.
    expect(bump?.amount_cents).toBe(1500);
  });

  afterAll(async () => {
    if (!canRun) return;
    const db = createServiceClient();
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    await db.from("orders").delete().eq("email", email); // cascades order_items
    if (user) {
      await db.from("users").delete().eq("id", user.id); // cascades ownership
      await db.auth.admin.deleteUser(user.id);
    }
    if (productId) await db.from("products").delete().eq("id", productId);
    if (offerId) await db.from("offers").delete().eq("id", offerId);
  });
});

// --- The bump's name and chosen price, on the base PaymentIntent's metadata
//
// lib/offer-checkout.ts already sends bumpOfferName/bumpPriceId on its
// one-time PaymentIntent; this product checkout never got the same
// treatment, so a bump riding the host's charge was indistinguishable in
// Stripe from a host-only sale of the same total. Needs its own fixture with
// a real offer_prices row: the seeded placeholder-offer's bump (Content
// Engine) has none (seed.sql inserts the offer row directly, and nothing
// backfills a price for it — see supabase/migrations/0048), so bumpChoice: 0
// — the numeric branch that resolves a specific placement price — would
// refuse with "bump_unavailable" against it.
describe.skipIf(!canRun)("bump readability on the product checkout (integration)", () => {
  const emails: string[] = [];
  let productId = "";
  let offerId = "";
  let priceId = "";
  let productSlug = "";

  it("puts bumpOfferName and bumpPriceId on the PaymentIntent's metadata, alongside bumpOfferId", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    offerId = crypto.randomUUID();
    const { error: offerErr } = await db.from("offers").insert({
      id: offerId,
      store_id: storeId,
      key: `zz-bump-name-${offerId}`,
      name: "zz bump name fixture",
      grant_type: "subscription",
      grant_app_id: "00000000-0000-0000-0000-0000000000a1", // seeded Content Engine app
      grant_entitlement_key: "content-engine",
      billing_type: "one_time",
      price_cents: 1100,
      currency: "usd",
      headline: "fixture",
      description: "fixture",
      active: true,
    });
    if (offerErr) throw new Error(`fixture offer: ${offerErr.message}`);

    priceId = crypto.randomUUID();
    const { error: priceErr } = await db.from("offer_prices").insert({
      id: priceId,
      offer_id: offerId,
      billing_type: "one_time",
      price_cents: 1100,
      sort_order: 0,
    });
    if (priceErr) throw new Error(`fixture price: ${priceErr.message}`);

    productId = crypto.randomUUID();
    productSlug = `zz-bump-name-host-${productId}`;
    const { error: productErr } = await db.from("products").insert({
      id: productId,
      store_id: storeId,
      slug: productSlug,
      title: "zz bump-name host",
      price_cents: 1900,
      status: "published",
      bump_offer_id: offerId,
    });
    if (productErr) throw new Error(`fixture product: ${productErr.message}`);

    const email = `it_bn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
    emails.push(email);
    const res = await createCheckoutIntent({
      productSlug,
      email,
      fullName: "Test Buyer",
      bumpChoice: 0, // the numeric branch — an index into a real placement price list
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];
    const pi = await stripe().paymentIntents.retrieve(piId);

    expect(pi.metadata.bumpOfferId).toBe(offerId);
    expect(pi.metadata.bumpOfferName).toBe("zz bump name fixture");
    expect(pi.metadata.bumpPriceId).toBe(priceId);
  });

  it('sends "" for bumpOfferName and bumpPriceId when no bump is taken', async () => {
    const email = `it_bn2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
    emails.push(email);
    const res = await createCheckoutIntent({
      productSlug, // same host — set up by the test above, which runs first
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];
    const pi = await stripe().paymentIntents.retrieve(piId);

    expect(pi.metadata.bumpOfferId).toBe("");
    expect(pi.metadata.bumpOfferName).toBe("");
    expect(pi.metadata.bumpPriceId).toBe("");
  });

  afterAll(async () => {
    if (!canRun) return;
    const db = createServiceClient();
    for (const email of emails) {
      const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
      await db.from("orders").delete().eq("email", email); // cascades order_items
      if (user) {
        await db.from("users").delete().eq("id", user.id); // cascades ownership
        await db.auth.admin.deleteUser(user.id);
      }
    }
    if (productId) await db.from("products").delete().eq("id", productId);
    if (offerId) await db.from("offers").delete().eq("id", offerId); // cascades offer_prices
  });
});

// --- Same, on the recurring (SetupIntent) branch ---------------------------
//
// The PaymentIntent branch above got bumpOfferName + bumpPriceId; nothing
// exercised the SetupIntent branch's own bump metadata, so its bumpOfferName
// key (added at the same time) shipped with no test reading it back, and its
// missing bumpPriceId went unnoticed. Own fixture (a recurring host, built
// the way "orders.visit_id (integration)"'s recurring test builds one) rather
// than reusing the block above's — that one is one-time and asserts on its
// own productSlug across two ordered tests.
describe.skipIf(!canRun)(
  "bump readability on the product checkout's SetupIntent (integration)",
  () => {
    const emails: string[] = [];
    let productId = "";
    let offerId = "";

    it("carries bumpOfferId, bumpOfferName and bumpPriceId onto the SetupIntent, for a recurring host", async () => {
      const db = createServiceClient();
      const storeId = await getStoreId();

      offerId = crypto.randomUUID();
      const { error: offerErr } = await db.from("offers").insert({
        id: offerId,
        store_id: storeId,
        key: `zz-bump-si-${Date.now()}-${offerId}`,
        name: "zz bump SetupIntent fixture",
        grant_type: "subscription",
        grant_app_id: "00000000-0000-0000-0000-0000000000a1", // seeded Content Engine app
        grant_entitlement_key: "content-engine",
        billing_type: "one_time",
        price_cents: 1100,
        currency: "usd",
        headline: "fixture",
        description: "fixture",
        active: true,
      });
      if (offerErr) throw new Error(`fixture offer: ${offerErr.message}`);

      const priceId = crypto.randomUUID();
      const { error: priceErr } = await db.from("offer_prices").insert({
        id: priceId,
        offer_id: offerId,
        billing_type: "one_time",
        price_cents: 1100,
        sort_order: 0,
      });
      if (priceErr) throw new Error(`fixture price: ${priceErr.message}`);

      productId = crypto.randomUUID();
      const productSlug = `zz-bump-si-host-${Date.now()}-${productId}`;
      const { error: productErr } = await db.from("products").insert({
        id: productId,
        store_id: storeId,
        slug: productSlug,
        title: "zz bump-SetupIntent host",
        price_cents: 900,
        status: "published",
        bump_offer_id: offerId,
      });
      if (productErr) throw new Error(`fixture product: ${productErr.message}`);
      // The backfill trigger already gave it a one-off price from price_cents —
      // replace it with a recurring one so createCheckoutIntent takes the
      // SetupIntent branch instead of the PaymentIntent branch.
      await db.from("product_prices").delete().eq("product_id", productId);
      const { error: recurringPriceErr } = await db.from("product_prices").insert({
        product_id: productId,
        billing_type: "recurring",
        interval: "month",
        interval_count: 1,
        trial_days: 7,
        price_cents: 900,
        sort_order: 0,
      });
      if (recurringPriceErr) throw new Error(`fixture product price: ${recurringPriceErr.message}`);

      const email = `it_bsi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
      emails.push(email);
      const res = await createCheckoutIntent({
        productSlug,
        email,
        fullName: "Test Buyer",
        bumpChoice: 0, // the numeric branch — an index into a real placement price list
        priceChoice: 0,
      });
      if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
      // A trial subscription is a SetupIntent, not a PaymentIntent — confirms
      // this test actually reached the branch it claims to cover.
      expect(res.mode).toBe("setup");
      const siId = res.clientSecret.split("_secret_")[0];
      const si = await stripe().setupIntents.retrieve(siId);

      expect(si.metadata?.bumpOfferId).toBe(offerId);
      expect(si.metadata?.bumpOfferName).toBe("zz bump SetupIntent fixture");
      expect(si.metadata?.bumpPriceId).toBe(priceId);
    });

    afterAll(async () => {
      if (!canRun) return;
      const db = createServiceClient();
      for (const email of emails) {
        const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
        await db.from("orders").delete().eq("email", email); // cascades order_items
        if (user) {
          await db.from("users").delete().eq("id", user.id); // cascades ownership
          await db.auth.admin.deleteUser(user.id);
        }
      }
      if (productId) await db.from("products").delete().eq("id", productId);
      if (offerId) await db.from("offers").delete().eq("id", offerId); // cascades offer_prices
    });
  },
);

// --- Signed-in members buy without signing up again -----------------------
import { createCheckoutIntent as createIntent } from "@/lib/checkout";

describe.skipIf(!canRun)("signed-in checkout (integration)", () => {
  it("reuses the member's account and Stripe customer, and refuses a repeat purchase", async () => {
    // First purchase creates the account the normal signup-at-checkout way.
    const { email, piId } = await buy(false);
    await finalizeOrder(piId);

    const db = createServiceClient();
    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    const { data: firstOrder } = await db
      .from("orders")
      .select("stripe_customer_id")
      .eq("stripe_payment_intent_id", piId)
      .single();

    // They already own what they just bought — buying it again must be refused
    // rather than charged.
    const repeat = await createIntent({
      productSlug: "placeholder-offer",
      existingUserId: user!.id,
      bumpChoice: "none",
      country: "US",
    });
    expect(repeat).toMatchObject({ ok: false, code: "already_owned" });

    // A DIFFERENT product, still signed in: no new account, same Stripe customer.
    const usersBefore = await db.from("users").select("id").eq("email", email);
    const second = await createIntent({
      productSlug: "field-guide",
      existingUserId: user!.id,
      bumpChoice: "none",
      country: "US",
    });
    if (!second.ok) throw new Error(`signed-in checkout failed: ${second.error}`);

    const usersAfter = await db.from("users").select("id").eq("email", email);
    expect(usersAfter.data).toHaveLength(usersBefore.data!.length); // no duplicate account

    const secondPi = second.clientSecret.split("_secret_")[0];
    const { data: secondOrder } = await db
      .from("orders")
      .select("stripe_customer_id, user_id")
      .eq("stripe_payment_intent_id", secondPi)
      .single();
    expect(secondOrder!.user_id).toBe(user!.id);
    expect(secondOrder!.stripe_customer_id).toBe(firstOrder!.stripe_customer_id);
  });
});

// --- orders.visit_id (Task 4 wiring; fix round 1, Important 2) ------------
//
// Nothing before this exercised orders.visit_id, the purchase milestone, or
// anything else this task wired up — a dropped write here would have
// shipped green. orders.visit_id is a real FK to visits(id) (0080), so each
// test makes its own throwaway visit rather than faking a cookie.

async function makeVisit() {
  const db = createServiceClient();
  const { data, error } = await db
    .from("visits")
    .insert({
      store_id: await getStoreId(),
      anon_id: `zz-visitid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      landing_path: "/zz",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`fixture visit: ${error?.message}`);
  return data.id as string;
}

describe.skipIf(!canRun)("orders.visit_id (integration)", () => {
  const visitIds: string[] = [];
  let recurringProductId = "";

  it("writes visitId onto the order on the one-time (PaymentIntent) branch", async () => {
    const visitId = await makeVisit();
    visitIds.push(visitId);
    const { piId } = await buy(false, visitId);

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("visit_id")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(order!.visit_id).toBe(visitId);
  });

  it("writes visitId onto the order on the recurring (SetupIntent) branch", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const visitId = await makeVisit();
    visitIds.push(visitId);

    const slug = `zz-visitid-rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: product, error } = await db
      .from("products")
      .insert({
        store_id: storeId,
        slug,
        title: "zz visit_id recurring fixture",
        status: "published",
        currency: "usd",
        price_cents: 900,
      })
      .select("id")
      .single();
    if (error || !product) throw new Error(`fixture product: ${error?.message}`);
    recurringProductId = product.id as string;
    // The backfill trigger already gave it a one-off price from price_cents.
    await db.from("product_prices").delete().eq("product_id", product.id);
    const { error: priceErr } = await db.from("product_prices").insert({
      product_id: product.id,
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 7,
      price_cents: 900,
      sort_order: 0,
    });
    if (priceErr) throw new Error(`fixture price: ${priceErr.message}`);

    const email = `it_${Date.now()}_visitrec@example.com`;
    createdEmails.push(email); // the file's own afterAll (above) cleans this up
    const res = await createCheckoutIntent({
      productSlug: slug,
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
      priceChoice: 0,
      visitId,
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    // A trial subscription is a SetupIntent, not a PaymentIntent — confirms
    // this test actually reached the branch it claims to.
    expect(res.mode).toBe("setup");
    const siId = res.clientSecret.split("_secret_")[0];

    const { data: order } = await db
      .from("orders")
      .select("visit_id")
      .eq("stripe_setup_intent_id", siId)
      .single();
    expect(order!.visit_id).toBe(visitId);
  });

  it("finalizeOrder records the purchase milestone against the order's own visit_id", async () => {
    const visitId = await makeVisit();
    visitIds.push(visitId);
    // The purchase milestone is recorded inside finalizeOrder's tracking
    // block, which is gated on tracking_consent (the brief's own placement —
    // "in the same try that reports tracking"). Without consent the block
    // returns before ever reaching it, which is not what this test is about.
    const email = `it_${Date.now()}_visitpurchase@example.com`;
    createdEmails.push(email);
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
      visitId,
      trackingConsent: true,
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(piId);

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("id, total_cents")
      .eq("stripe_payment_intent_id", piId)
      .single();
    // The write is fire-and-forget (`void recordVisitStep(...)`) inside
    // finalizeOrder, so it can still be in flight the instant finalizeOrder
    // returns. Poll briefly rather than asserting immediately.
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
    expect(steps![0].order_id).toBe(order!.id);
    expect(steps![0].value_cents).toBe(order!.total_cents);
  });

  it("finalizeOrder records the purchase milestone even when the buyer never gave tracking consent", async () => {
    // Sibling to the test above, opposite consent value. The milestone is
    // our own attribution row, not a third-party ad event, so it must not
    // sit behind the tracking_consent gate the way trackPurchase does — a
    // buyer who ignores or declines the cookie banner still needs their
    // purchase counted, or every attribution rate mixes mismatched
    // populations (checkouts count everyone, purchases would count only
    // consenting buyers).
    const visitId = await makeVisit();
    visitIds.push(visitId);
    const email = `it_${Date.now()}_visitnoconsent@example.com`;
    createdEmails.push(email);
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
      visitId,
      trackingConsent: false,
    });
    if (!res.ok) throw new Error(`createCheckoutIntent failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(piId);

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("id, total_cents, tracking_consent")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(order!.tracking_consent).toBe(false);

    // Same fire-and-forget caveat as the consenting-buyer test above.
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
    expect(steps![0].order_id).toBe(order!.id);
    expect(steps![0].value_cents).toBe(order!.total_cents);
  });

  afterAll(async () => {
    if (!canRun) return;
    const db = createServiceClient();
    if (recurringProductId) {
      await db.from("product_prices").delete().eq("product_id", recurringProductId);
      await db.from("products").delete().eq("id", recurringProductId);
    }
    // visit_steps cascades off visits (0080); orders.visit_id is ON DELETE
    // SET NULL, so this is safe regardless of whether the file's own
    // afterAll (which deletes these tests' orders by email) has run yet.
    if (visitIds.length) await db.from("visits").delete().in("id", visitIds);
  });
});
