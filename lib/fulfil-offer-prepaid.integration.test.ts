import { describe, it, expect, afterAll } from "vitest";
import { fulfilOffer } from "@/lib/checkout";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { stripe } from "@/lib/stripe";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const orderIds: string[] = [];

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of orderIds) {
    await db.from("orders").delete().eq("id", id);
  }
});

describe.skipIf(!canRun)("a prepaid one-time offer (integration)", () => {
  it("grants without creating a second charge", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const customer = await stripe().customers.create({ email: `prepaid_${Date.now()}@example.test` });

    const { data: order } = await db
      .from("orders")
      .insert({
        livemode: false,
        store_id: storeId,
        email: "prepaid@example.test",
        status: "paid",
        currency: "usd",
        subtotal_cents: 4700,
        total_cents: 4700,
        stripe_customer_id: customer.id,
      })
      .select("id")
      .single();

    orderIds.push(order!.id as string);

    const before = await stripe().paymentIntents.list({ customer: customer.id, limit: 100 });

    const res = await fulfilOffer({
      order: { id: order!.id as string, stripeCustomerId: customer.id },
      offer: {
        id: "00000000-0000-0000-0000-0000000000f1",
        name: "zz prepaid fixture",
        billingType: "one_time",
        priceCents: 4700,
        currency: "usd",
        trialDays: null,
      } as never,
      paymentMethodId: "pm_card_visa",
      prepaid: true,
    });

    const after = await stripe().paymentIntents.list({ customer: customer.id, limit: 100 });
    expect(res.paymentIntentId).toBeUndefined();
    expect(after.data.length).toBe(before.data.length);
  });

  it("refuses a prepaid offer that resolves recurring, rather than stacking a subscription on the charge", async () => {
    // No order or Stripe customer needed: this must throw before either is
    // touched, from the billingType alone — that's the point of the guard.
    await expect(
      fulfilOffer({
        order: { id: "00000000-0000-0000-0000-000000000000", stripeCustomerId: "cus_doesnotmatter" },
        offer: {
          id: "00000000-0000-0000-0000-0000000000f3",
          name: "zz prepaid-recurring fixture",
          billingType: "recurring",
          priceCents: 4700,
          currency: "usd",
          trialDays: null,
        } as never,
        paymentMethodId: "pm_card_visa",
        prepaid: true,
      }),
    ).rejects.toThrow(/prepaid/i);
  });
});
