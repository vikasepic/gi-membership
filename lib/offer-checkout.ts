import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer } from "@/lib/store";
import { isOfferEligible, immediateChargeCents, offerAtPrice, offerWithCouponTrial } from "@/lib/offers";
import { livePrices, priceForChoice } from "@/lib/offer-prices";
import { ownershipFor, fulfilOffer, grantOfferOwnership, customerForUser } from "@/lib/checkout";
import { stripe, stripeMode } from "@/lib/stripe";
import { normalizeCountry } from "@/lib/tax";
import { ensureUserProfile } from "@/lib/users";
import { MIN_CHARGE_CENTS, resolveCoupon, type AppliedCoupon } from "@/lib/coupons";

// Standalone checkout for a single offer, for a member who has no card on file
// yet (they were gifted access, or their only purchase predates a saved card).
//
// This CANNOT reuse the product checkout. That flow creates an account and
// opens a PaymentIntent for a priced product; here the buyer is already signed
// in, and a trial offer charges nothing today — a $0 PaymentIntent is not a
// thing. So: a SetupIntent saves the card, then the subscription carries the
// trial and bills on its own schedule. Same rule as everywhere else in the
// money path — a one-time charge and a trial are never one charge.

export type StartResult =
  | { ok: true; clientSecret: string; customerId: string }
  | { ok: false; error: string };

/**
 * What a code is worth against this offer.
 *
 * The subtotal it is measured against is NOT what is charged today. A trial
 * takes nothing today, so resolving against that would refuse every code with
 * "this order is already at the minimum charge" — on the offers where a
 * discount matters most. The honest subtotal for a subscription is the price
 * that will actually be billed, which is what Stripe will discount too.
 */
function couponSubtotal(offer: { billingType: string; priceCents: number }, chargeNow: number): number {
  return offer.billingType === "recurring" ? offer.priceCents : chargeNow;
}

/**
 * Check a code before anyone commits to it.
 *
 * Display only. What is actually charged is resolved again at fulfilment, from
 * the code stored on the SetupIntent by US — so a tampered preview can change
 * what a page SAYS and never what a card is charged.
 */
export async function previewOfferCoupon(args: {
  offerId: string;
  code: string;
  priceChoice?: number;
}): Promise<
  | {
      ok: true;
      label: string;
      discountCents: number;
      clamped: boolean;
      recurringDiscount: boolean;
      /**
       * The trial this code grants, replacing the price's own. Null when it
       * says nothing about one; zero when it takes the trial away.
       *
       * The DAYS, not a sentence about them. This used to be a note reading
       * "30 days free instead of 7", printed beside a terms line that could
       * not see the coupon and still said "7 days free" — two trials on one
       * screen. The terms line states the real one now, and the number is
       * what it needs to do that.
       */
      trialDays: number | null;
    }
  | { ok: false; error: string }
> {
  const raw = await getOffer(args.offerId);
  if (!raw || !raw.active) return { ok: false, error: "That offer isn’t available any more." };
  const shown = livePrices(raw.prices);
  const price = args.priceChoice !== undefined ? priceForChoice(shown, args.priceChoice) : null;
  if (args.priceChoice !== undefined && !price) {
    return { ok: false, error: "That option is no longer available." };
  }
  const offer = price ? offerAtPrice(raw, price) : raw;
  const res = await resolveCoupon(
    args.code,
    couponSubtotal(offer, immediateChargeCents(offer)),
    offer.currency,
    { item: offer.key, interval: offer.billingType === "recurring" ? offer.interval : null },
  );
  if (!res.ok) return res;
  return {
    ok: true,
    label: res.coupon.label,
    discountCents: res.coupon.discountCents,
    clamped: res.coupon.clamped,
    recurringDiscount: res.coupon.recurringDiscount,
    trialDays: res.coupon.trialDays,
  };
}

export async function startOfferCheckout(args: {
  /** Resolved by the action layer — a member, or an account just created. */
  userId: string;
  email: string;
  offerId: string;
  /** Which way to pay — an INDEX into the list this offer's page shows. */
  priceChoice?: number;
  /** The code they typed. Re-checked here; never trusted for an amount. */
  couponCode?: string | null;
  /** Whether this checkout created the account. Decides the sign-in on return. */
  isNewAccount?: boolean;
}): Promise<StartResult> {
  const offer = await getOffer(args.offerId);
  if (!offer || !offer.active) return { ok: false, error: "That offer isn’t available any more." };

  // The list is rebuilt here from the offer's own page selection, never from
  // the request — the browser sends an index into it and nothing else, so the
  // only thing it can buy is something it was shown. An index outside the list
  // refuses rather than falling back to the headline price.
  const shown = livePrices(offer.prices);
  if (args.priceChoice !== undefined) {
    const price = priceForChoice(shown, args.priceChoice);
    if (!price) return { ok: false, error: "That option is no longer available." };
  }

  // Never sell someone what they already have.
  const owned = await ownershipFor(args.userId);
  if (!isOfferEligible(offer, owned)) {
    return { ok: false, error: "You already have this." };
  }

  const storeId = await getStoreId();
  const customerId = await customerForUser(args.userId, args.email, storeId);

  // Resolved now so a dead code fails while they can still see the field,
  // rather than after the card is saved and there is no form left to say it on.
  // The RESULT is not carried — only the code — because the amount is worked
  // out again at fulfilment against the offer as it stands then.
  let coupon: AppliedCoupon | null = null;
  if (args.couponCode?.trim()) {
    const chosen = args.priceChoice !== undefined ? priceForChoice(shown, args.priceChoice) : null;
    const priced = chosen ? offerAtPrice(offer, chosen) : offer;
    const res = await resolveCoupon(
      args.couponCode,
      couponSubtotal(priced, immediateChargeCents(priced)),
      priced.currency,
      { item: priced.key, interval: priced.billingType === "recurring" ? priced.interval : null },
    );
    if (!res.ok) return { ok: false, error: res.error };
    coupon = res.coupon;
  }

  const si = await stripe().setupIntents.create({
    customer: customerId,
    usage: "off_session",
    automatic_payment_methods: { enabled: true },
    // The price id is written by US, from a list we rebuilt — not copied out
    // of the request — so completeOfferCheckout can charge the right one on the
    // way back without trusting anything the browser said.
    metadata: {
      storeId,
      userId: args.userId,
      offerId: offer.id,
      offerPriceId:
        args.priceChoice !== undefined
          ? (priceForChoice(shown, args.priceChoice)?.id ?? "")
          : "",
      // The code, not the discount. An amount written here would be an amount
      // the browser could have influenced at preview time; the code is re-priced
      // on the way back against whatever the coupon is worth then.
      couponCode: coupon?.code ?? "",
      // Whether THIS checkout created the account. Read on the way back to
      // decide whether a session may be handed out — see mintOfferLogin.
      newAccount: args.isNewAccount ? "true" : "false",
    },
  });
  if (!si.client_secret) return { ok: false, error: "Could not start checkout." };
  return { ok: true, clientSecret: si.client_secret, customerId };
}

// Called on return from Stripe. Idempotent: the eligibility re-check short-
// circuits a refresh, and the fulfilment key is derived from the SetupIntent so
// Stripe itself refuses to create a second subscription even under a race.
export async function completeOfferCheckout(
  setupIntentId: string,
  country?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const si = await stripe().setupIntents.retrieve(setupIntentId);
  if (si.status !== "succeeded") return { ok: false, error: "card_not_saved" };

  const userId = si.metadata?.userId;
  const offerId = si.metadata?.offerId;
  const storeId = si.metadata?.storeId;
  if (!userId || !offerId || !storeId) return { ok: false, error: "unknown_setup_intent" };

  const raw = await getOffer(offerId);
  if (!raw || !raw.active) return { ok: false, error: "unavailable" };
  // Which way to pay they chose, read back from metadata WE wrote at start —
  // never from the request. A price archived since then falls back to the
  // headline one rather than refusing a card that has already been saved.
  const chosenId = si.metadata?.offerPriceId ?? "";
  const chosen = chosenId ? raw.prices.find((p) => p.id === chosenId && !p.archived) : null;
  const offer = chosen ? offerAtPrice(raw, chosen) : raw;

  // A refresh of the return page lands here again — by then they own it.
  const owned = await ownershipFor(userId);
  if (!isOfferEligible(offer, owned)) return { ok: true };

  const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id;
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (!customerId || !pm) return { ok: false, error: "card_not_saved" };

  // Make this card the default so later off-session fulfilment (and the one-tap
  // standing offer) charges the card they just entered.
  await stripe().customers.update(customerId, {
    invoice_settings: { default_payment_method: pm },
  });

  const db = createServiceClient();
  // Same backfill as the product checkout: a member may authenticate without
  // ever having had a profile row created for them.
  const email = (await ensureUserProfile(userId))?.email ?? "";

  // The code WE wrote at start, priced again now. Never the amount previewed:
  // between the preview and here a coupon can expire, hit its redemption limit
  // or be deleted, and honouring a discount Stripe no longer recognises means
  // an invoice that will not match the order.
  //
  // A code that has died since is dropped rather than refused. The card is
  // already saved and the buyer is committed; failing the whole purchase over
  // a discount is the worse of the two outcomes, and the order records what
  // was actually charged.
  const savedCode = si.metadata?.couponCode ?? "";
  let coupon: AppliedCoupon | null = null;
  if (savedCode) {
    const res = await resolveCoupon(
      savedCode,
      couponSubtotal(offer, immediateChargeCents(offer)),
      offer.currency,
      { item: offer.key, interval: offer.billingType === "recurring" ? offer.interval : null },
    );
    coupon = res.ok ? res.coupon : null;
  }

  // order_items.order_id is NOT NULL, so a standalone offer still books an
  // order. It is genuinely a $0 order when the offer is a trial.
  //
  // On a subscription the discount is Stripe's to apply — it lands on the first
  // real invoice, not on today's $0 — so the order books the undiscounted
  // charge-now figure and records the code beside it. Taking it off here would
  // book money nobody was charged today.
  // The offer as this coupon sells it. A code carrying trial_days replaces the
  // price's trial, and EVERYTHING the trial decides has to follow it — what
  // Stripe is told, the ownership row's status, the trial recorded as spent,
  // and the money booked here.
  //
  // Booked from `sold`, not `offer`, because that was the bug: a 30-day code
  // on a no-trial $199 yearly wrote $199 onto an order Stripe charged $0 for,
  // and a trial-removing code wrote $0 onto one it billed immediately. The
  // ledger has to agree with the card.
  const sold = offerWithCouponTrial(offer, coupon);

  const gross = immediateChargeCents(sold);
  const discount =
    coupon && sold.billingType !== "recurring"
      ? Math.min(coupon.discountCents, Math.max(0, gross - MIN_CHARGE_CENTS))
      : 0;
  const chargeNow = gross - discount;
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
      status: "paid",
      currency: offer.currency,
      subtotal_cents: gross,
      total_cents: chargeNow,
      coupon_code: coupon?.code ?? null,
      discount_cents: discount,
      stripe_customer_id: customerId,
      buyer_country: normalizeCountry(country) ?? null,
    })
    .select("id")
    .single();
  if (orderErr || !order) return { ok: false, error: "order_failed" };

  let result: { subscriptionId?: string; paymentIntentId?: string };
  try {
    result = await fulfilOffer({
      order: { id: order.id as string, stripeCustomerId: customerId },
      offer: sold,
      paymentMethodId: pm,
      coupon: coupon
        ? { promotionCodeId: coupon.promotionCodeId, discountCents: coupon.discountCents, trialDays: coupon.trialDays }
        : null,
      idempotencyKey: `offerco_${setupIntentId}_${offer.id}`,
    });
  } catch {
    // The card saved but the charge/subscription didn't take. Void the order so
    // it can't read as a completed purchase.
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
    return { ok: false, error: "charge_failed" };
  }

  await grantOfferOwnership(storeId, userId, sold, "grant", result.subscriptionId ?? null, {
    email,
    stripeCustomerId: customerId,
  });
  await db.from("order_items").insert({
    store_id: storeId,
    order_id: order.id,
    kind: "oto",
    offer_id: offer.id,
    description: offer.name,
    amount_cents: chargeNow,
    stripe_subscription_id: result.subscriptionId ?? null,
    stripe_payment_intent_id: result.paymentIntentId ?? null,
  });
  return { ok: true };
}
