import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer } from "@/lib/store";
import { isOfferEligible, immediateChargeCents, offerAtPrice } from "@/lib/offers";
import { priceForChoice, shownPrices } from "@/lib/offer-prices";
import { ownershipFor, fulfilOffer, grantOfferOwnership, customerForUser } from "@/lib/checkout";
import { stripe } from "@/lib/stripe";
import { normalizeCountry } from "@/lib/tax";
import { ensureUserProfile } from "@/lib/users";

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

export async function startOfferCheckout(args: {
  userId: string;
  email: string;
  offerId: string;
  /** Which way to pay — an INDEX into the list this offer's page shows. */
  priceChoice?: number;
}): Promise<StartResult> {
  const offer = await getOffer(args.offerId);
  if (!offer || !offer.active) return { ok: false, error: "That offer isn’t available any more." };

  // The list is rebuilt here from the offer's own page selection, never from
  // the request — the browser sends an index into it and nothing else, so the
  // only thing it can buy is something it was shown. An index outside the list
  // refuses rather than falling back to the headline price.
  const shown = shownPrices(offer.prices, offer.pagePriceIds ?? []);
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

  // order_items.order_id is NOT NULL, so a standalone offer still books an
  // order. It is genuinely a $0 order when the offer is a trial.
  const chargeNow = immediateChargeCents(offer);
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      user_id: userId,
      email,
      status: "paid",
      currency: offer.currency,
      subtotal_cents: chargeNow,
      total_cents: chargeNow,
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
      offer,
      paymentMethodId: pm,
      idempotencyKey: `offerco_${setupIntentId}_${offer.id}`,
    });
  } catch {
    // The card saved but the charge/subscription didn't take. Void the order so
    // it can't read as a completed purchase.
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
    return { ok: false, error: "charge_failed" };
  }

  await grantOfferOwnership(storeId, userId, offer, "grant", result.subscriptionId ?? null, {
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
