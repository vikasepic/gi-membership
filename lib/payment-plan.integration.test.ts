import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { refundOrder } from "@/lib/orders";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

/**
 * A payment plan, end to end, in Stripe test mode.
 *
 * The parts that cannot be seen from a unit test: that Stripe accepts the
 * schedule we build, that a trial really gets its own phase ahead of the N
 * invoices, and that a refund can end a scheduled subscription at all
 * (Stripe refuses to cancel one directly). Any of those failing is money.
 */
const canRun = !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made = { users: [] as string[], offers: [] as string[] };

async function planOffer(trialDays: number | null) {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.offers.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-plan-${id}`,
    name: "zz plan offer",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "recurring",
    interval: "month",
    interval_count: 1,
    trial_days: trialDays,
    price_cents: 100,
    currency: "usd",
    headline: "zz",
    description: "zz",
  });
  if (error) throw new Error(`fixture offer: ${error.message}`);
  const { error: pe } = await db.from("offer_prices").insert({
    offer_id: id,
    billing_type: "recurring",
    interval: "month",
    interval_count: 1,
    trial_days: trialDays,
    price_cents: 100,
    installments: 3,
    sort_order: 0,
  });
  if (pe) throw new Error(`fixture price: ${pe.message}`);
  return id;
}

async function member() {
  const db = createServiceClient();
  const email = `zz-plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const created = await db.auth.admin.createUser({ email, password: "password12345", email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const userId = created.data.user.id;
  made.users.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: "zz" });
  return { userId, email };
}

async function buy(offerId: string, userId: string, email: string, priceChoice?: number) {
  const start = await startOfferCheckout({ userId, email, offerId, priceChoice });
  if (!start.ok) throw new Error(start.error);
  const siId = start.clientSecret.split("_secret_")[0];
  await stripe().setupIntents.confirm(siId, { payment_method: "pm_card_visa", return_url: "http://localhost:3000/x" });
  const done = await completeOfferCheckout(siId);
  if (!done.ok || !("orderId" in done) || !done.orderId) throw new Error(`checkout did not complete: ${JSON.stringify(done)}`);
  return done.orderId;
}

async function subscriptionOf(userId: string) {
  const db = createServiceClient();
  const { data } = await db.from("ownership").select("status, stripe_subscription_id").eq("user_id", userId).order("id");
  expect(data).toHaveLength(1);
  return { status: data![0].status as string, subId: data![0].stripe_subscription_id as string };
}

const scheduleIdOf = (sub: { schedule?: string | { id: string } | null }) =>
  typeof sub.schedule === "string" ? sub.schedule : (sub.schedule?.id ?? null);

describe.skipIf(!canRun)("a payment plan, end to end (Stripe test mode)", () => {
  it("creates a subscription with a schedule of three invoices, and a refund ends it", async () => {
    const offerId = await planOffer(null);
    const { userId, email } = await member();
    // No price choice: the plan is the headline price, reached through the
    // offer's own mirrored columns. That path has to know about instalments too.
    const orderId = await buy(offerId, userId, email);

    const { status, subId } = await subscriptionOf(userId);
    expect(status).toBe("active");
    const sub = await stripe().subscriptions.retrieve(subId);
    expect(sub.metadata.installments).toBe("3");
    const schedId = scheduleIdOf(sub);
    expect(schedId).toBeTruthy();
    const sched = await stripe().subscriptionSchedules.retrieve(schedId!);
    expect(sched.end_behavior).toBe("cancel");
    // Stripe answers with dates, not iterations: one phase, three months long.
    expect(sched.phases).toHaveLength(1);
    const days = (sched.phases[0].end_date - sched.phases[0].start_date) / 86400;
    expect(days).toBeGreaterThan(85);
    expect(days).toBeLessThan(95);

    const refund = await refundOrder(orderId);
    expect(refund.ok).toBe(true);
    expect((await stripe().subscriptionSchedules.retrieve(schedId!)).status).toBe("canceled");
    expect((await stripe().subscriptions.retrieve(subId)).status).toBe("canceled");
  }, 60_000);

  it("gives a trial its own phase ahead of the three", async () => {
    const offerId = await planOffer(7);
    const { userId, email } = await member();
    await buy(offerId, userId, email, 0);
    const { status, subId } = await subscriptionOf(userId);
    expect(status).toBe("trialing");
    const sub = await stripe().subscriptions.retrieve(subId);
    const sched = await stripe().subscriptionSchedules.retrieve(scheduleIdOf(sub)!);
    expect(sched.phases).toHaveLength(2);
    expect(sched.phases[0].trial_end).toBe(sub.trial_end);
    const days = (sched.phases[1].end_date - sched.phases[1].start_date) / 86400;
    expect(days).toBeGreaterThan(85);
    expect(days).toBeLessThan(95);
  }, 60_000);
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const u of made.users) {
    await db.from("ownership").delete().eq("user_id", u);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id);
    await db.from("orders").delete().eq("user_id", u);
    await db.from("users").delete().eq("id", u);
    await db.auth.admin.deleteUser(u);
  }
  for (const o of made.offers) {
    await db.from("offer_prices").delete().eq("offer_id", o);
    await db.from("offers").delete().eq("id", o);
  }
});
