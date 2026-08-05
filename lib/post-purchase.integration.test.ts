import { describe, it, expect, afterAll } from "vitest";
import { createCheckoutIntent, finalizeOrder } from "@/lib/checkout";
import { mintPostPurchaseLogin } from "@/lib/post-purchase";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const createdEmails: string[] = [];

async function buyAndPay() {
  const email = `pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  createdEmails.push(email);
  const res = await createCheckoutIntent({
    productSlug: "placeholder-offer",
    email,
    fullName: "Test Buyer",
    bumpChoice: "none",
  });
  if (!res.ok) throw new Error(res.error);
  const piId = res.clientSecret.split("_secret_")[0];
  await stripe().paymentIntents.confirm(piId, {
    payment_method: "pm_card_visa",
    return_url: "http://localhost:3000/checkout/complete",
  });
  await finalizeOrder(piId);
  const pi = await stripe().paymentIntents.retrieve(piId);
  return { email, piId, clientSecret: pi.client_secret! };
}

// This mints a login session, so the guards are the whole point of the feature.
describe.skipIf(!canRun)("post-purchase auto sign-in (integration)", () => {
  it("mints a token for the buyer who actually paid", async () => {
    const { piId, clientSecret } = await buyAndPay();
    const token = await mintPostPurchaseLogin(piId, clientSecret);
    expect(token).toBeTruthy();
  });

  // The whole authorization argument rests on the client secret being unguessable
  // and unique to the paying browser. A wrong one must get nothing.
  it("refuses a wrong client secret", async () => {
    const { piId } = await buyAndPay();
    expect(await mintPostPurchaseLogin(piId, "pi_wrong_secret_abc")).toBeNull();
    expect(await mintPostPurchaseLogin(piId, null)).toBeNull();
  });

  // A thank-you URL pasted somewhere later must not still hand over an account.
  it("is single use", async () => {
    const { piId, clientSecret } = await buyAndPay();
    expect(await mintPostPurchaseLogin(piId, clientSecret)).toBeTruthy();
    expect(await mintPostPurchaseLogin(piId, clientSecret)).toBeNull();
  });

  it("refuses a payment that never succeeded", async () => {
    const email = `pp_unpaid_${Date.now()}@example.com`;
    createdEmails.push(email);
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
    });
    if (!res.ok) throw new Error(res.error);
    const piId = res.clientSecret.split("_secret_")[0];
    const pi = await stripe().paymentIntents.retrieve(piId);
    // Never confirmed — the account exists but no money moved.
    expect(await mintPostPurchaseLogin(piId, pi.client_secret!)).toBeNull();
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
