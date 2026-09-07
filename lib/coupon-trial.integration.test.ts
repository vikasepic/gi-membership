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
const SEEDED_TRIAL_OFFER = "00000000-0000-0000-0000-0000000000c1"; // 7-day trial

const emails: string[] = [];
const offers: string[] = [];

/**
 * A coupon that changes the trial changes everything the trial decides.
 *
 * `fulfilOffer` honoured `coupon.trialDays` when it told Stripe how many free
 * days to give, and nothing else did. The ownership row's status and the trial
 * we record as spent both read the PRICE's own value — so a code granting 30
 * days on a no-trial yearly wrote `status: "active"` for a subscription that
 * was trialing and recorded no trial history at all, leaving the buyer free to
 * take the monthly's 7 days as well. `trial_days=0` against a 7-day price is
 * the same defect pointing the other way.
 */
describe.skipIf(!canRun)("a coupon's trial (integration)", () => {
  async function trialCode(days: number) {
    // Stripe will not create a coupon with no discount at all, so a trial-only
    // promotion carries a nominal one — the same shape a real one has.
    const coupon = await stripe().coupons.create({
      percent_off: 1,
      duration: "once",
      metadata: { store: STORE_TAG, trial_days: String(days) },
    });
    const code = `ZZTRIAL${days}${Date.now()}`;
    await stripe().promotionCodes.create({ promotion: { type: "coupon", coupon: coupon.id }, code });
    return code;
  }

  async function buyer() {
    const db = createServiceClient();
    const email = `zzctrial_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    emails.push(email);
    const created = await db.auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: "ctrial" });
    return { userId, email };
  }

  /** An offer whose price carries NO trial — Ajit's yearly. */
  async function noTrialOffer() {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    offers.push(id);
    const { error } = await db.from("offers").insert({
      id,
      store_id: await getStoreId(),
      key: `zz-notrial-${id}`,
      name: "zz no-trial fixture",
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      grant_channels: [],
      billing_type: "recurring",
      interval: "year",
      interval_count: 1,
      trial_days: 0,
      price_cents: 19900,
      currency: "usd",
      headline: "fixture",
      description: "fixture",
    });
    if (error) throw new Error(`test fixture: offer: ${error.message}`);
    return id;
  }

  async function buy(userId: string, email: string, offerId: string, code: string) {
    const start = await startOfferCheckout({ userId, email, offerId, couponCode: code });
    expect(start).toMatchObject({ ok: true });
    if (!start.ok) throw new Error(start.error);
    const siId = start.clientSecret.split("_secret_")[0];
    await stripe().setupIntents.confirm(siId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    expect(await completeOfferCheckout(siId)).toEqual({ ok: true });
  }

  it("starts a trial the price does not have, and spends it", async () => {
    const { userId, email } = await buyer();
    const offerId = await noTrialOffer();
    await buy(userId, email, offerId, await trialCode(30));

    const db = createServiceClient();
    const { data: own } = await db.from("ownership").select("status").eq("user_id", userId);
    // Stripe was told trial_period_days: 30. The store said "active".
    expect(own?.[0]?.status).toBe("trialing");

    // And with no trial_history row they could go on to take the monthly's
    // seven days as well — 37 free days on one promotion.
    const { data: history } = await db
      .from("trial_history")
      .select("grant_key")
      .eq("email", email)
      .in("grant_key", grantKeysOf((await getOffer(offerId))!));
    expect(history).toHaveLength(1);

    // And the ledger has to agree with the card. Stripe charges nothing today
    // — the trial runs 30 days — so an order booking $199 is revenue that was
    // never taken, on the one promotion this feature exists to run.
    const { data: order } = await db
      .from("orders")
      .select("subtotal_cents, total_cents")
      .eq("email", email)
      .single();
    expect(order).toEqual({ subtotal_cents: 0, total_cents: 0 });
  });

  it("removes a trial the price does have, and spends nothing", async () => {
    const { userId, email } = await buyer();
    await buy(userId, email, SEEDED_TRIAL_OFFER, await trialCode(0));

    const db = createServiceClient();
    const { data: own } = await db.from("ownership").select("status").eq("user_id", userId);
    // Stripe charges this one immediately; "trialing" would be a lie the CRM
    // tags on and the customer reads on their receipt.
    expect(own?.[0]?.status).toBe("active");

    const { data: history } = await db.from("trial_history").select("grant_key").eq("email", email);
    expect(history).toHaveLength(0);

    // The same defect pointing the other way: the price's trial made the order
    // book $0 while Stripe billed the first period immediately. A paid sale
    // recorded as free is the half nobody notices.
    const { data: order } = await db
      .from("orders")
      .select("subtotal_cents, total_cents")
      .eq("email", email)
      .single();
    // Read from the offer rather than hardcoded: the seeded price differs
    // between this database and production, and a literal here would pin the
    // test to whichever one its author happened to look at.
    //
    // Full price, not 1% off — on a subscription the discount is Stripe's to
    // apply to the first invoice, so the order books the undiscounted figure.
    const full = (await getOffer(SEEDED_TRIAL_OFFER))!.priceCents;
    expect(order).toEqual({ subtotal_cents: full, total_cents: full });
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
  for (const id of offers) await db.from("offers").delete().eq("id", id);
});
