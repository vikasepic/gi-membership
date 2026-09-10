import { describe, it, expect, afterAll } from "vitest";
import { createCheckoutIntent, finalizeOrder } from "@/lib/checkout";
import { revokeOwnershipForPaymentIntent, syncSubscriptionOwnership } from "@/lib/subscription-sync";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

// Real money-path hardening test: local Supabase + Stripe TEST mode.
// Skips when either isn't configured so unit-only runs stay green.
const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const createdEmails: string[] = [];

async function buyWithBump() {
  const email = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  createdEmails.push(email);
  const res = await createCheckoutIntent({
    productSlug: "placeholder-offer",
    email,
    fullName: "Test Buyer",
    bumpChoice: "main",
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
  it("a refund takes back the product and LEAVES a trial Stripe is still running", async () => {
    // The bug this replaces: refunding the product revoked the bump's
    // subscription in our records and told the app to withdraw access, while
    // the Stripe subscription carried on billing. The customer paid for
    // something they could no longer open, and nobody reports that — they
    // just churn. Refunding this order refunds THIS order's PaymentIntent; a
    // separate subscription is not part of it.
    const { email, piId } = await buyWithBump();
    expect(await ownershipFor(email)).toHaveLength(2); // product + trial subscription

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

    const after = await ownershipFor(email);
    expect(after.filter((o) => o.product_id)).toHaveLength(0);
    // Still trialing, because Stripe still says so.
    expect(after.find((o) => o.app_id)!.status).toBe("trialing");
  });

  it("a refund DOES take the subscription back once Stripe has ended it", async () => {
    const { email, piId } = await buyWithBump();
    const sub = (await ownershipFor(email)).find((o) => o.stripe_subscription_id)!;
    await stripe().subscriptions.cancel(sub.stripe_subscription_id as string);

    await stripe().refunds.create({ payment_intent: piId });
    await revokeOwnershipForPaymentIntent(piId);

    const after = await ownershipFor(email);
    expect(after.find((o) => o.app_id)!.status).toBe("canceled");
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
  it("releases the single-use token when the saved card cannot be charged, so the buyer can retry", async () => {
    const email = `otofail_${Date.now()}@example.com`;
    createdEmails.push(email);
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpChoice: "none", // decline the bump so an OTO is offered
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

    // Force acceptOto to find no usable card, by pointing the order at a
    // customer Stripe has no record of. savedPaymentMethodFor asks Stripe for
    // THIS customer directly (never the order's own stale PaymentIntent —
    // see its own comment in lib/checkout.ts on why: a recurring host offer's
    // order has no PaymentIntent to read one off at all), gets nothing back,
    // and acceptOto reports "invalid" — the same code it already used for
    // "no payment method found" before this fix, just reached by a more
    // direct route now. This used to report "charge_failed" here instead:
    // the OLD code read the payment method off the ORIGINAL purchase's own
    // PaymentIntent, which stayed valid regardless of what stripe_customer_id
    // said, so the failure only surfaced once fulfilOffer tried to bill the
    // fake customer id and Stripe rejected THAT call. The error code changed;
    // the one thing this test exists to prove — the claimed token is
    // released, not burned, on this dead end — did not.
    const db = createServiceClient();
    await db
      .from("orders")
      .update({ stripe_customer_id: "cus_nonexistent_for_test" })
      .eq("stripe_payment_intent_id", piId);

    const first = await acceptOto(token);
    expect(first).toEqual({ ok: false, error: "invalid" });

    // The token must NOT be burned — presenting it again is not "used".
    const second = await acceptOto(token);
    expect(second).not.toEqual({ ok: false, error: "used" });

    // And the dead end is on record. A released token alone looked exactly
    // like a buyer who never clicked; this row is what tells them apart.
    const { data: orderRow } = await db
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", piId)
      .maybeSingle();
    const { data: logged } = await db
      .from("error_events")
      .select("message, context")
      .eq("source", "oto_accept")
      .eq("context->>orderId", orderRow!.id as string)
      .order("created_at", { ascending: false });
    expect(logged?.length).toBeGreaterThanOrEqual(2);
    expect(logged![0].message).toBe("no saved card on customer");
    expect(logged![0].context).toMatchObject({ error: "invalid" });
    await db.from("error_events").delete().eq("source", "oto_accept").eq("context->>orderId", orderRow!.id as string);
  });

  it("releases the single-use token when fulfilOffer ITSELF throws (a declined off-session charge), so the buyer can retry", async () => {
    // The test above only ever reaches acceptOto's `!pm` guard, one function
    // up from fulfilOffer's own catch — savedPaymentMethodFor fails first, so
    // fulfilOffer is never even called. That guard is real and worth keeping,
    // but it is not the guarantee this describe block's title claims: a
    // release when the CHARGE itself fails. Proved by hand, not assumed:
    // commenting out fulfilOffer's own catch release (the block below, not
    // the `!pm` one above) left this test — and only this test — red; every
    // other test in the file, this one's own first assertion included,
    // stayed green.
    //
    // Needs its OWN one-time offer fixture rather than reusing "placeholder-
    // offer"'s upsell (Content Engine): that one carries a 7-day trial, and a
    // TRIALING subscription.create() attempts no charge at all — Stripe
    // accepts it regardless of whether the card can ever be charged, which is
    // exactly why this test cannot just plug a bad card into the existing
    // fixture the way the test above does. Namespaced to this run (random
    // stamp in every slug/key) and torn down below, rather than mutating
    // "placeholder-offer" itself or leaving new rows behind — this store is
    // shared with every other suite that can run in parallel.
    const db = createServiceClient();
    const store_id = await getStoreId();
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { data: granted, error: grantedErr } = await db
      .from("products")
      .insert({ store_id, slug: `otofail2-granted-${stamp}`, title: "OTO fail granted", type: "pdf", price_cents: 1900, status: "published" })
      .select("id")
      .single();
    if (grantedErr) throw new Error(`granted product: ${grantedErr.message}`);

    const { data: offer, error: offerErr } = await db
      .from("offers")
      .insert({
        store_id, key: `otofail2-upsell-${stamp}`, name: "OTO fail upsell",
        grant_type: "product", grant_product_id: granted!.id as string,
        billing_type: "one_time", price_cents: 3900, currency: "usd",
        headline: "Test upsell", active: true,
      })
      .select("id")
      .single();
    if (offerErr) throw new Error(`upsell offer: ${offerErr.message}`);

    const { data: host, error: hostErr } = await db
      .from("products")
      .insert({
        store_id, slug: `otofail2-host-${stamp}`, title: "OTO fail host", type: "pdf",
        price_cents: 2700, status: "published", upsell_offer_id: offer!.id as string,
      })
      .select("id, slug")
      .single();
    if (hostErr) throw new Error(`host product: ${hostErr.message}`);

    try {
      const email = `otofail2_${stamp}@example.com`;
      createdEmails.push(email);
      const res = await createCheckoutIntent({
        productSlug: host!.slug as string,
        email,
        fullName: "Test Buyer",
        bumpChoice: "none", // no bump configured on this fixture either way
      });
      if (!res.ok) throw new Error(res.error);
      const piId = res.clientSecret.split("_secret_")[0];
      await stripe().paymentIntents.confirm(piId, {
        payment_method: "pm_card_visa",
        return_url: "http://localhost:3000/checkout/complete",
      });
      await finalizeOrder(piId);

      // A fixture this test built and controls end to end — unlike the
      // ambient "placeholder-offer" the test above reads, there is no
      // "not configured in this environment" case to shrug off here.
      const token = await resolveOtoForOrder(piId);
      expect(token).toBeTruthy();

      // savedPaymentMethodFor must SUCCEED here, unlike the test above —
      // Stripe's own fixture for exactly this shape (verified by hand against
      // the real test-mode API, not assumed: pm_card_chargeDeclined and its
      // siblings all fail at attach() itself, which would only ever reach the
      // SAME `!pm` guard as the test above): pm_card_chargeCustomerFail
      // attaches and sets as default cleanly, so savedPaymentMethodFor finds
      // a real card, but any attempt to actually CHARGE it is declined.
      const { data: order } = await db
        .from("orders")
        .select("stripe_customer_id")
        .eq("stripe_payment_intent_id", piId)
        .single();
      const customerId = order!.stripe_customer_id as string;
      // attach() returns a real pm_... id of its own — distinct from the
      // fixture token passed in — so THAT id, not the token string, is what
      // has to be set as the default.
      const badCard = await stripe().paymentMethods.attach("pm_card_chargeCustomerFail", {
        customer: customerId,
      });
      await stripe().customers.update(customerId, {
        invoice_settings: { default_payment_method: badCard.id },
      });

      const first = await acceptOto(token!);
      expect(first).toEqual({ ok: false, error: "charge_failed" });

      // The token must NOT be burned — presenting it again is not "used".
      const second = await acceptOto(token!);
      expect(second).not.toEqual({ ok: false, error: "used" });
    } finally {
      // oto_tokens.offer_id is ON DELETE RESTRICT (0001) — the two acceptOto
      // calls above mint/claim one such row, and it must go before the offer
      // it points at or that delete is silently blocked (found out the hard
      // way: a first pass at this cleanup left the offer AND the granted
      // product behind, restrict on restrict). offers.upsell_offer_id and
      // products.grant_product_id both FK back to the offer too — the former
      // ON DELETE SET NULL (harmless either order), the latter ON DELETE
      // RESTRICT like oto_tokens, which is why the offer goes before the
      // granted product as well.
      await db.from("oto_tokens").delete().eq("offer_id", offer!.id as string);
      await db.from("offers").delete().eq("id", offer!.id as string);
      await db.from("products").delete().eq("id", host!.id as string);
      await db.from("products").delete().eq("id", granted!.id as string);
    }
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
      bumpChoice: "none", // decline, so the subscription is still on offer
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
