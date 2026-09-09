import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { getStandingOffer } from "@/lib/library";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const createdEmails: string[] = [];

// A member who owns something but has never paid us — exactly the case that
// made the library button dead: no order, so no saved card.
async function memberWithoutCard() {
  const email = `offerco_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
  createdEmails.push(email);
  const db = createServiceClient();
  const created = await db.auth.admin.createUser({
    email,
    password: "password12345",
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const userId = created.data.user.id;
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: "offerco" });
  return { userId, email };
}

describe.skipIf(!canRun)("standalone offer checkout (integration)", () => {
  it("saves a card via SetupIntent, then grants the trial exactly once", async () => {
    const { userId, email } = await memberWithoutCard();
    const offer = await getStandingOffer(userId);
    if (!offer) return; // no subscription offer configured — nothing to assert

    const start = await startOfferCheckout({ userId, email, offerId: offer.id });
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    // Confirm the SetupIntent the way the Payment Element would.
    const siId = start.clientSecret.split("_secret_")[0];
    await stripe().setupIntents.confirm(siId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });

    expect(await completeOfferCheckout(siId)).toEqual({ ok: true, orderId: expect.any(String) });

    const db = createServiceClient();
    const subsAfterFirst = await db
      .from("ownership")
      .select("app_id, status, stripe_subscription_id")
      .eq("user_id", userId);
    expect(subsAfterFirst.data).toHaveLength(1);
    expect(subsAfterFirst.data![0].status).toBe("trialing");

    // Refreshing the return page must not grant or bill a second time. No
    // orderId on this shape — the eligibility short-circuit that makes a
    // refresh a no-op returns before creating or reclaiming any order.
    expect(await completeOfferCheckout(siId)).toEqual({ ok: true });
    const after = await db.from("ownership").select("app_id").eq("user_id", userId);
    expect(after.data).toHaveLength(1);
  });
});

afterAll(async () => {
  const db = createServiceClient();
  for (const email of createdEmails) {
    const { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (!user) continue;
    await db.from("ownership").delete().eq("user_id", user.id);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", user.id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id);
    await db.from("orders").delete().eq("user_id", user.id);
    await db.from("users").delete().eq("id", user.id);
    await db.auth.admin.deleteUser(user.id);
  }
});
