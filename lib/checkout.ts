import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getStoreName, getProductBySlug, getProductById, getOffer } from "@/lib/store";
import { isOfferEligible, shouldShowOffer, immediateChargeCents, offerAtPrice, offerForChoice, offerWithCouponTrial, type Ownership } from "@/lib/offers";
import { priceForChoice, shownPrices, type OfferPrice } from "@/lib/offer-prices";
import type { BumpChoice } from "@/lib/bump";
import { offerAsSoldTo, recordTrialStart } from "@/lib/trial-history";
import { signOtoToken, verifyOtoToken } from "@/lib/oto-token";
import { trackPurchase, trackServerEvent } from "@/lib/tracking";
import { customEventIdFor } from "@/lib/analytics/events";
import { eventIdFor } from "@/lib/analytics/events";
import { trialWorthFor, adEventForOrder } from "@/lib/tracking-receipt";
import { sendEmail, buildWelcomeEmail, buildReceiptEmail } from "@/lib/email";
import { getSettingsOrDefaults } from "@/lib/settings";
import {
  TAX_ENABLED,
  calculateTax,
  needsTaxLocation,
  normalizeCountry,
  recordTaxTransaction,
} from "@/lib/tax";
import { COUNTRY_REQUIRED } from "@/components/checkout/checkout-types";
import { stripe, stripeMode } from "@/lib/stripe";
import { otoSigningSecret } from "@/lib/env";
import { ensureUserProfile } from "@/lib/users";
import { applyPendingEntitlements, pushAppEntitlement } from "@/lib/app-sync";
import { sendCrmEvent, type CrmItem } from "@/lib/crm";
import { MIN_CHARGE_CENTS, resolveCoupon, type AppliedCoupon } from "@/lib/coupons";
import { ensureStripeProductForProduct, ensureStripeProduct } from "@/lib/stripe-catalog";
import { livePrices, chargeNowCents as chargeNowFor } from "@/lib/offer-prices";
import { tagLifecycle, tagPurchase } from "@/lib/ac-tags";
import { markLeadConverted } from "@/lib/leads";
import { recordError } from "@/lib/errors";
import type { Offer } from "@/lib/types";

const OTO_TTL_SECONDS = 15 * 60; // 15 minutes
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Stripe product identity lives in lib/stripe-catalog.ts — coupons need it too.
// Money path. Base product = one PaymentIntent (card saved off_session). Bump
// is fulfilled SEPARATELY via fulfilOffer on the saved card — one-time charge
// or trial subscription. finalizeOrder is idempotent and is the single path
// both the thank-you confirm and (later) the Stripe webhook call.

export type CheckoutInput = {
  productSlug: string;
  // Credentials are only for a NEW buyer signing up at checkout. A member who
  // is already signed in sends none of these.
  email?: string;
  fullName?: string;
  /** Stripe promotion code. Validated server-side; the amount is never trusted. */
  couponCode?: string | null;
  // Set from the session by the action layer — NEVER from the client payload,
  // or a caller could buy in someone else's name.
  existingUserId?: string | null;
  /**
   * Which of the bump's prices was taken.
   *
   * A side, not an id. The alternative is resolved from the bump offer's own
   * alt_offer_id, so a tampered post can pick the second price it was shown
   * and nothing else.
   */
  bumpChoice: BumpChoice;
  /**
   * Whether the bump the buyer saw advertised a free trial.
   *
   * Only ever used to REFUSE. A page rendered for someone we did not yet know
   * may promise a trial they have already used; charging them anyway would be
   * the deception this feature exists to avoid.
   */
  bumpTrialShown?: boolean;
  /**
   * Which way to buy the product itself — an INDEX into the list its page
   * showed, never an id and never an amount.
   *
   * The server rebuilds that list from the product's own rows and takes the
   * index from it, so the only thing a tampered post can buy is something it
   * was actually shown. Out of range refuses rather than falling back to the
   * headline price. Undefined means the headline price, which is what every
   * product with one way to buy sends.
   */
  priceChoice?: number;
  anonId?: string | null; // attribution visitor cookie, read by the action layer
  country?: string | null; // ISO-2, required when Stripe Tax is enabled
  trackingConsent?: boolean; // GDPR opt-in, read from the cookie by the action layer
  /**
   * The buyer's own request, for ad-platform match quality.
   *
   * Captured by the action layer because this is the only moment the request
   * belongs to the buyer — finalizeOrder also runs from Stripe's webhook, where
   * the address on the request is Stripe's. Null without tracking consent.
   */
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
};

export type CheckoutResult =
  /**
   * `mode` says which Stripe object the browser must confirm.
   *
   * "payment" is a charge today; "setup" saves the card and the subscription
   * bills on its own schedule, which is the only shape that works when a trial
   * means nothing is due today. Confirming the wrong one fails with a message
   * about a client secret, so the client is told rather than left to guess.
   */
  | { ok: true; clientSecret: string; mode: "payment" | "setup" }
  | { ok: false; error: string; code?: "already_owned" | "bump_unavailable" | "bump_trial_used" };

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
    .select("product_id, app_id, offer_id")
    .eq("user_id", userId)
    .neq("status", "canceled");
  if (error) throw new Error(`ownershipFor: ${error.message}`);
  const productIds = new Set<string>();
  const appIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.product_id) productIds.add(row.product_id as string);
    if (row.app_id) appIds.add(row.app_id as string);
  }

  // Which CHANNELS of each app they hold, resolved through the offer that
  // granted each row. One app is sold as three subscriptions, so the app id on
  // its own says "Content Engine" where the question is "Instagram or
  // LinkedIn?". Costs one extra query, and only when an app row has an offer.
  const appChannels = new Map<string, Set<string>>();
  const appRows = (data ?? []).filter((r) => r.app_id && r.offer_id);
  const offerIds = [...new Set(appRows.map((r) => r.offer_id as string))];
  if (offerIds.length > 0) {
    const { data: offers, error: offerErr } = await db
      .from("offers")
      .select("id, grant_channels")
      .in("id", offerIds);
    // Same reasoning as above: a failed read must not read as "holds nothing",
    // which here would re-sell a channel they already pay for.
    if (offerErr) throw new Error(`ownershipFor (channels): ${offerErr.message}`);
    const byOffer = new Map(
      (offers ?? []).map((o) => [o.id as string, (o.grant_channels as string[] | null) ?? []]),
    );
    for (const row of appRows) {
      const channels = byOffer.get(row.offer_id as string) ?? [];
      if (channels.length === 0) continue;
      const held = appChannels.get(row.app_id as string) ?? new Set<string>();
      for (const c of channels) held.add(c);
      appChannels.set(row.app_id as string, held);
    }
  }
  return { productIds, appIds, appChannels };
}

/** The attribution visitor captured on landing, if there is one. */
async function visitorFor(
  db: ReturnType<typeof createServiceClient>,
  storeId: string,
  anonId: string | null | undefined,
): Promise<string | null> {
  if (!anonId) return null;
  const { data } = await db
    .from("visitors")
    .select("id")
    .eq("store_id", storeId)
    .eq("anon_id", anonId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * Who is buying — found, or created on the spot.
 *
 * Both checkouts need this and both used to do it their own way: the product
 * checkout created accounts inline, and the offer checkout refused anybody who
 * did not already have one. That refusal is what put a login wall in front of
 * every public offer sales page.
 *
 * One implementation, so "an account with this email exists" and "no password
 * is set at checkout" are decided once. A buyer signing up here never invents a
 * password: asking for one mid-purchase adds two fields to the highest-friction
 * screen in the store, and they overwhelmingly forget it before they return.
 * They sign in with a link, and can set a password later from /reset.
 */
export async function resolveBuyer(input: {
  existingUserId?: string | null;
  email?: string;
  fullName?: string;
}): Promise<
  | { ok: true; userId: string; email: string; isNew: boolean }
  | { ok: false; error: string }
> {
  const db = createServiceClient();
  const storeId = await getStoreId();

  if (input.existingUserId) {
    // Already signed in: no account to create, and nothing to ask them for.
    // ensureUserProfile also backfills members who authenticate but have no
    // profile row (created outside checkout) — otherwise they'd be told their
    // account doesn't exist while looking at their own email on screen.
    const profile = await ensureUserProfile(input.existingUserId);
    if (!profile) return { ok: false, error: "Account not found — please log in again." };
    return { ok: true, userId: profile.id, email: profile.email, isNew: false };
  }

  if (!input.email || !input.fullName) {
    return { ok: false, error: "Enter your name and email to continue." };
  }
  const email = normEmail(input.email);

  // Signup at checkout — auto-confirmed; they are paying, so the address is
  // already proven by the card.
  const created = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "Could not create account";
    if (!/already|exists|registered/i.test(msg)) return { ok: false, error: msg };

    // An account with this address already exists — so use it.
    //
    // Nobody is turned away at the payment step any more. The account is
    // created BEFORE the card is charged, so a decline or a closed tab leaves
    // one behind owning nothing, and "an account with this email exists,
    // please log in" sent that buyer to a login for an account with no
    // password and nothing in it. A dead end caused by their own first attempt
    // failing, at the worst possible moment.
    //
    // Buying twice is now allowed too, and is a bookkeeping question rather
    // than something to stop somebody paying over. Nothing is emailed on
    // account creation alone, so an account nobody completed a purchase on
    // stays invisible to the person it belongs to.
    //
    // What does NOT follow is a session. See the sign-in guard below: a
    // purchase made against an address whose account already existed must
    // never hand out a login for it, or paying $19 under somebody else's
    // address would be a way into their library.
    const existing = await userIdForEmail(email);
    if (existing) return { ok: true, userId: existing, email, isNew: false };
    return { ok: false, error: "Could not create account" };
  }
  const userId = created.data.user.id;

  // `username` is the display-name column — no uniqueness constraint, and it
  // has always been "whatever we should call this person".
  const { error: profileErr } = await db.from("users").insert({
    id: userId,
    store_id: storeId,
    email,
    username: input.fullName,
  });
  if (profileErr) return { ok: false, error: `profile: ${profileErr.message}` };

  // They may already subscribe to a connected app directly. Claim anything an
  // app reported for this email before anything else reads their ownership.
  await applyPendingEntitlements(userId, email);

  return { ok: true, userId, email, isNew: true };
}

/** The account behind an address, whatever state it is in. */
async function userIdForEmail(email: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("users").select("id").eq("email", email).maybeSingle();
  return (data?.id as string) ?? null;
}

export async function createCheckoutIntent(input: CheckoutInput): Promise<CheckoutResult> {
  const db = createServiceClient();
  const storeId = await getStoreId();

  const product = await getProductBySlug(input.productSlug);
  if (!product || product.status !== "published") return { ok: false, error: "Product not available" };

  // Who is buying, and an account for them if they are new.
  //
  // Shared with the offer checkout — see resolveBuyer. Two checkouts each
  // creating accounts their own way is two places to get "an account already
  // exists" wrong, and only one of them would ever get fixed.
  const buyer = await resolveBuyer({
    existingUserId: input.existingUserId,
    email: input.email,
    fullName: input.fullName,
  });
  if (!buyer.ok) return buyer;
  const { userId, email } = buyer;
  // Whether THIS checkout created the account, carried on the intent so the
  // return trip can decide whether it may hand out a session. Written by us,
  // read by us — the same way the price id travels.
  const newAccount = buyer.isNew ? "true" : "false";

  // Don't let a member pay twice for something they already have. Product
  // specific, so it stays here rather than travelling with the buyer.
  if (input.existingUserId) {
    const already = await ownershipFor(userId);
    if (already.productIds.has(product.id)) {
      return { ok: false, error: "You already own this.", code: "already_owned" };
    }
  }

  // Resolve the bump. shouldShowOffer is the same gate the checkout page uses
  // to decide whether to render it, so display and fulfilment cannot disagree —
  // previously this checked eligibility but NOT offer.active, leaving a
  // withdrawn offer chargeable from a stale page or a replayed POST.
  const owned = await ownershipFor(userId);
  let bumpOffer: Offer | null = null;
  if (input.bumpChoice !== "none" && product.bumpOfferId) {
    const shown = await getOffer(product.bumpOfferId);
    // The options come from THIS product, not from the request — the same offer
    // may be sold at three prices here and one price elsewhere. The browser
    // sends an INDEX into the list the server built, never an id, so the only
    // thing a tampered request can pick is something it was already shown.
    const options = shown ? shownPrices(shown.prices, product.bumpPriceIds ?? []) : [];
    let picked: Offer | null = null;
    if (typeof input.bumpChoice === "number") {
      const price = priceForChoice(options, input.bumpChoice);
      // Out of range REFUSES rather than falling back to the headline price.
      // Charging somebody for a thing they did not choose is the failure this
      // whole rule exists to prevent.
      if (!price || !shown) {
        return {
          ok: false,
          error: "That add-on option is no longer available. Choose another and try again.",
          code: "bump_unavailable",
        };
      }
      picked = offerAtPrice(shown, price);
    } else {
      // The old two-offer pairing, while placements are still on it. Removed
      // with products.bump_alt_offer_id once they have all been moved.
      const alt = product.bumpAltOfferId ? await getOffer(product.bumpAltOfferId) : null;
      const wantId = shown
        ? offerForChoice(shown, alt, input.bumpChoice === "alt" ? "alt" : undefined)
        : null;
      picked = wantId === shown?.id ? shown : wantId === alt?.id ? alt : null;
    }
    // A free trial is a thing you get once. Resolved before anything is
    // charged, so the subscription, the amount taken today, the ownership
    // status and the CRM tags all follow the same decision.
    const offer = picked ? await offerAsSoldTo(email, picked) : null;
    // Shown one thing, charged another, is worse than the abuse it prevents.
    // The page tells us what it displayed; a client that lies about this can
    // only cause a refusal or a trial we had already decided to give.
    if (offer && picked?.trialDays && !offer.trialDays && input.bumpTrialShown) {
      return {
        ok: false,
        error:
          "The free trial for that add-on has already been used on this email, so it would start today at full price. Untick it to continue, or add it from your library afterwards.",
        code: "bump_trial_used",
      };
    }
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

  // Which way to buy, rebuilt here from the product's own rows.
  //
  // The browser sends an INDEX into the list its page drew; this list is built
  // from the database, so the only thing a tampered post can buy is something
  // it was shown. Out of range refuses — falling back to the headline price
  // would charge somebody for an option they did not choose.
  const ways = livePrices(product.prices);
  const chosen =
    input.priceChoice === undefined ? (ways[0] ?? null) : (ways[input.priceChoice] ?? null);
  if (input.priceChoice !== undefined && !chosen) {
    return { ok: false, error: "That option is no longer available." };
  }

  // VAT for EU/UK digital sales is charged at the buyer's country rate, so the
  // amount charged is price + calculated tax. Returns zero tax (and behaves
  // exactly as before) when tax is disabled or no country is known.
  const country = normalizeCountry(input.country);
  if (needsTaxLocation(TAX_ENABLED, country)) {
    return { ok: false, error: COUNTRY_REQUIRED };
  }
  // Coupon is re-resolved here from the code alone, never taken as an amount
  // from the browser. The client's preview is for display; this is the number
  // that gets charged, and the two are computed by the same function so they
  // cannot disagree.
  // Priced against the way they chose, not the headline. A coupon resolved
  // against $49 and applied to a $9 monthly would take more off than the price.
  const listCents = chosen?.priceCents ?? product.priceCents;
  const recurring = chosen?.billingType === "recurring";

  let coupon: AppliedCoupon | null = null;
  if (input.couponCode?.trim()) {
    const res = await resolveCoupon(input.couponCode, listCents, product.currency, {
      item: product.slug,
      interval: recurring ? (chosen?.interval ?? null) : null,
    });
    if (!res.ok) return { ok: false, error: res.error };
    coupon = res.coupon;
  }
  const payableCents = listCents - (coupon?.discountCents ?? 0);

  // A subscription, so nothing is charged here.
  //
  // A trial takes nothing today and a $0 PaymentIntent is not a thing Stripe
  // will make, so the card is SAVED and the subscription bills on its own
  // schedule — the same shape the offer checkout has always used. Tax is
  // Stripe's `automatic_tax` on the subscription rather than a calculation of
  // ours: an invoice Stripe raises monthly has to carry a rate Stripe worked
  // out, or the two disagree from the second month onwards.
  if (recurring && chosen) {
    const si = await stripe().setupIntents.create({
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
      description: `${product.title} — ${await getStoreName()}`,
      metadata: {
        store_created: "true",
        storeId,
        userId,
        productId: product.id,
        productSlug: product.slug,
        productTitle: product.title,
        // The price id is written by US, from a list we rebuilt — never copied
        // out of the request — so finalize charges the option they were shown.
        productPriceId: chosen.id,
        couponCode: coupon?.code ?? "",
        bumpOfferId: bumpOffer?.id ?? "",
        country: country ?? "",
        newAccount,
      },
    });
    if (!si.client_secret) return { ok: false, error: "No client secret" };

    const visitor = await visitorFor(db, storeId, input.anonId);
    const { error: orderErr } = await db.from("orders").insert({
      // Which Stripe mode this was made in. Without it a test purchase is a
      // real paid row nobody can tell from a real one — which is exactly how
      // two of them ended up counting towards revenue.
      livemode: stripeMode() === "live",
      store_id: storeId,
      user_id: userId,
      email,
      status: "pending",
      currency: product.currency,
      // What today costs. A trial is genuinely a $0 order; without one the
      // first invoice is raised by Stripe the moment the subscription starts,
      // and finalize writes back what it actually came to.
      subtotal_cents: listCents,
      total_cents: chargeNowFor(chosen),
      coupon_code: coupon?.code ?? null,
      discount_cents: coupon?.discountCents ?? 0,
      tax_cents: 0,
      buyer_country: country,
      tracking_consent: input.trackingConsent === true,
      client_ip: input.clientIp ?? null,
      client_user_agent: input.userAgent ?? null,
      source_url: input.sourceUrl ?? null,
      stripe_customer_id: customerId,
      stripe_setup_intent_id: si.id,
      visitor_id: visitor,
    });
    if (orderErr) return { ok: false, error: `order: ${orderErr.message}` };
    return { ok: true, clientSecret: si.client_secret, mode: "setup" };
  }

  // A one-time bump is charged HERE, with the product, not afterwards.
  //
  // It used to be a second, off-session charge on the saved card once the
  // first had settled. Two things wrong with that, one of them fatal:
  //
  //   Stripe refuses an off-session card payment on a card issued in India
  //   without an RBI e-mandate. So the product was charged, the add-on was
  //   not, and the buyer got what they paid for minus the thing they ticked.
  //
  //   And the page had already said "Total today $11.50" while the payment
  //   authorised $0.50 — the figure somebody agreed to and the figure their
  //   card saw were never the same number.
  //
  // One charge, on-session, for the amount on the button. No mandate is
  // needed for a payment the cardholder is present for, and it is the same
  // total either way.
  //
  // A RECURRING bump is untouched: it takes nothing today, so there is
  // nothing to fold in, and its subscription bills on its own terms.
  const bumpNowCents =
    bumpOffer && bumpOffer.billingType === "one_time" ? immediateChargeCents(bumpOffer) : 0;

  const tax = await calculateTax({
    priceCents: payableCents + bumpNowCents,
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
    description: `${product.title} — ${await getStoreName()}`,
    metadata: {
      store_created: "true",
      storeId,
      userId,
      productId: product.id,
      productSlug: product.slug,
      productTitle: product.title,
      productPriceId: chosen?.id ?? "",
      couponCode: coupon?.code ?? "",
      discountCents: String(coupon?.discountCents ?? 0),
      bumpOfferId: bumpOffer?.id ?? "",
      // Resolved ONCE, here, from THIS product's placement (product.bumpPriceIds)
      // — bumpOffer is already priced at whatever the placement named, never the
      // bump's own headline. finalizeOrder has only the id by the time it runs
      // fulfilBump, so this is how the placement price survives to that call
      // instead of fulfilBump re-deriving the (possibly different) headline.
      //
      // Blank, not "0", for a RECURRING bump: bumpNowCents is 0 there because
      // nothing is charged TODAY (see the comment above it), not because the
      // placement priced it at zero — a recurring bump can still bill its
      // first period immediately, off-session, once fulfilled. Writing "0"
      // made that real charge book as a $0 order line: the read-back in
      // finalizeOrder tests string truthiness, and a truthy "0" stopped its
      // `?? immediateChargeCents(offer)` fallback from ever running. Same
      // guard shape as bumpPrepaid just below.
      bumpAmountCents: bumpNowCents > 0 ? String(bumpNowCents) : "",
      // Already paid for in THIS intent, so fulfilment grants it without
      // charging again. Written by us, read by us.
      //
      // Keyed on billingType, NOT on bumpNowCents > 0 — bumpNowCents is also 0
      // for a FREE one-time bump (nothing left to charge, but it IS fully
      // covered by this intent) and for a RECURRING one (nothing due today,
      // but it still needs its own subscription). Amount alone cannot tell
      // those apart; a free one-time bump read as not-prepaid took the
      // off_session, confirm: true path fulfilOffer falls through to below —
      // the exact India refusal this branch exists to delete.
      //
      // The offer checkout's own version of this line (offer-checkout.ts,
      // startOfferCheckout) is correctly just `bumpOffer ? "true" : ""` —
      // DO NOT "harmonise" the two. There, bumpOffer is never set unless it
      // resolved one-time (startOfferCheckout refuses the pairing outright
      // for a recurring bump), so the billingType check would be redundant.
      // Here, createCheckoutIntent places no such restriction — a product may
      // pair its bump slot with a recurring offer — so bumpOffer can genuinely
      // be recurring, and marking THAT prepaid would stop its subscription
      // ever being created.
      bumpPrepaid: bumpOffer && bumpOffer.billingType === "one_time" ? "true" : "",
      taxCalculationId: tax.calculationId ?? "",
      newAccount,
    },
  });

  // Attach the attribution visitor (captured on landing) to this order.
  const visitorId = await visitorFor(db, storeId, input.anonId);

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      // Which Stripe mode this was made in. Without it a test purchase is a
      // real paid row nobody can tell from a real one — which is exactly how
      // two of them ended up counting towards revenue.
      livemode: stripeMode() === "live",
      store_id: storeId,
      user_id: userId,
      email,
      status: "pending",
      currency: product.currency,
      // What was bought, add-on included — the order has to add up to what was
      // charged, and the charge now covers both.
      subtotal_cents: listCents + bumpNowCents,
      total_cents: tax.totalCents,
      coupon_code: coupon?.code ?? null,
      discount_cents: coupon?.discountCents ?? 0,
      tax_cents: tax.taxCents,
      buyer_country: country,
      stripe_tax_calculation_id: tax.calculationId,
      tracking_consent: input.trackingConsent === true,
      client_ip: input.clientIp ?? null,
      client_user_agent: input.userAgent ?? null,
      source_url: input.sourceUrl ?? null,
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
    product_price_id: chosen?.id ?? null,
    description: product.title,
    // What this line actually cost after the discount, not the list price —
    // the receipt and the CRM both read from here.
    amount_cents: payableCents,
  });

  if (!pi.client_secret) return { ok: false, error: "No client secret" };
  return { ok: true, clientSecret: pi.client_secret, mode: "payment" };
}

// Fulfil an offer on the customer's saved card. one-time -> off-session
// PaymentIntent; subscription -> Stripe Subscription (with trial). Idempotent
// via a deterministic idempotency key. Returns the created Stripe id.
/**
 * Note that a trial has been used up.
 *
 * After the subscription exists, never before: a call that failed granted
 * nothing, and burning someone's one free trial on a declined card would be
 * the worst possible way to lose a sale.
 */
async function noteTrial(orderId: string, offer: Offer): Promise<void> {
  if (!offer.trialDays || offer.trialDays <= 0) return;
  const db = createServiceClient();
  const { data } = await db.from("orders").select("email").eq("id", orderId).maybeSingle();
  if (data?.email) await recordTrialStart(data.email as string, offer);
}

/**
 * The order a PaymentIntent produced, if it produced one.
 *
 * The thank-you page is handed an intent id and needs the order to send the
 * welcome. Kept here rather than re-queried at the call site so there is one
 * place that knows how an order is joined to a payment.
 */
export async function orderIdForIntent(paymentIntentId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

export async function fulfilOffer(args: {
  order: { id: string; stripeCustomerId: string };
  offer: Offer;
  paymentMethodId: string;
  /**
   * A code the buyer typed, already resolved on the server.
   *
   * Applied two different ways because Stripe has two different mechanisms: a
   * subscription is handed the promotion code and Stripe honours the coupon's
   * own duration, while a one-off charge has no such concept and simply has the
   * money taken off the amount. Doing the second to a subscription — editing
   * `unit_amount` down — would discount every renewal forever, silently, which
   * is the expensive version of this bug.
   */
  coupon?: { promotionCodeId: string; discountCents: number; trialDays?: number | null } | null;
  // Override for flows where the order row itself is created per attempt (the
  // standalone offer checkout mints a fresh $0 order each visit). Keying on the
  // SetupIntent instead makes Stripe dedupe the subscription even if two orders
  // exist, which the default order-derived key could not do.
  idempotencyKey?: string;
  /**
   * Its money is already in the order's own payment.
   *
   * The offer checkout now charges a one-time offer on-session, in a
   * PaymentIntent the buyer confirms while they are present. Charging again
   * here would bill them twice for one purchase — and would do it
   * off-session, which is the thing that cannot happen on an Indian card.
   */
  prepaid?: boolean;
}): Promise<{ subscriptionId?: string; paymentIntentId?: string }> {
  const { order, offer, paymentMethodId } = args;
  const coupon = args.coupon ?? null;

  // A prepaid caller has already taken the money in the order's own intent —
  // see the `prepaid` doc above. If the offer resolves recurring by the time
  // we get here, creating a subscription below would stack it on top of that
  // completed charge: a double bill. Reachable with no code bug, not just in
  // theory — prices carry their own billingType, so a buyer can pick a
  // one-time price, have an admin archive it mid-checkout, and land back here
  // with `offer` recomputed from the headline recurring price while the
  // PaymentIntent they already confirmed sits there paid. One guard here
  // covers every prepaid caller, present and future, rather than trusting
  // each call site to re-derive the same check. The caller's catch turns this
  // into a voided order — better that than a subscription nobody agreed to.
  if (args.prepaid && offer.billingType === "recurring") {
    throw new Error("fulfilOffer: prepaid is only valid for a one-time offer, not a recurring one");
  }

  // The code goes in the key. Without it, applying a coupon to an offer someone
  // had already tried to buy without one would return Stripe's cached
  // subscription from the first attempt — at full price, with no error.
  const idem =
    (args.idempotencyKey ?? `fulfil_${order.id}_${offer.id}`) + (coupon ? `_${coupon.promotionCodeId}` : "");

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
        // Already resolved for this buyer — offerAsSoldTo strips it for anyone
        // who has had one, so this is the single place it is granted and the
        // single place worth recording.
        // The coupon's trial wins when it carries one. A Stripe coupon cannot
        // extend a trial itself — it discounts money — so this is the only
        // place "30 days free instead of 7" can be expressed.
        trial_period_days: coupon?.trialDays ?? offer.trialDays ?? undefined,
        // Stripe applies it for as long as the coupon says. On a trial that is
        // the first REAL invoice, not today's £0 one, which is the behaviour a
        // buyer expects and the one this cannot get wrong by computing itself.
        ...(coupon ? { discounts: [{ promotion_code: coupon.promotionCodeId }] } : {}),
        // Tag as store-created so Content Engine's webhook doesn't clobber it.
        // offerName rides along for the same reason as the base charge: Zapier
        // and the dashboard can only filter on what Stripe holds.
        description: `${offer.name} — ${await getStoreName()}`,
        metadata: {
          store_created: "true",
          orderId: order.id,
          offerId: offer.id,
          offerName: offer.name,
        },
      },
      { idempotencyKey: idem },
    );
    // The trial that actually ran, which is the coupon's when it carries one.
    // Reading the price's own value here recorded nothing for a promotional
    // trial — leaving the buyer free to take a second free trial afterwards —
    // and recorded one for a code that had just taken the trial away.
    await noteTrial(args.order.id, offerWithCouponTrial(offer, coupon));
    return { subscriptionId: sub.id };
  }

  // Already paid for in the order's own intent. Nothing to take.
  if (args.prepaid) return {};

  // A PaymentIntent cannot take a promotion code, so the discount is money off
  // the amount — never below the floor Stripe will accept.
  const charge = coupon
    ? Math.max(MIN_CHARGE_CENTS, immediateChargeCents(offer) - coupon.discountCents)
    : immediateChargeCents(offer);
  const pi = await stripe().paymentIntents.create(
    {
      amount: charge,
      currency: offer.currency,
      customer: order.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `${offer.name} — ${await getStoreName()}`,
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

/**
 * Charge and grant an order bump.
 *
 * Lifted out of finalizeOrder so the retry sweep can run exactly the same
 * steps rather than a second implementation of them — a replay that granted
 * access without charging, or charged without granting, would be worse than
 * the failure it was replaying.
 *
 * Safe to run twice. The charge is idempotent on order+offer inside
 * fulfilOffer, the ownership insert tolerates its unique violation, and the
 * order_items write is guarded on there being no row for this bump already.
 */
export async function fulfilBump(args: {
  orderId: string;
  storeId: string;
  userId: string;
  email: string;
  stripeCustomerId: string;
  offerId: string;
  paymentMethodId: string;
  /**
   * Its money is already in the order's own payment.
   *
   * A one-time bump is charged with the product, on-session, so fulfilment
   * grants it and records the line and charges nothing. Charging here as well
   * would bill the buyer twice for one tickbox.
   */
  prepaid?: boolean;
  /** The payment that covered it, for the order line. */
  paidByIntentId?: string | null;
  /**
   * Skip the fetch when the caller already has this offer fresh.
   *
   * completeOfferCheckout resolves it a few lines earlier to price the bump
   * for the ledger — re-fetching the same row a moment later would spend a
   * round trip to learn nothing new. Left undefined (the default) for every
   * other caller: the retry sweep in particular runs minutes later, where a
   * fresh read is the whole point — an offer withdrawn since the last attempt
   * must not be fulfilled just because a stale copy still says active.
   */
  offer?: Offer | null;
  /**
   * What to book the order line at.
   *
   * Defaults to the offer's own headline price, which is wrong whenever the
   * host placed this bump at a price other than that headline
   * (offer.bumpPriceIds / product.bumpPriceIds) — the caller has already
   * resolved the placement's actual figure to price its own ledger, and must
   * hand it over rather than let this re-derive the headline. Kept optional,
   * headline-fallback, so a caller with nothing better changes nothing.
   */
  amountCents?: number;
}): Promise<void> {
  const db = createServiceClient();
  const offer = args.offer !== undefined ? args.offer : await getOffer(args.offerId);
  // A deactivated offer must not be fulfilled even though the PaymentIntent
  // still carries its id: an admin may have withdrawn it between intent
  // creation and confirmation. Returning rather than throwing — there is
  // nothing here for a retry to fix.
  if (!offer?.active) return;

  // fulfilOffer has its own prepaid/recurring guard a few lines up in this
  // file — but that guard never runs for a prepaid bump, because the branch
  // right below skips calling fulfilOffer AT ALL when prepaid is set. "One
  // guard covers every prepaid caller" was true of every other caller, not
  // this one. Reachable with no code bug: a bump ticked while its host offer
  // priced it one-time, whose own first live price flips to recurring before
  // this runs (the same admin-archives-mid-checkout race fulfilOffer's guard
  // exists for) would otherwise be granted here with no subscription ever
  // created and no charge ever taken — free access, indefinitely. Refusing
  // beats silently dropping.
  if (args.prepaid && offer.billingType !== "one_time") {
    throw new Error("fulfilBump: prepaid is only valid for a one-time offer, not a recurring one");
  }

  // Prepaid takes no money and creates no subscription: a one-time bump paid
  // for in the order's own PaymentIntent is already settled, and the only work
  // left is granting it and writing the line.
  const result = args.prepaid
    ? { paymentIntentId: args.paidByIntentId ?? undefined, subscriptionId: undefined }
    : await fulfilOffer({
        order: { id: args.orderId, stripeCustomerId: args.stripeCustomerId },
        offer,
        paymentMethodId: args.paymentMethodId,
      });

  await grantOfferOwnership(args.storeId, args.userId, offer, "bump", result.subscriptionId ?? null, {
    email: args.email,
    stripeCustomerId: args.stripeCustomerId,
  });

  // One line per bump, however many times this runs. order_items has no unique
  // constraint to lean on, and a replay that appended a second line would
  // double the recorded revenue on an order that was charged once.
  const { data: already } = await db
    .from("order_items")
    .select("id")
    .eq("order_id", args.orderId)
    .eq("kind", "bump")
    .eq("offer_id", offer.id)
    .maybeSingle();
  if (already) return;

  await db.from("order_items").insert({
    store_id: args.storeId,
    order_id: args.orderId,
    kind: "bump",
    offer_id: offer.id,
    description: offer.name,
    amount_cents: args.amountCents ?? immediateChargeCents(offer),
    stripe_subscription_id: result.subscriptionId ?? null,
    stripe_payment_intent_id: result.paymentIntentId ?? null,
  });
}

// Idempotently finalize a paid order: mark paid, grant base ownership, fulfil
// the bump. Safe to call twice (thank-you confirm AND webhook).
export async function finalizeOrder(intentId: string): Promise<void> {
  const db = createServiceClient();
  const COLUMNS =
    "id, store_id, user_id, status, stripe_customer_id, email, visitor_id, tracking_consent, stripe_tax_calculation_id, tax_cents, stripe_setup_intent_id, currency, buyer_country, client_ip, client_user_agent, source_url, subtotal_cents, discount_cents, coupon_code";

  // Either kind of intent. A one-off product order points at a PaymentIntent; a
  // recurring one points at a SetupIntent, because a trial charges nothing
  // today and a $0 PaymentIntent is not a thing. Both arrive here, from the
  // thank-you page and from the Stripe webhook, and both are idempotent.
  const byPayment = await db
    .from("orders")
    .select(COLUMNS)
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();
  const found =
    byPayment.data ??
    (await db.from("orders").select(COLUMNS).eq("stripe_setup_intent_id", intentId).maybeSingle())
      .data;
  const order = found;
  if (!order || !order.user_id) return;
  if (order.status !== "pending") return; // already finalized, or refunded

  const isSetup = Boolean(order.stripe_setup_intent_id);
  // The metadata WE wrote, read back off whichever object this is. Nothing
  // below cares which kind it was except the part that has to create the
  // subscription.
  const intent = isSetup
    ? await stripe().setupIntents.retrieve(intentId)
    : await stripe().paymentIntents.retrieve(intentId);
  if (intent.status !== "succeeded") return;
  const pi = intent as unknown as {
    id: string;
    metadata: Record<string, string>;
    payment_method?: string | { id: string } | null;
    /** A SetupIntent charges nothing, so its "amount today" is zero. */
    amount: number;
    currency: string;
  };
  if (isSetup) {
    // A SetupIntent has neither, and everything downstream reads both.
    pi.amount = 0;
    pi.currency = (order.currency as string) ?? "usd";
  }

  // CLAIM the order, and only continue if this call is the one that won.
  //
  // The read above is not enough. The thank-you page and the Stripe webhook
  // both call this within milliseconds of each other, so both could read
  // 'pending' before either wrote 'paid' — and both would then go on to fulfil
  // the bump. Stripe's idempotency key meant only one subscription was ever
  // created, but each pass inserted its own order_items row, so the buyer saw
  // the add-on listed twice in admin and on their receipt.
  //
  // Scoped to 'pending' rather than "not paid": a refunded order must never be
  // re-finalised back into existence.
  const { data: claimed } = await db
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return; // someone else got there first

  // The subscription, where they bought a recurring way to pay.
  //
  // Created BEFORE ownership is granted, so a card that fails at this point
  // leaves nothing granted — the order is already claimed as paid and cannot be
  // replayed, so granting first and failing here would hand out access nobody
  // is being billed for.
  //
  // The price is read back from metadata WE wrote at start, never from the
  // request: what is billed is the option the page actually showed.
  const productId = pi.metadata.productId;
  const paymentMethodId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
  let baseSubscriptionId: string | null = null;
  // The trial the base subscription actually starts on — the coupon's where one
  // carries it, else the price's. Hoisted out of the subscription block because
  // the ownership row written below has to agree with what Stripe was told, and
  // it used to say "active" whatever the terms were.
  let baseTrialDays: number | null = null;
  const basePriceId: string | null = pi.metadata.productPriceId || null;

  if (isSetup && productId && paymentMethodId && order.stripe_customer_id) {
    const prod = await getProductById(productId);
    const price = prod?.prices.find((x: OfferPrice) => x.id === basePriceId && !x.archived) ?? null;
    if (!prod || !price) {
      // The price was archived or deleted between saving the card and landing
      // here. Refuse rather than guess: charging the headline price instead
      // would bill somebody for something they never chose.
      await db.from("orders").update({ status: "failed" }).eq("id", order.id);
      throw new Error("finalizeOrder: the chosen way to pay no longer exists");
    }

    // Make it the default card, so renewals and any off-session fulfilment
    // charge the card they just entered.
    await stripe().customers.update(order.stripe_customer_id as string, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const coupon = pi.metadata.couponCode
      ? await resolveCoupon(pi.metadata.couponCode, price.priceCents, prod.currency, {
          item: prod.slug,
          interval: price.billingType === "recurring" ? price.interval : null,
        })
      : null;

    // Worked out once, then used twice: told to Stripe, and used to decide the
    // ownership status. `??` not `||` — a coupon carrying `trial_days: 0`
    // deliberately REMOVES the trial, and `0 || x` would hand back the price's.
    baseTrialDays = (coupon?.ok ? coupon.coupon.trialDays : null) ?? price.trialDays ?? null;

    const sub = await stripe().subscriptions.create(
      {
        customer: order.stripe_customer_id as string,
        default_payment_method: paymentMethodId,
        items: [
          {
            price_data: {
              currency: prod.currency,
              product: await ensureStripeProductForProduct(prod),
              unit_amount: price.priceCents,
              recurring: {
                interval: price.interval ?? "month",
                interval_count: price.intervalCount || 1,
              },
            },
          },
        ],
        // As on the offer path: a coupon carrying trial_days replaces the
        // price's own trial for this purchase.
        trial_period_days: baseTrialDays ?? undefined,
        // Stripe applies the coupon for as long as the coupon says — on a trial
        // that is the first REAL invoice, not today's £0 one. Computing it here
        // is how the invoice and the receipt start disagreeing.
        ...(coupon?.ok ? { discounts: [{ promotion_code: coupon.coupon.promotionCodeId }] } : {}),
        // Stripe works out the rate on every future invoice. Ours could only
        // ever be right for the first one.
        automatic_tax: { enabled: TAX_ENABLED },
        description: `${prod.title} — ${await getStoreName()}`,
        metadata: {
          store_created: "true",
          orderId: order.id as string,
          productId: prod.id,
          productTitle: prod.title,
          productPriceId: price.id,
        },
      },
      // Keyed on the SetupIntent, so the thank-you page and the webhook racing
      // each other produce ONE subscription rather than two.
      { idempotencyKey: `basesub_${intentId}` },
    );
    baseSubscriptionId = sub.id;
  }

  // Grant ownership of the base product. Plain insert — the order-paid guard
  // above makes finalize idempotent; a unique-violation (already owned) is fine.
  if (productId) {
    const { error } = await db.from("ownership").insert({
      store_id: order.store_id,
      user_id: order.user_id,
      product_id: productId,
      product_price_id: basePriceId,
      // A recurring product is owned for as long as it is paid for, so the
      // subscription has to be findable from the thing it grants — the
      // reconciler, the cancel flow and the trial-ending email all ask "who is
      // on this".
      stripe_subscription_id: baseSubscriptionId,
      source: "purchase",
      // What Stripe is doing, not what we wish it were. A trialing
      // subscription recorded as active tags the buyer in the CRM as a paid
      // customer and shows the admin a sale that has not been paid for yet.
      status: baseTrialDays && baseTrialDays > 0 ? "trialing" : "active",
    });
    if (error && error.code !== "23505") throw new Error(`grant base: ${error.message}`);
  }

  // Fulfil the bump if one was taken.
  //
  // Guarded, and this is the whole point of the guard: the bump is a SEPARATE
  // off-session charge on the saved card, and an off-session charge genuinely
  // fails sometimes — that is why dunning exists. It was unguarded, so a
  // declined add-on threw out of finalizeOrder: the thank-you route errored on
  // a purchase that had in fact succeeded, and Stripe's webhook retried the
  // whole finalize forever behind it. The buyer kept the product, never got the
  // add-on, and nobody was told.
  //
  // Wallets make it likelier rather than new — a device token is refused for a
  // merchant-initiated charge more often than a typed card is.
  const bumpOfferId = pi.metadata.bumpOfferId;
  if (bumpOfferId && paymentMethodId && order.stripe_customer_id) {
    try {
      await fulfilBump({
        orderId: order.id as string,
        storeId: order.store_id as string,
        userId: order.user_id as string,
        email: order.email as string,
        stripeCustomerId: order.stripe_customer_id as string,
        offerId: bumpOfferId,
        paymentMethodId,
        prepaid: pi.metadata.bumpPrepaid === "true",
        paidByIntentId: pi.id,
        // Resolved once at checkout time, from the product's own placement —
        // see createCheckoutIntent. Blank for a RECURRING bump (nothing was
        // charged today, so there is no placement figure to carry) and for
        // an intent written before this field existed — both fall through to
        // the headline fallback inside fulfilBump.
        amountCents: pi.metadata.bumpAmountCents ? Number(pi.metadata.bumpAmountCents) : undefined,
      });
    } catch (e) {
      // Queued, not lost. The sweep replays it every few minutes and the charge
      // is idempotent on order+offer, so a blip heals itself and a hard decline
      // ends up in front of an admin instead of nowhere.
      //
      // NOT rethrown: the product is bought and paid for by this point, and an
      // add-on that could not be charged must not undo that or wedge the
      // webhook. The buyer is not out of pocket — the base PaymentIntent never
      // included the bump, which is charged on its own.
      await recordError({
        source: "bump_charge",
        message: `Could not charge the order bump: ${e instanceof Error ? e.message : String(e)}`,
        context: { orderId: order.id, offerId: bumpOfferId },
        jobKind: "bump_charge",
        jobPayload: {
          orderId: order.id,
          storeId: order.store_id,
          userId: order.user_id,
          email: order.email,
          stripeCustomerId: order.stripe_customer_id,
          offerId: bumpOfferId,
          paymentMethodId,
          prepaid: pi.metadata.bumpPrepaid === "true",
          paidByIntentId: pi.id,
          // Replayed by the sweep so a retry books the same placement price
          // rather than falling back to the bump's headline.
          amountCents: pi.metadata.bumpAmountCents ? Number(pi.metadata.bumpAmountCents) : undefined,
        },
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

    // The welcome, unless the store has written its own.
    //
    // The post-purchase email replaces this one and is sent later on purpose —
    // once the bump and the upsell have been answered, so it can list
    // everything in one message. Sending both would be two welcomes minutes
    // apart saying the same thing. See lib/post-purchase-send.ts.
    const ownWelcome = (await getSettingsOrDefaults()).postPurchaseEmail.enabled;
    if (!ownWelcome) {
      await sendEmail(
        to,
        buildWelcomeEmail({
          email: to,
          productTitle: lines[0]?.description ?? "your purchase",
          siteUrl: site,
        }),
      );
    }
    await sendEmail(
      to,
      buildReceiptEmail({
        email: to,
        orderId: order.id as string,
        lines,
        // The order already knows what a coupon took off and what it was
        // called. The receipt said neither, so a buyer who used a code saw a
        // total that did not match the prices printed above it.
        subtotalCents: (order.subtotal_cents as number) ?? undefined,
        discountCents: (order.discount_cents as number) ?? 0,
        couponCode: (order.coupon_code as string | null) ?? null,
        totalCents: pi.amount,
        taxCents: (order.tax_cents as number) ?? 0,
        currency: pi.currency,
        siteUrl: site,
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

  // ActiveCampaign: upsert the buyer and apply the tag configured on each
  // product they bought. Above the consent gate for the same reason as the
  // receipt — this is the record of a customer relationship, not ad
  // measurement. Guarded: a CRM outage must not fail a paid order.
  try {
    const { data: bought } = await db
      .from("order_items")
      .select("product_id, offer_id")
      .eq("order_id", order.id);
    // Before tagging: a buffered lead for this buyer must not be forwarded
    // fifteen minutes after they have already paid.
    await markLeadConverted(order.email as string);
    const boughtOfferIds = (bought ?? []).map((i) => i.offer_id).filter(Boolean) as string[];
    await tagPurchase({
      userId: order.user_id as string,
      productIds: (bought ?? []).map((i) => i.product_id).filter(Boolean) as string[],
      offerIds: boughtOfferIds,
    });
    // An offer bought with a trial has not been paid for yet, so it gets the
    // trial tag rather than the buyer one. Grouped by what each offer actually
    // started as — a checkout can carry both a trial bump and a paid one.
    if (boughtOfferIds.length > 0) {
      const offers = await Promise.all(boughtOfferIds.map((id) => getOffer(id)));
      const byStatus = { trialing: [] as string[], active: [] as string[] };
      for (const o of offers) {
        if (!o) continue;
        byStatus[o.trialDays && o.trialDays > 0 ? "trialing" : "active"].push(o.id);
      }
      for (const status of ["trialing", "active"] as const) {
        if (byStatus[status].length > 0) {
          await tagLifecycle({ userId: order.user_id as string, offerIds: byStatus[status], status });
        }
      }
    }
  } catch (e) {
    console.error("[finalizeOrder] activecampaign failed (order is still complete):", e);
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
    const who = await buyerContextFor(order.id as string);
    if (!who) return;

    await trackPurchase({
      ...who,
      eventId: eventIdFor("Purchase", order.id as string),
      eventName: "Purchase",
      valueCents: pi.amount,
      currency: pi.currency,
      orderId: order.id as string,
      occurredAt: Math.floor(Date.now() / 1000),
    });

    // A trial started on this order. Reported as its own event with the
    // recurring price as its worth: the $0 taken today would tell Meta the
    // trial was worthless, and counting the price as revenue would say money
    // moved when none did.
    const trialCents = await trialWorthFor(order.id as string);
    if (trialCents > 0) {
      await trackServerEvent({
        ...who,
        eventId: eventIdFor("StartTrial", order.id as string),
        eventName: "StartTrial",
        valueCents: trialCents,
        currency: pi.currency,
        orderId: order.id as string,
        occurredAt: Math.floor(Date.now() / 1000),
      });
    }

    // This funnel's own event, from the server as well as the browser.
    //
    // It was browser-only when it shipped, which made the one event the ads
    // team optimises against the least reliable thing we send — lost to an ad
    // blocker, a closed tab, a tracking protection list, exactly like the
    // browser copy of Purchase used to be. Same event_id on both sides, so
    // Meta collapses the pair into one rather than counting two.
    //
    // Meta only: GA4 has no name to map a made-up event onto, and inventing
    // one would put it in a report beside events that mean something else.
    const adEvent = await adEventForOrder(order.id as string);
    if (adEvent) {
      await trackServerEvent(
        {
          ...who,
          eventId: customEventIdFor(adEvent.name, order.id as string),
          eventName: "Purchase",
          customName: adEvent.name,
          contentName: adEvent.contentName,
          valueCents: pi.amount,
          currency: pi.currency,
          orderId: order.id as string,
          occurredAt: Math.floor(Date.now() / 1000),
        },
        { only: ["meta"] },
      );
    }
  } catch (e) {
    console.error("[finalizeOrder] tracking failed (order is still complete):", e);
  }
}

/**
 * Who a buyer is, for the ad platforms, read from the order they placed.
 *
 * Shared by the purchase and by an accepted upsell, which charges separately
 * and would otherwise have had to build its own — and a second version of this
 * is a second answer to "what does Meta know about this person", drifting one
 * field at a time.
 */
export async function buyerContextFor(orderId: string) {
  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, email, user_id, visitor_id, buyer_country, client_ip, client_user_agent, source_url",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const { data: visitor } = order.visitor_id
    ? await db
        .from("visitors")
        .select("click_ids, first_seen_at")
        .eq("id", order.visitor_id)
        .maybeSingle()
    : { data: null };

  // What was bought, so the server copy names a product too. The browser copy
  // has always carried this; on ad-blocked traffic, where the server copy is
  // the only one that arrives, it named nothing.
  const { data: items } = await db
    .from("order_items")
    .select("description, product_id")
    .eq("order_id", order.id as string);
  const { data: buyer } = await db
    .from("users")
    .select("username")
    .eq("id", order.user_id as string)
    .maybeSingle();

  return {
    email: order.email as string,
    userId: order.user_id as string,
    fullName: (buyer?.username as string | null) ?? null,
    country: (order.buyer_country as string | null) ?? null,
    clientIp: (order.client_ip as string | null) ?? null,
    userAgent: (order.client_user_agent as string | null) ?? null,
    sourceUrl: (order.source_url as string | null) ?? null,
    clickIds: (visitor?.click_ids as Record<string, string>) ?? {},
    clickTimeMs: visitor?.first_seen_at ? new Date(visitor.first_seen_at as string).getTime() : null,
    contentIds: (items ?? []).map((i) => (i.product_id as string) ?? "").filter(Boolean),
    contentName: (items ?? [])[0]?.description as string | undefined,
    numItems: (items ?? []).length || undefined,
  };
}

export async function grantOfferOwnership(
  storeId: string,
  userId: string,
  offer: Offer,
  source: "bump" | "oto" | "grant",
  subscriptionId: string | null,
  ctx?: { email: string; fullName?: string | null; stripeCustomerId: string | null },
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
    // 23505 means a row for this (store, user, app, OFFER) already exists. It is
    // NOT simply a duplicate to ignore: a returning subscriber's old row is
    // still there marked `canceled`, and now that cancelled rows no longer count
    // as owned, they can buy again — so the row must be revived. Swallowing the
    // conflict would leave them paid up with status `canceled` and no access.
    //
    // Keyed on the offer since 0069. Without that this update would rewrite
    // EVERY one of a person's channel rows on any purchase — buying LinkedIn
    // would point the Instagram row at the LinkedIn subscription.
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
        .eq("app_id", offer.grantAppId)
        .eq("offer_id", offer.id);
      if (reviveErr) throw new Error(`grant offer (app revive): ${reviveErr.message}`);
    } else if (error) {
      throw new Error(`grant offer (app): ${error.message}`);
    }

    // Provision the connected app (best-effort, server-to-server). A failure
    // here never breaks the purchase — the handoff re-provisions on first open.
    if (ctx) {
      // Looked up here rather than passed in by four call sites. An order does
      // not store a name; the account does. Getting it wrong means the app
      // creates a nameless account, which is what happened to every trial
      // bought by someone already signed in.
      const { data: buyer } = await db
        .from("users")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      await pushAppEntitlement(storeId, userId, offer.grantAppId, {
        email: ctx.email,
        fullName: ctx.fullName ?? (buyer?.username as string | null) ?? null,
        stripeCustomerId: ctx.stripeCustomerId,
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
export async function resolveOtoForOrder(intentId: string): Promise<string | null> {
  const db = createServiceClient();
  // Which kind of intent this is decides which Stripe object to retrieve, and
  // asking our own order first avoids a 404 from Stripe for the other type.
  const { data: order } = await db
    .from("orders")
    .select("id, store_id, stripe_setup_intent_id")
    .or(`stripe_payment_intent_id.eq.${intentId},stripe_setup_intent_id.eq.${intentId}`)
    .maybeSingle();
  if (!order) return null;

  const intent = order.stripe_setup_intent_id
    ? await stripe().setupIntents.retrieve(intentId)
    : await stripe().paymentIntents.retrieve(intentId);
  const pi = intent as unknown as { metadata: Record<string, string> };
  const productId = pi.metadata.productId;
  // The standalone offer checkout's intent carries offerId and no productId at
  // all (startOfferCheckout, lib/offer-checkout.ts) — the two are mutually
  // exclusive on every intent this app writes, so productId being present is
  // an unambiguous "this was the product checkout", never a guess.
  const hostOfferId = pi.metadata.offerId;
  const userId = pi.metadata.userId;
  if (!userId || (!productId && !hostOfferId)) return null;

  // Which table names the upsell slot depends on which checkout this was —
  // a product's own upsell_offer_id column, or (added in 0072, alongside its
  // bump) the HOST OFFER's column of the same name.
  let upsellOfferId: string | null | undefined;
  if (productId) {
    const { data: prod } = await db
      .from("products")
      .select("upsell_offer_id")
      .eq("id", productId)
      .maybeSingle();
    upsellOfferId = prod?.upsell_offer_id as string | null | undefined;
  } else {
    const { data: host } = await db
      .from("offers")
      .select("upsell_offer_id")
      .eq("id", hostOfferId)
      .maybeSingle();
    upsellOfferId = host?.upsell_offer_id as string | null | undefined;
  }
  if (!upsellOfferId) return null; // empty slot → skip

  // Whether they took the bump decides NOTHING here. Ownership does.
  //
  // This used to return null the moment the order carried a bump at all —
  // "bump already taken → no OTO" — which is right for exactly one of the four
  // cases and wrong for the rest:
  //
  //   bump declined, different offer  → show it        (was shown)
  //   bump declined, SAME offer       → show it, a second chance at the thing
  //                                     they just said no to   (was shown)
  //   bump taken,    different offer  → show it: a completely unrelated
  //                                     product, suppressed for no reason
  //                                     (was HIDDEN — the whole cost of this)
  //   bump taken,    SAME offer       → hide it, they own it now (was hidden)
  //
  // The only case that must be hidden is the last one, and the ownership gate
  // below already hides it: finalizeOrder grants the bump before this runs, and
  // ownershipFor counts everything that is not cancelled — so a bump taken on a
  // free trial registers too, which is the case a naive "is it active" check
  // would have missed and sold twice.
  //
  // So the rule is ownership and nothing else. An explicit "is the upsell the
  // same id as the bump" test would be worse: it would also kill the second
  // chance in row two, and it would hide a bug in ownership rather than expose
  // one.
  const offer = await getOffer(upsellOfferId);
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

/**
 * Report a sale made against a card already on file.
 *
 * Two of them: the one-click upsell, and an offer accepted from the library
 * afterwards. Neither was reported anywhere — a separate charge, a separate
 * line on the order, and no event on either side. So every accepted upsell was
 * revenue the ad platforms never saw, and the campaigns bidding on this funnel
 * were optimising against the front-end price alone.
 *
 * Keyed on the charge's OWN id rather than the order's, so it does not collide
 * with the purchase already reported under the order — Meta deduplicates on
 * event_id, and sharing one would have thrown the second away instead of
 * adding it up.
 *
 * Never throws. The thing being reported is bought, charged and granted by the
 * time this runs, and tracking may not undo that.
 */
async function trackOfferSale(
  orderId: string,
  offer: Offer,
  result: { subscriptionId?: string; paymentIntentId?: string },
): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("currency, tracking_consent")
      .eq("id", orderId)
      .maybeSingle();
    // Consent was captured at checkout and applies to the whole order. Without
    // it, nothing leaves this server.
    if (!order || order.tracking_consent !== true) return;

    const who = await buyerContextFor(orderId);
    if (!who) return;

    // A trial takes nothing today. Reporting $0 as a purchase says the sale was
    // worthless; reporting the price as revenue says money moved when none did.
    const nowCents = immediateChargeCents(offer);
    const key = result.paymentIntentId ?? result.subscriptionId ?? orderId;
    // The OFFER's identity, not the order's.
    //
    // `who` describes the whole order — its content ids are every product on
    // it and its content name is the first line's description — so an upsell
    // was reported under the base product's name. Seen in production 4 Sep
    // 2026: a Funnel App trial arrived as content_name "Digital Product
    // Validator" with the product's id and num_items 3, which would attribute
    // every upsell to the product in any audience built on it.
    const identity = {
      contentName: offer.name,
      contentIds: [offer.key],
      contentType: "product" as const,
      numItems: 1,
    };
    await trackServerEvent({
      ...who,
      ...identity,
      eventId: eventIdFor(nowCents > 0 ? "Purchase" : "StartTrial", key),
      eventName: nowCents > 0 ? "Purchase" : "StartTrial",
      valueCents: nowCents > 0 ? nowCents : offer.priceCents,
      currency: (order.currency as string) ?? offer.currency,
      orderId,
      occurredAt: Math.floor(Date.now() / 1000),
    });

    // And this offer's own named event, beside the standard one rather than
    // instead of it: Meta optimises on Purchase and StartTrial, and a custom
    // event cannot carry that. Meta only — GA4 has no name to map it onto.
    const adName = offer.adEventName?.trim();
    if (adName) {
      await trackServerEvent(
        {
          ...who,
          ...identity,
          eventId: customEventIdFor(adName, key),
          eventName: nowCents > 0 ? "Purchase" : "StartTrial",
          customName: adName,
          valueCents: nowCents > 0 ? nowCents : offer.priceCents,
          currency: (order.currency as string) ?? offer.currency,
          orderId,
          occurredAt: Math.floor(Date.now() / 1000),
        },
        { only: ["meta"] },
      );
    }
  } catch (e) {
    console.error("[trackOfferSale] failed (the sale is still complete):", e);
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

  await trackOfferSale(order.id as string, offer, result);

  return { ok: true };
}

export type OtoAcceptResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "expired" | "used" | "charge_failed" };

// Accept the OTO. POST-only, single-use: an atomic pending→completed update is
// the replay guard, so a back-button/refresh/replay can never double-charge.
export async function acceptOto(
  token: string,
  /** An INDEX into the list this order's upsell shows, or the legacy "alt". */
  choice?: "alt" | number,
): Promise<OtoAcceptResult> {
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
  const shown = await getOffer(offerId);
  if (!order || !shown) return { ok: false, error: "invalid" };

  // A choice between the prices the page showed, not a free choice of offer.
  // It resolves through the ORDER's product, so the worst a tampered form can
  // do is buy something it was already offered.
  let picked: Offer;
  if (typeof choice === "number") {
    const options = await upsellPricesFor(orderId);
    const price = priceForChoice(options, choice);
    // Out of range refuses rather than falling back to the headline price.
    // The token is already claimed at this point, so the release below is what
    // gives them their offer back — see the note on failed charges.
    if (!price) {
      await db.from("oto_tokens").update({ status: "pending", consumed_at: null }).eq("token_hash", sha256(token));
      return { ok: false, error: "invalid" };
    }
    picked = offerAtPrice(shown, price);
  } else {
    // The old two-offer pairing, while placements are still on it.
    const alt = await upsellAltFor(orderId);
    const buyId = offerForChoice(shown, alt, choice);
    if (!buyId) return { ok: false, error: "invalid" };
    picked = buyId === shown.id ? shown : (alt as Offer);
  }
  // Same decision as the bump. The upsell always follows a purchase, so the
  // buyer is known and the page they were shown was already resolved for them
  // — there is nothing here to refuse, only a trial not to hand out twice.
  const offer = await offerAsSoldTo(order.email as string, picked);

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
  await trackOfferSale(order.id as string, offer, result);
  return { ok: true };
}

/**
 * Where a bounce OUT of the OTO page or its accept action belongs.
 *
 * Every one of those routes pre-dates an offer having an upsell of its own,
 * and all of them sent a declined/expired/failed/deleted-offer buyer to
 * /checkout/thank-you — a page built to greet someone who just bought a
 * PRODUCT. An order placed through the standalone offer checkout has no such
 * page (see app/(store)/checkout/offer/complete/route.ts, which has always
 * sent that buyer to /library instead), so this decides which of the two an
 * order actually belongs to and every one of those call sites asks it rather
 * than hard-coding thank-you.
 *
 * Takes the ORDER id, resolved server-side from an already-verified token —
 * never a query parameter or any other caller-supplied value. A page reachable
 * by a bare GET that redirects wherever a request tells it to is an open
 * redirect; this always looks the order up itself.
 *
 * `orderId` is null exactly where no token has verified yet (missing,
 * malformed, bad signature) — there is no order to ask. That is not a gap this
 * leaves open: a token that fails to verify carries no payload at all (see
 * VerifyResult's `{ ok: false, reason }` in lib/oto-token.ts), so there is
 * nothing here TO look up, and every one of these paths has always defaulted
 * to thank-you in that case.
 *
 * `reason`, when given, becomes the destination's OWN status query param —
 * thank-you reads `oto=`, library reads `offer=` — so a token both
 * vocabularies define (`charge_failed`) reads with the right words on either,
 * and one only the OTO vocabulary has (declined/expired/used/invalid) shows no
 * banner on library rather than a query string it was never built to read.
 */
export async function otoBounceHref(orderId: string | null, reason?: string): Promise<string> {
  let base: "/checkout/thank-you" | "/library" = "/checkout/thank-you";
  if (orderId) {
    const db = createServiceClient();
    // Same signal upsellPricesFor/upsellAltFor key off below: a "product" kind
    // order_item is the one row that ever carries product_id, so its presence
    // (existence only — the value itself is not needed here) says this order
    // came through the product checkout rather than the standalone offer one.
    const { data } = await db
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .not("product_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!data) base = "/library";
  }
  if (!reason) return base;
  return `${base}?${base === "/library" ? "offer" : "oto"}=${encodeURIComponent(reason)}`;
}

// ---------------------------------------------------------------------------
// The second price, resolved from the placement
// ---------------------------------------------------------------------------

/**
 * The alternative price for the upsell on the order that minted this token.
 *
 * The pairing lives on the product, not the offer, so it is read from the
 * product this order was for. Never from the request: the page sends "alt",
 * and the id it resolves to comes from here.
 */
/** Who an order belongs to, for resolving what they have already had. */
export async function orderEmailFor(orderId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("orders").select("email").eq("id", orderId).maybeSingle();
  return (data?.email as string | null) ?? null;
}

/**
 * The HOST offer of an order placed through the standalone offer checkout —
 * as opposed to one it later added by accepting an upsell.
 *
 * completeOfferCheckout books the purchase itself as an order_items row with
 * `kind: "oto"` and its own offer_id (there is no product on this order to
 * hang a "product" kind row off of) — and acceptOto books an ACCEPTED upsell
 * exactly the same way. So an order that has gone on to accept an upsell holds
 * TWO "oto" rows, and `kind = "oto"` alone cannot say which one was the actual
 * purchase. completeOfferCheckout always writes its row before any upsell can
 * exist — there is nothing to accept until the order that would carry it is
 * real — so the EARLIEST by created_at is always the host, never an accepted
 * upsell. Ordering by kind or by id would not have that guarantee.
 */
async function hostOfferIdFor(orderId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("order_items")
    .select("offer_id")
    .eq("order_id", orderId)
    .eq("kind", "oto")
    .not("offer_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.offer_id as string | null) ?? null;
}

/**
 * The ways to pay the upsell for THIS order shows.
 *
 * Resolved from the order's product, never from the request — the same
 * borrowing upsellAltFor does, and the same reason: the page shows the prices
 * and the form sends an index into them, so the worst a tampered form can do
 * is buy something it was already offered.
 */
export async function upsellPricesFor(orderId: string): Promise<OfferPrice[]> {
  const db = createServiceClient();
  const { data: items } = await db
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId)
    .not("product_id", "is", null);
  const productId = items?.[0]?.product_id as string | undefined;

  let offerId: string | null | undefined;
  let priceIds: unknown;
  if (productId) {
    const { data: product } = await db
      .from("products")
      .select("upsell_offer_id, upsell_price_ids")
      .eq("id", productId)
      .maybeSingle();
    offerId = product?.upsell_offer_id as string | null | undefined;
    priceIds = product?.upsell_price_ids;
  } else {
    // No product line: a standalone offer-checkout order. Its slot lives on
    // the HOST OFFER instead of a product — see hostOfferIdFor for why that
    // must be resolved from the EARLIEST "oto" order_item, not just any row
    // of that kind.
    const hostId = await hostOfferIdFor(orderId);
    if (hostId) {
      const { data: host } = await db
        .from("offers")
        .select("upsell_offer_id, upsell_price_ids")
        .eq("id", hostId)
        .maybeSingle();
      offerId = host?.upsell_offer_id as string | null | undefined;
      priceIds = host?.upsell_price_ids;
    }
  }
  if (!offerId) return [];
  const offer = await getOffer(offerId);
  if (!offer) return [];
  return shownPrices(offer.prices, Array.isArray(priceIds) ? (priceIds as string[]) : []);
}

export async function upsellAltFor(orderId: string): Promise<Offer | null> {
  const db = createServiceClient();
  const { data: items } = await db
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId)
    .not("product_id", "is", null);
  const productId = items?.[0]?.product_id as string | undefined;
  // Also covers an order placed through the standalone offer checkout, which
  // has no product line at all. That is deliberate, not an omission: offers
  // have no upsell_alt_offer_id column (unlike products, which kept theirs
  // only for placements not yet moved onto price lists — see upsellPriceIds'
  // own comment in lib/types.ts) and never will, so there is no second column
  // to invent a lookup for. null is the honest answer here.
  if (!productId) return null;
  const { data: product } = await db
    .from("products")
    .select("upsell_alt_offer_id")
    .eq("id", productId)
    .maybeSingle();
  const altId = product?.upsell_alt_offer_id as string | null | undefined;
  if (!altId) return null;
  const alt = await getOffer(altId);
  return alt?.active ? alt : null;
}

/**
 * The alternative an admin PREVIEW should show.
 *
 * A preview has no order behind it, so it borrows the first product that
 * places this offer. Unlike the live page it does not require the alternative
 * to be active — a draft second price is exactly the one being set up.
 */
async function previewAltFor(offerId: string, column: "bump" | "upsell"): Promise<Offer | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("products")
    .select(`${column}_alt_offer_id`)
    .eq(`${column}_offer_id`, offerId)
    .not(`${column}_alt_offer_id`, "is", null)
    .limit(1);
  const altId = (data?.[0] as Record<string, string | null> | undefined)?.[`${column}_alt_offer_id`];
  return altId ? await getOffer(altId) : null;
}

export const previewBumpAlt = (offerId: string) => previewAltFor(offerId, "bump");

/**
 * The prices a PREVIEW of this placement should show.
 *
 * Same borrowing as previewAltFor: a preview has no product behind it, so it
 * takes the first product that places this offer and shows what that checkout
 * shows. Nothing placed yet falls back to the headline price, which is what an
 * unplaced offer would draw anyway.
 */
export async function previewPricesFor(
  offerId: string,
  column: "bump" | "upsell",
): Promise<OfferPrice[]> {
  const offer = await getOffer(offerId);
  if (!offer) return [];
  const db = createServiceClient();
  const { data } = await db
    .from("products")
    .select(`${column}_price_ids`)
    .eq(`${column}_offer_id`, offerId)
    .limit(1);
  const ids = (data?.[0] as Record<string, unknown> | undefined)?.[`${column}_price_ids`];
  return shownPrices(offer.prices, Array.isArray(ids) ? (ids as string[]) : []);
}
export const previewUpsellAlt = (offerId: string) => previewAltFor(offerId, "upsell");
