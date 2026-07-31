import { describe, it, expect, afterAll } from "vitest";
import {
  createCheckoutIntent,
  finalizeOrder,
  resolveOtoForOrder,
  acceptOto,
} from "@/lib/checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// Real money-path test: local Supabase + Stripe TEST mode. Skips if either
// isn't configured (so unit-only / CI-without-services runs stay green).
const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const createdEmails: string[] = [];

async function buy(bumpTaken: boolean) {
  const email = `it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  createdEmails.push(email);
  const res = await createCheckoutIntent({
    productSlug: "placeholder-offer",
    email,
    username: "it",
    password: "password12345",
    bumpTaken,
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
      bumpTaken: false,
      country: "US",
    });
    expect(repeat).toMatchObject({ ok: false, code: "already_owned" });

    // A DIFFERENT product, still signed in: no new account, same Stripe customer.
    const usersBefore = await db.from("users").select("id").eq("email", email);
    const second = await createIntent({
      productSlug: "field-guide",
      existingUserId: user!.id,
      bumpTaken: false,
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
