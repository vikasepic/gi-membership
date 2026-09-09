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

async function buy(withBump: boolean) {
  const email = `it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  createdEmails.push(email);
  const res = await createCheckoutIntent({
    productSlug: "placeholder-offer",
    email,
    fullName: "Test Buyer",
    bumpChoice: withBump ? ("main" as const) : ("none" as const),
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
