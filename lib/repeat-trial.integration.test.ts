import { describe, it, expect, afterAll } from "vitest";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer } from "@/lib/store";
import { STORE_TAG } from "@/lib/coupons";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { grantKeysOf } from "@/lib/trial-history";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "00000000-0000-0000-0000-0000000000a1";

const emails: string[] = [];
const offers: string[] = [];

/**
 * A free trial is a thing you get once, on the offer checkout too.
 *
 * Found 29 Sep 2026. The offer checkout, which sells every Content Engine and
 * Funnel App trial, never asked whether the buyer had already had one: the
 * page stripped the offer's own trial but not the trial each PRICE carries,
 * and the start and completion steps did not check at all. A coupon carrying
 * trial_days would also have handed a returning trialist a fresh trial.
 */
describe.skipIf(!canRun)("a second trial (integration)", () => {
  async function buyer() {
    const db = createServiceClient();
    const email = `zzrepeat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    emails.push(email);
    const created = await db.auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: "repeat" });
    return { userId, email };
  }

  /** A monthly with a 7-day trial on the offer AND its price, as production has them. */
  async function trialOffer() {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    offers.push(id);
    const { error } = await db.from("offers").insert({
      id,
      store_id: await getStoreId(),
      key: `zz-repeat-${id}`,
      name: "zz repeat-trial fixture",
      grant_type: "subscription",
      grant_app_id: APP,
      // Its own entitlement, so trial history from other suites cannot touch it.
      grant_entitlement_key: `zz-repeat-${id}`,
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
    if (error) throw new Error(`test fixture: offer: ${error.message}`);
    const price = await db.from("offer_prices").insert({
      offer_id: id,
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 7,
      price_cents: 2900,
    });
    if (price.error) throw new Error(`test fixture: price: ${price.error.message}`);
    return id;
  }

  /** Mark this address as having had the offer's trial already. */
  async function hadTrial(email: string, offerId: string) {
    const db = createServiceClient();
    const keys = grantKeysOf((await getOffer(offerId))!);
    const storeId = await getStoreId();
    const { error } = await db
      .from("trial_history")
      .insert(keys.map((grant_key) => ({ store_id: storeId, email, grant_key })));
    if (error) throw new Error(`test fixture: history: ${error.message}`);
  }

  async function trialCode(days: number) {
    const coupon = await stripe().coupons.create({
      percent_off: 1,
      duration: "once",
      metadata: { store: STORE_TAG, trial_days: String(days) },
    });
    const code = `ZZREPEAT${days}${Date.now()}`;
    await stripe().promotionCodes.create({ promotion: { type: "coupon", coupon: coupon.id }, code });
    return code;
  }

  async function confirmAndComplete(clientSecret: string) {
    const siId = clientSecret.split("_secret_")[0];
    await stripe().setupIntents.confirm(siId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    return completeOfferCheckout(siId);
  }

  async function ownershipStatus(userId: string) {
    const db = createServiceClient();
    const { data } = await db.from("ownership").select("status, stripe_subscription_id").eq("user_id", userId);
    return data?.[0] ?? null;
  }

  it("refuses, before any card is saved, a returning trialist who was shown the trial", async () => {
    const { userId, email } = await buyer();
    const offerId = await trialOffer();
    await hadTrial(email, offerId);

    const start = await startOfferCheckout({ userId, email, offerId, priceChoice: 0, trialShown: true });
    expect(start).toMatchObject({ ok: false, code: "trial_used" });
    expect(await ownershipStatus(userId)).toBeNull();
  });

  it("charges a returning trialist who was shown the full price, with no trial", async () => {
    const { userId, email } = await buyer();
    const offerId = await trialOffer();
    await hadTrial(email, offerId);

    const start = await startOfferCheckout({ userId, email, offerId, priceChoice: 0, trialShown: false });
    expect(start).toMatchObject({ ok: true });
    if (!start.ok) throw new Error(start.error);
    expect(await confirmAndComplete(start.clientSecret)).toMatchObject({ ok: true });

    const own = await ownershipStatus(userId);
    expect(own?.status).toBe("active");
    const sub = await stripe().subscriptions.retrieve(own!.stripe_subscription_id as string);
    expect(sub.trial_end).toBeNull();
    expect(sub.status).toBe("active");
  });

  it("refuses a trial code to someone who has had the trial", async () => {
    const { userId, email } = await buyer();
    const offerId = await trialOffer();
    await hadTrial(email, offerId);

    const start = await startOfferCheckout({
      userId,
      email,
      offerId,
      priceChoice: 0,
      trialShown: false,
      couponCode: await trialCode(30),
    });
    expect(start).toMatchObject({ ok: false, code: "trial_used" });
    expect(await ownershipStatus(userId)).toBeNull();
  });

  it("still lets the same kind of code give a first-timer their trial", async () => {
    const { userId, email } = await buyer();
    const offerId = await trialOffer();

    const start = await startOfferCheckout({
      userId,
      email,
      offerId,
      priceChoice: 0,
      trialShown: true,
      couponCode: await trialCode(30),
    });
    expect(start).toMatchObject({ ok: true });
    if (!start.ok) throw new Error(start.error);
    expect(await confirmAndComplete(start.clientSecret)).toMatchObject({ ok: true });

    const own = await ownershipStatus(userId);
    expect(own?.status).toBe("trialing");
    const sub = await stripe().subscriptions.retrieve(own!.stripe_subscription_id as string);
    // 30 days from the code, not the price's 7.
    expect(sub.trial_end! - sub.trial_start!).toBe(30 * 86_400);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const email of emails) {
    await db.from("trial_history").delete().eq("email", email);
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (!user) continue;
    await db.from("ownership").delete().eq("user_id", user.id);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", user.id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id);
    await db.from("orders").delete().eq("user_id", user.id);
    await db.from("users").delete().eq("id", user.id);
    await db.auth.admin.deleteUser(user.id as string);
  }
  for (const id of offers) {
    await db.from("offer_prices").delete().eq("offer_id", id);
    await db.from("offers").delete().eq("id", id);
  }
});
