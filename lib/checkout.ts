import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getProductBySlug, getOffer } from "@/lib/store";
import { isOfferEligible, shouldShowOffer, immediateChargeCents, type Ownership } from "@/lib/offers";
import { signOtoToken, verifyOtoToken } from "@/lib/oto-token";
import { notifyAppEntitlement } from "@/lib/apps";
import { trackPurchase } from "@/lib/tracking";
import { sendEmail, buildWelcomeEmail, buildReceiptEmail } from "@/lib/email";
import {
  TAX_ENABLED,
  calculateTax,
  needsTaxLocation,
  normalizeCountry,
  recordTaxTransaction,
} from "@/lib/tax";
import { stripe, stripeMode } from "@/lib/stripe";
import { otoSigningSecret } from "@/lib/env";
import { ensureUserProfile } from "@/lib/users";
import { applyPendingEntitlements } from "@/lib/app-sync";
import { sendCrmEvent, type CrmItem } from "@/lib/crm";
import { LEGAL } from "@/lib/legal";
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
  // Credentials are only for a NEW buyer signing up at checkout. A member who
  // is already signed in sends none of these.
  email?: string;
  username?: string;
  password?: string;
  // Set from the session by the action layer — NEVER from the client payload,
  // or a caller could buy in someone else's name.
  existingUserId?: string | null;
  bumpTaken: boolean;
  anonId?: string | null; // attribution visitor cookie, read by the action layer
  country?: string | null; // ISO-2, required when Stripe Tax is enabled
  trackingConsent?: boolean; // GDPR opt-in, read from the cookie by the action layer
};

export type CheckoutResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; code?: "account_exists" | "already_owned" | "bump_unavailable" };

const normEmail = (e: string) => e.trim().toLowerCase();

// One Stripe customer per member, reused across purchases. Without this a
// returning buyer accumulates a customer per order, scattering their saved
// cards so off-session fulfilment can't find the card they actually use.
export async function customerForUser(
  userId: string,
  email: string,
  storeId: string,
): Promise<string> {
  const db = createServiceClient();
  const { data: prior } = await db
    .from("orders")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prior?.stripe_customer_id) return prior.stripe_customer_id as string;

  const customer = await stripe().customers.create(
    { email, metadata: { storeId, userId } },
    // One customer per user even under a double submit.
    { idempotencyKey: `customer_${userId}` },
  );
  return customer.id;
}

// What a user currently HOLDS — drives offer eligibility everywhere.
//
// Cancelled rows are excluded on purpose. A cancellation keeps the ownership row
// and only flips its status (see syncSubscriptionOwnership and
// revokeOwnershipForPaymentIntent), so counting rows by existence meant a lapsed
// subscriber had no access AND could never be offered the subscription again —
// on any product, in the library, forever. That matches hasAccess() in
// lib/subscription-sync.ts; the status is filtered in SQL rather than importing
// it, because that module imports app-sync which imports this one.
//
// Errors throw rather than returning empty. This set decides whether an offer is
// shown and whether someone is charged, so a failed query must not read as
// "owns nothing" and quietly re-offer something already held.
export async function ownershipFor(userId: string): Promise<Ownership> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("ownership")
    .select("product_id, app_id")
    .eq("user_id", userId)
    .neq("status", "canceled");
  if (error) throw new Error(`ownershipFor: ${error.message}`);
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

  const product = await getProductBySlug(input.productSlug);
  if (!product || product.status !== "published") return { ok: false, error: "Product not available" };

  let userId: string;
  let email: string;

  if (input.existingUserId) {
    // Already signed in: no account to create, and nothing to ask them for.
    // ensureUserProfile also backfills members who authenticate but have no
    // profile row (created outside checkout) — otherwise they'd be told their
    // account doesn't exist while looking at their own email on screen.
    const profile = await ensureUserProfile(input.existingUserId);
    if (!profile) return { ok: false, error: "Account not found — please log in again." };
    userId = profile.id;
    email = profile.email;

    // Don't let a member pay twice for something they already have.
    const already = await ownershipFor(userId);
    if (already.productIds.has(product.id)) {
      return { ok: false, error: "You already own this.", code: "already_owned" };
    }
  } else {
    if (!input.email || !input.username || !input.password) {
      return { ok: false, error: "Enter your details to create an account." };
    }
    email = normEmail(input.email);
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
    userId = created.data.user.id;

    const { error: profileErr } = await db.from("users").insert({
      id: userId,
      store_id: storeId,
      email,
      username: input.username,
    });
    if (profileErr) return { ok: false, error: `profile: ${profileErr.message}` };

    // They may already subscribe to a connected app directly. Claim anything an
    // app reported for this email BEFORE bump eligibility is computed below, or
    // we would offer them what they already pay for.
    await applyPendingEntitlements(userId, email);
  }

  // Resolve the bump. shouldShowOffer is the same gate the checkout page uses
  // to decide whether to render it, so display and fulfilment cannot disagree —
  // previously this checked eligibility but NOT offer.active, leaving a
  // withdrawn offer chargeable from a stale page or a replayed POST.
  const owned = await ownershipFor(userId);
  let bumpOffer: Offer | null = null;
  if (input.bumpTaken && product.bumpOfferId) {
    const offer = await getOffer(product.bumpOfferId);
    if (offer && shouldShowOffer(offer, owned)) {
      bumpOffer = offer;
    } else {
      // Refuse rather than drop it silently. An anonymous buyer whose email
      // already carries the entitlement is shown the bump (we can't know before
      // they type it), and quietly discarding it charged them for the base
      // product while ignoring what they ticked — no error, nothing on the
      // receipt. This happens before any card is charged.
      return {
        ok: false,
        error:
          "You already have the add-on you selected, so it can't be added again. Untick it to continue.",
        code: "bump_unavailable",
      };
    }
  }

  const customerId = await customerForUser(userId, email, storeId);

  // VAT for EU/UK digital sales is charged at the buyer's country rate, so the
  // amount charged is price + calculated tax. Returns zero tax (and behaves
  // exactly as before) when tax is disabled or no country is known.
  const country = normalizeCountry(input.country);
  if (needsTaxLocation(TAX_ENABLED, country)) {
    return { ok: false, error: "Please select your country so we can calculate tax." };
  }
  const tax = await calculateTax({
    priceCents: product.priceCents,
    currency: product.currency,
    country,
    reference: `${product.slug}-${userId}`,
  });

  // Base PaymentIntent — saves the card for off-session offer fulfilment.
  //
  // description and the readable metadata below are not decoration. This Stripe
  // account is shared with the connected apps, so a charge with a blank
  // description and none but uuid metadata is indistinguishable from theirs in
  // the dashboard, in exports, and — most importantly — in Zapier, which can
  // only filter on what Stripe sends it. store_created marks it as ours (the
  // subscription and bump charges already carry it); productSlug and
  // productTitle make it routable without a lookup against our database.
  //
  // Written at charge time and effectively not backfillable, so it has to be
  // right before the first live charge, not after.
  const pi = await stripe().paymentIntents.create({
    amount: tax.totalCents,
    currency: product.currency,
    customer: customerId,
    setup_future_usage: "off_session",
    automatic_payment_methods: { enabled: true },
    description: `${product.title} — ${LEGAL.storeName}`,
    metadata: {
      store_created: "true",
      storeId,
      userId,
      productId: product.id,
      productSlug: product.slug,
      productTitle: product.title,
      bumpOfferId: bumpOffer?.id ?? "",
      taxCalculationId: tax.calculationId ?? "",
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
      total_cents: tax.totalCents,
      tax_cents: tax.taxCents,
      buyer_country: country,
      stripe_tax_calculation_id: tax.calculationId,
      tracking_consent: input.trackingConsent === true,
      stripe_customer_id: customerId,
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
  // Override for flows where the order row itself is created per attempt (the
  // standalone offer checkout mints a fresh $0 order each visit). Keying on the
  // SetupIntent instead makes Stripe dedupe the subscription even if two orders
  // exist, which the default order-derived key could not do.
  idempotencyKey?: string;
}): Promise<{ subscriptionId?: string; paymentIntentId?: string }> {
  const { order, offer, paymentMethodId } = args;
  const idem = args.idempotencyKey ?? `fulfil_${order.id}_${offer.id}`;

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
        // offerName rides along for the same reason as the base charge: Zapier
        // and the dashboard can only filter on what Stripe holds.
        description: `${offer.name} — ${LEGAL.storeName}`,
        metadata: {
          store_created: "true",
          orderId: order.id,
          offerId: offer.id,
          offerName: offer.name,
        },
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
      description: `${offer.name} — ${LEGAL.storeName}`,
      metadata: {
        store_created: "true",
        orderId: order.id,
        offerId: offer.id,
        offerName: offer.name,
      },
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
    .select(
      "id, store_id, user_id, status, stripe_customer_id, email, visitor_id, tracking_consent, stripe_tax_calculation_id, tax_cents",
    )
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
    // A deactivated offer must not be fulfilled even though the PaymentIntent
    // still carries its id: an admin may have withdrawn it between intent
    // creation and confirmation.
    if (offer?.active) {
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

  // Record the sale against its tax calculation so it appears in Stripe's tax
  // reporting. Never throws — a reporting failure must not undo a paid order.
  if (order.stripe_tax_calculation_id) {
    await recordTaxTransaction(order.stripe_tax_calculation_id as string, order.id as string);
  }

  // Welcome + receipt. Without these the buyer has an account they were never
  // told about, and no proof of purchase. Sent before the consent gate below
  // because transactional email is contractual, not marketing — it does not
  // require tracking consent.
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://grow.greaterinside.com";
    const { data: items } = await db
      .from("order_items")
      .select("description, amount_cents")
      .eq("order_id", order.id);
    const lines = (items ?? []).map((i) => ({
      description: i.description as string,
      amountCents: (i.amount_cents as number) ?? 0,
    }));
    const to = order.email as string;

    await sendEmail(
      to,
      buildWelcomeEmail({
        email: to,
        productTitle: lines[0]?.description ?? "your purchase",
        siteUrl: site,
      }),
    );
    await sendEmail(
      to,
      buildReceiptEmail({
        email: to,
        orderId: order.id as string,
        lines,
        totalCents: pi.amount,
        taxCents: (order.tax_cents as number) ?? 0,
        currency: pi.currency,
      }),
    );
  } catch (e) {
    console.error("[finalizeOrder] email failed (order is still complete):", e);
  }

  // CRM feed: ONE event carrying the whole purchase — base and bump together,
  // with the slug and the trial flag. Deliberately above the consent gate: this
  // is customer servicing, the same category as the receipt just sent, not ad
  // measurement. See lib/crm.ts.
  try {
    const { data: crmItems } = await db
      .from("order_items")
      .select("kind, description, amount_cents, stripe_subscription_id, product_id, offer_id")
      .eq("order_id", order.id);
    const rows = crmItems ?? [];
    // Always `purchase` — money moved. A trial bump rides along as a flag
    // rather than replacing the type, because the buyer both bought the product
    // AND started a trial, and typing it as only the latter drops the customer
    // tag entirely.
    const trial = rows.some((i) => i.stripe_subscription_id && (i.amount_cents as number) === 0);
    await sendCrmEvent({
      type: "purchase",
      trialStarted: trial,
      email: order.email as string,
      occurredAt: Math.floor(Date.now() / 1000),
      orderId: order.id as string,
      productId: (pi.metadata.productId as string) || null,
      productSlug: pi.metadata.productSlug ?? null,
      totalCents: pi.amount,
      currency: pi.currency,
      items: rows.map((i) => ({
        kind: (i.kind as CrmItem["kind"]) ?? "product",
        description: i.description as string,
        amountCents: (i.amount_cents as number) ?? 0,
        // product_id/offer_id come off the row itself rather than the
        // PaymentIntent, so an order carrying more than one item still
        // identifies each of them correctly.
        productId: (i.product_id as string) ?? null,
        productSlug: i.kind === "product" ? (pi.metadata.productSlug ?? null) : null,
        offerId: (i.offer_id as string) ?? null,
      })),
    });
  } catch (e) {
    console.error("[finalizeOrder] crm failed (order is still complete):", e);
  }

  // Report the conversion server-side — ONLY with the buyer's explicit consent,
  // captured at checkout (the webhook has no cookies). EU/UK traffic means GDPR
  // applies, and hashed email plus click ids are still personal data.
  if (order.tracking_consent !== true) return;

  // Guarded so a tracking outage can never fail a paid order — finalizeOrder has
  // already committed everything above. The PaymentIntent id doubles as the dedup
  // event_id: the browser pixel (when added) sends the same value, and
  // finalizeOrder is idempotent, so a webhook + thank-you double-call cannot
  // double-count a conversion.
  try {
    const { data: visitor } = order.visitor_id
      ? await db.from("visitors").select("click_ids").eq("id", order.visitor_id).maybeSingle()
      : { data: null };
    await trackPurchase({
      eventId: paymentIntentId,
      eventName: "Purchase",
      email: order.email as string,
      valueCents: pi.amount,
      currency: pi.currency,
      orderId: order.id as string,
      clickIds: (visitor?.click_ids as Record<string, string>) ?? {},
      occurredAt: Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    console.error("[finalizeOrder] tracking failed (order is still complete):", e);
  }
}

export async function grantOfferOwnership(
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
    const status = trialing ? "trialing" : "active";
    const { error } = await db.from("ownership").insert({
      store_id: storeId,
      user_id: userId,
      app_id: offer.grantAppId,
      offer_id: offer.id,
      source,
      stripe_subscription_id: subscriptionId,
      status,
    });
    // 23505 means a row for this (store, user, app) already exists. It is NOT
    // simply a duplicate to ignore: a returning subscriber's old row is still
    // there marked `canceled`, and now that cancelled rows no longer count as
    // owned, they can buy again — so the row must be revived. Swallowing the
    // conflict would leave them paid up with status `canceled` and no access.
    if (error?.code === "23505") {
      const { error: reviveErr } = await db
        .from("ownership")
        .update({
          offer_id: offer.id,
          source,
          stripe_subscription_id: subscriptionId,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("store_id", storeId)
        .eq("user_id", userId)
        .eq("app_id", offer.grantAppId);
      if (reviveErr) throw new Error(`grant offer (app revive): ${reviveErr.message}`);
    } else if (error) {
      throw new Error(`grant offer (app): ${error.message}`);
    }

    // Provision the connected app (best-effort, server-to-server). A failure
    // here never breaks the purchase — the handoff re-provisions on first open.
    if (ctx) {
      await notifyAppEntitlement({
        appId: offer.grantAppId,
        email: ctx.email,
        entitlementKey: offer.grantEntitlementKey,
        status: trialing ? "trialing" : "active",
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
    // Same reasoning as the subscription branch: a re-purchase after a refund
    // that only flipped the status must end up active, not left cancelled.
    if (error?.code === "23505") {
      const { error: reviveErr } = await db
        .from("ownership")
        .update({ offer_id: offer.id, source, status: "active", updated_at: new Date().toISOString() })
        .eq("store_id", storeId)
        .eq("user_id", userId)
        .eq("product_id", offer.grantProductId);
      if (reviveErr) throw new Error(`grant offer (product revive): ${reviveErr.message}`);
    } else if (error) {
      throw new Error(`grant offer (product): ${error.message}`);
    }
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

  // Same gate as the checkout bump: withdrawn, or already held, means no offer.
  const offer = await getOffer(prod.upsell_offer_id as string);
  const owned = await ownershipFor(userId);
  if (!offer || !shouldShowOffer(offer, owned)) return null;

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

// The card we can charge off-session for this customer. Prefers the one Stripe
// treats as default, falling back to the most recently attached card.
//
// Deliberately asks Stripe rather than re-reading the PaymentMethod off an old
// PaymentIntent: a buyer who started via the standalone offer checkout has a
// saved card but no PaymentIntent at all, and anyone who has since updated
// their card in the billing portal would otherwise be charged on the stale one.
// Returns null rather than throwing when Stripe can't answer (deleted customer,
// API trouble): "we could not find a card to charge" is the same outcome for
// every caller, and this runs before their charge guard — throwing here would
// escape it and 500 the page.
export async function savedPaymentMethodFor(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe().customers.retrieve(customerId);
    if (!customer.deleted) {
      const dflt = customer.invoice_settings?.default_payment_method;
      if (dflt) return typeof dflt === "string" ? dflt : dflt.id;
    }
    const cards = await stripe().paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
    return cards.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

// Accept a standing offer from the library (buyer who declined the OTO). Uses
// the card on file. Eligibility is re-checked, so it can't grant something
// already owned.
export async function acceptStandingOffer(
  userId: string,
  offerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const offer = await getOffer(offerId);
  if (!offer) return { ok: false, error: "unavailable" };
  const owned = await ownershipFor(userId);
  // Distinguish the two reasons so the library can say which one it is.
  if (!offer.active) return { ok: false, error: "unavailable" };
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
  // A customer is enough — a buyer whose only order is a $0 trial start has a
  // saved card but no PaymentIntent behind it.
  if (!order?.stripe_customer_id) return { ok: false, error: "no_saved_card" };

  const pm = await savedPaymentMethodFor(order.stripe_customer_id as string);
  if (!pm) return { ok: false, error: "no_saved_card" };

  // A saved card can decline off-session, and an expired/removed Stripe
  // customer 404s. Both are ordinary outcomes of pressing this button, not
  // crashes — let them through and the server action 500s with nothing on
  // screen. Grant and order_items stay outside: they must only run on success.
  let result: { subscriptionId?: string; paymentIntentId?: string };
  try {
    result = await fulfilOffer({
      order: { id: order.id as string, stripeCustomerId: order.stripe_customer_id as string },
      offer,
      paymentMethodId: pm,
    });
  } catch {
    return { ok: false, error: "charge_failed" };
  }

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

export type OtoAcceptResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "expired" | "used" | "charge_failed" };

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

  // The token is already claimed above — that is the replay guard, and it must
  // happen before charging so two concurrent accepts cannot both charge. But an
  // off-session charge genuinely fails sometimes (that is why dunning exists),
  // and burning the buyer's one-time offer on a declined card loses the sale for
  // good. So: release the claim if the charge fails, letting them retry.
  let result: { subscriptionId?: string; paymentIntentId?: string };
  try {
    result = await fulfilOffer({
      order: { id: order.id, stripeCustomerId: order.stripe_customer_id as string },
      offer,
      paymentMethodId: pm,
    });
  } catch {
    await db
      .from("oto_tokens")
      .update({ status: "pending", consumed_at: null })
      .eq("token_hash", sha256(token));
    return { ok: false, error: "charge_failed" };
  }

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
