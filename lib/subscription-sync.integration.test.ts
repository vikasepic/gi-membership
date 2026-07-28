import { describe, it, expect, afterAll } from "vitest";
import { createCheckoutIntent, finalizeOrder } from "@/lib/checkout";
import { revokeOwnershipForPaymentIntent, syncSubscriptionOwnership } from "@/lib/subscription-sync";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// Real money-path hardening test: local Supabase + Stripe TEST mode.
// Skips when either isn't configured so unit-only runs stay green.
const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const createdEmails: string[] = [];

async function buyWithBump() {
  const email = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  createdEmails.push(email);
  const res = await createCheckoutIntent({
    productSlug: "placeholder-offer",
    email,
    username: "sync",
    password: "password12345",
    bumpTaken: true,
  });
  if (!res.ok) throw new Error(`createCheckoutIntent: ${res.error}`);
  const piId = res.clientSecret.split("_secret_")[0];
  await stripe().paymentIntents.confirm(piId, {
    payment_method: "pm_card_visa",
    return_url: "http://localhost:3000/checkout/complete",
  });
  await finalizeOrder(piId);
  return { email, piId };
}

async function ownershipFor(email: string) {
  const db = createServiceClient();
  const { data: user } = await db.from("users").select("id").eq("email", email).single();
  const { data } = await db
    .from("ownership")
    .select("product_id, app_id, status, stripe_subscription_id")
    .eq("user_id", user!.id);
  return data ?? [];
}

describe.skipIf(!canRun)("subscription + refund hardening (integration)", () => {
  it("a refund revokes the product bought on that order and marks the order refunded", async () => {
    const { email, piId } = await buyWithBump();
    expect(await ownershipFor(email)).toHaveLength(2); // product + trial subscription

    // Real Stripe test-mode refund, then the webhook's handler.
    await stripe().refunds.create({ payment_intent: piId });
    const { revoked } = await revokeOwnershipForPaymentIntent(piId);
    expect(revoked).toBeGreaterThan(0);

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("status")
      .eq("stripe_payment_intent_id", piId)
      .single();
    expect(order!.status).toBe("refunded");

    // The purchased product is gone; the subscription row is canceled, not left active.
    const after = await ownershipFor(email);
    expect(after.filter((o) => o.product_id)).toHaveLength(0);
    for (const row of after.filter((o) => o.app_id)) {
      expect(row.status).toBe("canceled");
    }
  });

  it("a failed renewal marks the subscription past_due without revoking access", async () => {
    const { email } = await buyWithBump();
    const sub = (await ownershipFor(email)).find((o) => o.stripe_subscription_id);
    expect(sub).toBeTruthy();

    await syncSubscriptionOwnership(sub!.stripe_subscription_id as string, "past_due");

    const after = await ownershipFor(email);
    const row = after.find((o) => o.app_id);
    expect(row!.status).toBe("past_due"); // flagged for dunning, row still present
  });

  it("a trial converting at day 7 flips trialing to active", async () => {
    const { email } = await buyWithBump();
    const sub = (await ownershipFor(email)).find((o) => o.stripe_subscription_id);
    expect(sub!.status).toBe("trialing");

    await syncSubscriptionOwnership(sub!.stripe_subscription_id as string, "active");

    const after = await ownershipFor(email);
    expect(after.find((o) => o.app_id)!.status).toBe("active");
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const email of createdEmails) {
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    await db.from("orders").delete().eq("email", email);
    if (user) {
      await db.from("users").delete().eq("id", user.id);
      await db.auth.admin.deleteUser(user.id);
    }
  }
});

// --- OTO token must survive a failed off-session charge --------------------
import { resolveOtoForOrder, acceptOto } from "@/lib/checkout";

describe.skipIf(!canRun)("OTO token vs failed charge (integration)", () => {
  it("releases the single-use token when the charge fails, so the buyer can retry", async () => {
    const email = `otofail_${Date.now()}@example.com`;
    createdEmails.push(email);
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      username: "otofail",
      password: "password12345",
      bumpTaken: false, // decline the bump so an OTO is offered
    });
    if (!res.ok) throw new Error(res.error);
    const piId = res.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(piId);

    const token = await resolveOtoForOrder(piId);
    if (!token) return; // no OTO configured here — nothing to assert

    // Force the off-session charge to fail the way a declined card would, by
    // pointing the order at a customer Stripe does not have.
    const db = createServiceClient();
    await db
      .from("orders")
      .update({ stripe_customer_id: "cus_nonexistent_for_test" })
      .eq("stripe_payment_intent_id", piId);

    const first = await acceptOto(token);
    expect(first).toEqual({ ok: false, error: "charge_failed" });

    // The token must NOT be burned — presenting it again is not "used".
    const second = await acceptOto(token);
    expect(second).not.toEqual({ ok: false, error: "used" });
  });
});
