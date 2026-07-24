import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getProductBySlug, getOffer } from "@/lib/store";
import { isOfferEligible, immediateChargeCents, type Ownership } from "@/lib/offers";
import { signOtoToken, verifyOtoToken } from "@/lib/oto-token";
import { provisionAppSubscription } from "@/lib/apps";
import { stripe, stripeMode } from "@/lib/stripe";
import { otoSigningSecret } from "@/lib/env";
import type { Offer } from "@/lib/types";

const OTO_TTL_SECONDS = 15 * 60; // 15 minutes
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// A Stripe subscription price needs a Stripe Product id. Create one per offer
// on first use and cache it on the offer row (per mode).
async function ensureStripeProduct(offer: Offer): Promise<string> {
  const mode = stripeMode();
  const existing = mode === "live" ? offer.stripeProductIdLive : offer.stripeProductIdTest;
  if (existing) return existing;
  const product = await stripe().products.create(
    { name: offer.name, metadata: { offerId: offer.id } },
    { idempotencyKey: `prod_offer_${offer.id}_${mode}` },
  );
  const db = createServiceClient();
  const col = mode === "live" ? "stripe_product_id_live" : "stripe_product_id_test";
  await db.from("offers").update({ [col]: product.id }).eq("id", offer.id);
  return product.id;
}

// Money path. Base product = one PaymentIntent (card saved off_session). Bump
// is fulfilled SEPARATELY via fulfilOffer on the saved card — one-time charge
// or trial subscription. finalizeOrder is idempotent and is the single path
// both the thank-you confirm and (later) the Stripe webhook call.

export type CheckoutInput = {
  productSlug: string;
  email: string;
  username: string;
  password: string;
  bumpTaken: boolean;
  anonId?: string | null; // attribution visitor cookie, read by the action layer
};

export type CheckoutResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; code?: "account_exists" };

const normEmail = (e: string) => e.trim().toLowerCase();

// Look up what a user already owns — drives bump eligibility.
async function ownershipFor(userId: string): Promise<Ownership> {
  const db = createServiceClient();
  const { data } = await db
    .from("ownership")
    .select("product_id, app_id")
    .eq("user_id", userId);
  const productIds = new Set<string>();
  const appIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.product_id) productIds.add(row.product_id as string);
    if (row.app_id) appIds.add(row.app_id as string);
  }
  return { productIds, appIds };
}

export async function createCheckoutIntent(input: CheckoutInput): Promise<CheckoutResult> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const email = normEmail(input.email);

  const product = await getProductBySlug(input.productSlug);
  if (!product || product.status !== "published") return { ok: false, error: "Product not available" };

  // Signup at checkout — create the auth account (auto-confirmed; they're paying).
  const created = await db.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { username: input.username },
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "Could not create account";
    if (/already|exists|registered/i.test(msg)) {
      return { ok: false, error: "An account with this email exists — please log in.", code: "account_exists" };
    }
    return { ok: false, error: msg };
  }
  const userId = created.data.user.id;

  const { error: profileErr } = await db.from("users").insert({
    id: userId,
    store_id: storeId,
    email,
    username: input.username,
  });
  if (profileErr) return { ok: false, error: `profile: ${profileErr.message}` };

  // Resolve the bump: only if taken, present, and the buyer is eligible.
  const owned = await ownershipFor(userId);
  let bumpOffer: Offer | null = null;
  if (input.bumpTaken && product.bumpOfferId) {
    const offer = await getOffer(product.bumpOfferId);
    if (offer && isOfferEligible(offer, owned)) bumpOffer = offer;
  }

  const customer = await stripe().customers.create({
    email,
    metadata: { storeId, userId },
  });

  // Base $27 PaymentIntent — saves the card for off-session offer fulfilment.
  const pi = await stripe().paymentIntents.create({
    amount: product.priceCents,
    currency: product.currency,
    customer: customer.id,
    setup_future_usage: "off_session",
    automatic_payment_methods: { enabled: true },
    metadata: {
      storeId,
      userId,
      productId: product.id,
      bumpOfferId: bumpOffer?.id ?? "",
    },
  });

  // Attach the attribution visitor (captured on landing) to this order.
  let visitorId: string | null = null;
  if (input.anonId) {
    const { data: v } = await db
      .from("visitors")
      .select("id")
      .eq("store_id", storeId)
      .eq("anon_id", input.anonId)
      .maybeSingle();
    visitorId = v?.id ?? null;
  }

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      user_id: userId,
      email,
      status: "pending",
      currency: product.currency,
      subtotal_cents: product.priceCents,
      total_cents: product.priceCents,
      stripe_customer_id: customer.id,
      stripe_payment_intent_id: pi.id,
      visitor_id: visitorId,
    })
    .select("id")
    .single();
  if (orderErr || !order) return { ok: false, error: `order: ${orderErr?.message}` };

  await db.from("order_items").insert({
    store_id: storeId,
    order_id: order.id,
    kind: "product",
    product_id: product.id,
    description: product.title,
    amount_cents: product.priceCents,
  });

  if (!pi.client_secret) return { ok: false, error: "No client secret" };
  return { ok: true, clientSecret: pi.client_secret };
}

// Fulfil an offer on the customer's saved card. one-time -> off-session
// PaymentIntent; subscription -> Stripe Subscription (with trial). Idempotent
// via a deterministic idempotency key. Returns the created Stripe id.
export async function fulfilOffer(args: {
  order: { id: string; stripeCustomerId: string };
  offer: Offer;
  paymentMethodId: string;
}): Promise<{ subscriptionId?: string; paymentIntentId?: string }> {
  const { order, offer, paymentMethodId } = args;
  const idem = `fulfil_${order.id}_${offer.id}`;

  if (offer.billingType === "recurring") {
    const productId = await ensureStripeProduct(offer);
    const sub = await stripe().subscriptions.create(
      {
        customer: order.stripeCustomerId,
        default_payment_method: paymentMethodId,
        items: [
          {
            price_data: {
              currency: offer.currency,
              product: productId,
              unit_amount: offer.priceCents,
              recurring: {
                interval: offer.interval ?? "month",
                interval_count: offer.intervalCount ?? 1,
              },
            },
          },
        ],
        trial_period_days: offer.trialDays ?? undefined,
        // Tag as store-created so Content Engine's webhook doesn't clobber it.
        metadata: { store_created: "true", orderId: order.id, offerId: offer.id },
      },
      { idempotencyKey: idem },
    );
    return { subscriptionId: sub.id };
  }

  const charge = immediateChargeCents(offer);
  const pi = await stripe().paymentIntents.create(
    {
      amount: charge,
      currency: offer.currency,
      customer: order.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { store_created: "true", orderId: order.id, offerId: offer.id },
    },
    { idempotencyKey: idem },
  );
  return { paymentIntentId: pi.id };
}

// Idempotently finalize a paid order: mark paid, grant base ownership, fulfil
// the bump. Safe to call twice (thank-you confirm AND webhook).
export async function finalizeOrder(paymentIntentId: string): Promise<void> {
  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("id, store_id, user_id, status, stripe_customer_id, email")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!order || !order.user_id) return;
  if (order.status === "paid") return; // already finalized — idempotent

  const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") return;

  await db.from("orders").update({ status: "paid" }).eq("id", order.id);

  // Grant ownership of the base product. Plain insert — the order-paid guard
  // above makes finalize idempotent; a unique-violation (already owned) is fine.
  const productId = pi.metadata.productId;
  if (productId) {
    const { error } = await db.from("ownership").insert({
      store_id: order.store_id,
      user_id: order.user_id,
      product_id: productId,
      source: "purchase",
      status: "active",
    });
    if (error && error.code !== "23505") throw new Error(`grant base: ${error.message}`);
  }

  // Fulfil the bump if one was taken.
  const bumpOfferId = pi.metadata.bumpOfferId;
  const paymentMethodId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
  if (bumpOfferId && paymentMethodId && order.stripe_customer_id) {
    const offer = await getOffer(bumpOfferId);
    if (offer) {
      const result = await fulfilOffer({
        order: { id: order.id, stripeCustomerId: order.stripe_customer_id },
        offer,
        paymentMethodId,
      });
      await grantOfferOwnership(order.store_id, order.user_id, offer, "bump", result.subscriptionId ?? null, {
        email: order.email as string,
        stripeCustomerId: order.stripe_customer_id,
      });
      await db.from("order_items").insert({
        store_id: order.store_id,
        order_id: order.id,
        kind: "bump",
        offer_id: offer.id,
        description: offer.name,
        amount_cents: immediateChargeCents(offer),
        stripe_subscription_id: result.subscriptionId ?? null,
        stripe_payment_intent_id: result.paymentIntentId ?? null,
      });
    }
  }
}

async function grantOfferOwnership(
  storeId: string,
  userId: string,
  offer: Offer,
  source: "bump" | "oto" | "grant",
  subscriptionId: string | null,
  ctx?: { email: string; stripeCustomerId: string | null },
) {
  const db = createServiceClient();
  const trialing = offer.trialDays && offer.trialDays > 0;

  if (offer.grantType === "subscription" && offer.grantAppId) {
    const { error } = await db.from("ownership").insert({
      store_id: storeId,
      user_id: userId,
      app_id: offer.grantAppId,
      offer_id: offer.id,
      source,
      stripe_subscription_id: subscriptionId,
      status: trialing ? "trialing" : "active",
    });
    if (error && error.code !== "23505") throw new Error(`grant offer (app): ${error.message}`);

    // Provision the connected app (best-effort, server-to-server). A failure
    // here never breaks the purchase — the handoff re-provisions on first open.
    if (ctx) {
      await provisionAppSubscription({
        appId: offer.grantAppId,
        userId,
        email: ctx.email,
        entitlementKey: offer.grantEntitlementKey,
        stripeCustomerId: ctx.stripeCustomerId,
        stripeSubscriptionId: subscriptionId,
      });
    }
  } else if (offer.grantType === "product" && offer.grantProductId) {
    const { error } = await db.from("ownership").insert({
      store_id: storeId,
      user_id: userId,
      product_id: offer.grantProductId,
      offer_id: offer.id,
      source,
      status: "active",
    });
    if (error && error.code !== "23505") throw new Error(`grant offer (product): ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// OTO (one-time offer) — shown full-page AFTER checkout only when the bump was
// declined, the product has an upsell slot, and the buyer is eligible.
// ---------------------------------------------------------------------------

// Decide whether an OTO should show for a just-finalized order. Returns a
// signed single-use token to carry into the OTO page, or null to skip to
// thank-you.
export async function resolveOtoForOrder(paymentIntentId: string): Promise<string | null> {
  const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  if (pi.metadata.bumpOfferId) return null; // bump already taken → no OTO
  const productId = pi.metadata.productId;
  const userId = pi.metadata.userId;
  if (!productId || !userId) return null;

  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("id, store_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!order) return null;

  const { data: prod } = await db
    .from("products")
    .select("upsell_offer_id")
    .eq("id", productId)
    .maybeSingle();
  if (!prod?.upsell_offer_id) return null; // empty slot → skip

  const offer = await getOffer(prod.upsell_offer_id as string);
  if (!offer || !offer.active) return null;

  // Eligibility is correctness: never show an OTO for something already owned.
  const owned = await ownershipFor(userId);
  if (!isOfferEligible(offer, owned)) return null;

  return mintOtoToken(order.id, order.store_id as string, offer.id, userId);
}

async function mintOtoToken(
  orderId: string,
  storeId: string,
  offerId: string,
  userId: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + OTO_TTL_SECONDS;
  const token = signOtoToken({ orderId, offerId, userId, exp }, otoSigningSecret());
  const db = createServiceClient();
  await db.from("oto_tokens").insert({
    store_id: storeId,
    order_id: orderId,
    user_id: userId,
    offer_id: offerId,
    token_hash: sha256(token),
    status: "pending",
    expires_at: new Date(exp * 1000).toISOString(),
  });
  return token;
}

// Accept a standing offer from the library (buyer who declined the OTO). Uses
// the saved card from their most recent paid order. Eligibility is re-checked,
// so it can't grant something already owned.
export async function acceptStandingOffer(
  userId: string,
  offerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const offer = await getOffer(offerId);
  if (!offer || !offer.active) return { ok: false, error: "unavailable" };

  const owned = await ownershipFor(userId);
  if (!isOfferEligible(offer, owned)) return { ok: false, error: "already_owned" };

  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("id, store_id, stripe_customer_id, stripe_payment_intent_id, email")
    .eq("user_id", userId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order?.stripe_customer_id || !order.stripe_payment_intent_id) {
    return { ok: false, error: "no_saved_card" };
  }

  const pi = await stripe().paymentIntents.retrieve(order.stripe_payment_intent_id as string);
  const pm = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
  if (!pm) return { ok: false, error: "no_saved_card" };

  const result = await fulfilOffer({
    order: { id: order.id as string, stripeCustomerId: order.stripe_customer_id as string },
    offer,
    paymentMethodId: pm,
  });
  await grantOfferOwnership(order.store_id as string, userId, offer, "grant", result.subscriptionId ?? null, {
    email: order.email as string,
    stripeCustomerId: order.stripe_customer_id as string,
  });
  await db.from("order_items").insert({
    store_id: order.store_id,
    order_id: order.id,
    kind: "oto",
    offer_id: offer.id,
    description: offer.name,
    amount_cents: immediateChargeCents(offer),
    stripe_subscription_id: result.subscriptionId ?? null,
    stripe_payment_intent_id: result.paymentIntentId ?? null,
  });
  return { ok: true };
}

export type OtoAcceptResult = { ok: true } | { ok: false; error: "invalid" | "expired" | "used" };

// Accept the OTO. POST-only, single-use: an atomic pending→completed update is
// the replay guard, so a back-button/refresh/replay can never double-charge.
export async function acceptOto(token: string): Promise<OtoAcceptResult> {
  const verified = verifyOtoToken(token, otoSigningSecret());
  if (!verified.ok) return { ok: false, error: verified.reason };
  const { orderId, offerId, userId } = verified.payload;

  const db = createServiceClient();
  const { data: consumed } = await db
    .from("oto_tokens")
    .update({ status: "completed", consumed_at: new Date().toISOString() })
    .eq("token_hash", sha256(token))
    .eq("status", "pending")
    .select("id");
  if (!consumed || consumed.length === 0) return { ok: false, error: "used" };

  const { data: order } = await db
    .from("orders")
    .select("id, store_id, stripe_customer_id, stripe_payment_intent_id, email")
    .eq("id", orderId)
    .maybeSingle();
  const offer = await getOffer(offerId);
  if (!order || !offer) return { ok: false, error: "invalid" };

  // Charge the same saved card the base order used.
  const pi = await stripe().paymentIntents.retrieve(order.stripe_payment_intent_id as string);
  const pm = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
  if (!order.stripe_customer_id || !pm) return { ok: false, error: "invalid" };

  const result = await fulfilOffer({
    order: { id: order.id, stripeCustomerId: order.stripe_customer_id as string },
    offer,
    paymentMethodId: pm,
  });
  await grantOfferOwnership(order.store_id as string, userId, offer, "oto", result.subscriptionId ?? null, {
    email: order.email as string,
    stripeCustomerId: order.stripe_customer_id as string,
  });
  await db.from("order_items").insert({
    store_id: order.store_id,
    order_id: order.id,
    kind: "oto",
    offer_id: offer.id,
    description: offer.name,
    amount_cents: immediateChargeCents(offer),
    stripe_subscription_id: result.subscriptionId ?? null,
    stripe_payment_intent_id: result.paymentIntentId ?? null,
  });
  return { ok: true };
}
