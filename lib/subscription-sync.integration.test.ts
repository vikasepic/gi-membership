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
    fullName: "Test Buyer",
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
      fullName: "Test Buyer",
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

// --- Standing offer must not 500 on a failed off-session charge ------------
import { acceptStandingOffer } from "@/lib/checkout";
import { getStandingOffer } from "@/lib/library";

describe.skipIf(!canRun)("standing offer vs failed charge (integration)", () => {
  it("returns charge_failed instead of throwing, so the library can say what happened", async () => {
    const email = `standfail_${Date.now()}@example.com`;
    createdEmails.push(email);
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpTaken: false, // decline, so the subscription is still on offer
    });
    if (!res.ok) throw new Error(res.error);
    const piId = res.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(piId);

    const db = createServiceClient();
    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    const offer = await getStandingOffer(user!.id);
    if (!offer) return; // no subscription offer configured here — nothing to assert

    // Same forced failure as the OTO case: a customer Stripe does not have.
    await db
      .from("orders")
      .update({ stripe_customer_id: "cus_nonexistent_for_test" })
      .eq("stripe_payment_intent_id", piId);

    // A card we cannot charge is a normal outcome, not a crash. Which of the
    // two it reports depends on where Stripe gives up (no card on file vs the
    // charge itself failing); what must hold is that it resolves to a status
    // the library knows how to render, rather than throwing out of the action.
    const accepted = await acceptStandingOffer(user!.id, offer.id);
    expect(accepted.ok).toBe(false);
    expect(["no_saved_card", "charge_failed"]).toContain(
      (accepted as { ok: false; error: string }).error,
    );
  });
});
