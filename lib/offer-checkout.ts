import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer, getStoreName } from "@/lib/store";
import { isOfferEligible, shouldShowOffer, immediateChargeCents, offerAtPrice, offerWithCouponTrial } from "@/lib/offers";
import { livePrices, priceForChoice, shownPrices } from "@/lib/offer-prices";
import { ownershipFor, fulfilOffer, fulfilBump, grantOfferOwnership, customerForUser } from "@/lib/checkout";
import { stripe, stripeMode } from "@/lib/stripe";
import { normalizeCountry } from "@/lib/tax";
import { ensureUserProfile } from "@/lib/users";
import { MIN_CHARGE_CENTS, resolveCoupon, type AppliedCoupon } from "@/lib/coupons";
import { offerAsSoldTo } from "@/lib/trial-history";
import type { Offer } from "@/lib/types";

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
  | {
      ok: true;
      clientSecret: string;
      customerId: string;
      /**
       * Which Stripe object the form must confirm.
       *
       * A one-time offer takes money today, so the buyer confirms a payment
       * while they are present — no mandate is needed for a payment the
       * cardholder is there for. A recurring offer takes nothing today (a
       * trial is genuinely $0, and a $0 PaymentIntent is not a thing Stripe
       * will make), so the card is saved and the subscription bills itself.
       */
      mode: "payment" | "setup";
    }
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
  /** Which bump price they ticked — an INDEX into the list the page drew. */
  bumpChoice?: number | "none";
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
  // The chosen price, resolved ONCE. It used to be derived four separate times
  // in this function — this guard, the coupon block, `sold` (behind a
  // non-null assertion whose safety depended on this guard having already
  // run), and the metadata — and four independent derivations of one value is
  // where one of them drifts.
  const chosenPrice = args.priceChoice !== undefined ? priceForChoice(shown, args.priceChoice) : null;
  if (args.priceChoice !== undefined && !chosenPrice) {
    return { ok: false, error: "That option is no longer available." };
  }
  // The offer as this checkout is actually selling it, before any coupon.
  const priced = chosenPrice ? offerAtPrice(offer, chosenPrice) : offer;

  // Never sell someone what they already have.
  const owned = await ownershipFor(args.userId);
  if (!isOfferEligible(offer, owned)) {
    return { ok: false, error: "You already have this." };
  }

  // The bump, resolved by the same rules the product checkout uses — and with
  // the same helpers, so display and fulfilment cannot disagree.
  let bumpOffer: Offer | null = null;
  if (args.bumpChoice !== undefined && args.bumpChoice !== "none" && offer.bumpOfferId) {
    // A bump's money only has an on-session PaymentIntent to ride. A recurring
    // offer opens a SetupIntent instead, which takes no money today, so there
    // is nothing to fold the bump's charge into and no on-session moment to
    // take it in. Refusing beats silently taking the tickbox and then
    // charging (and granting) nothing for it.
    if (priced.billingType !== "one_time") {
      return {
        ok: false,
        error: "That add-on can't be added with this price. Choose the one-time price, or untick the add-on to continue.",
      };
    }
    const shownBump = await getOffer(offer.bumpOfferId);
    // The options come from THIS offer's placement, never from the request.
    const options = shownBump ? shownPrices(shownBump.prices, offer.bumpPriceIds ?? []) : [];
    const price = priceForChoice(options, args.bumpChoice);
    // Out of range REFUSES. Charging somebody for a thing they did not choose
    // is the failure this rule exists to prevent.
    if (!price || !shownBump) {
      return {
        ok: false,
        error: "That add-on option is no longer available. Choose another and try again.",
      };
    }
    const picked = offerAtPrice(shownBump, price);
    const asSold = await offerAsSoldTo(args.email, picked);
    if (!shouldShowOffer(asSold, owned)) {
      // Refuse rather than drop it silently: quietly discarding it charges for
      // the offer and ignores what they ticked, with nothing on the receipt.
      return {
        ok: false,
        error: "You already have the add-on you selected, so it can't be added again. Untick it to continue.",
      };
    }
    // Belt and braces: saveOffer refuses a recurring offer into the bump slot,
    // but this one may have been one-time when placed and changed since.
    if (asSold.billingType !== "one_time") {
      return { ok: false, error: "That add-on can't be bought here. Untick it to continue." };
    }
    bumpOffer = asSold;
  }

  const storeId = await getStoreId();
  const customerId = await customerForUser(args.userId, args.email, storeId);

  // Resolved now so a dead code fails while they can still see the field,
  // rather than after the card is saved and there is no form left to say it on.
  // The RESULT is not carried — only the code — because the amount is worked
  // out again at fulfilment against the offer as it stands then.
  let coupon: AppliedCoupon | null = null;
  if (args.couponCode?.trim()) {
    const res = await resolveCoupon(
      args.couponCode,
      couponSubtotal(priced, immediateChargeCents(priced)),
      priced.currency,
      { item: priced.key, interval: priced.billingType === "recurring" ? priced.interval : null },
    );
    if (!res.ok) return { ok: false, error: res.error };
    coupon = res.coupon;
  }

  // The offer as this checkout actually sells it — a code carrying trial_days
  // replaces the price's own, and that is what has to decide whether today's
  // intent is a charge or a save.
  const sold = offerWithCouponTrial(priced, coupon);

  // The metadata is identical on both objects: completeOfferCheckout reads the
  // same keys back whichever kind came back, and it is written by US rather
  // than copied out of the request.
  const metadata = {
    store_created: "true",
    storeId,
    userId: args.userId,
    offerId: offer.id,
    offerPriceId: chosenPrice?.id ?? "",
    // The code, not the discount. An amount written here would be an amount
    // the browser could have influenced at preview time.
    couponCode: coupon?.code ?? "",
    // Whether THIS checkout created the account. Read on the way back to
    // decide whether a session may be handed out — see mintOfferLogin.
    newAccount: args.isNewAccount ? "true" : "false",
  };
  const description = `${offer.name} — ${await getStoreName()}`;

  // A one-time offer is charged HERE, on-session, for the amount on the
  // button. It used to save the card and charge it afterwards off-session,
  // which Stripe refuses outright on a card issued in India without an RBI
  // e-mandate — so the buyer was charged nothing and granted nothing, with no
  // error anybody saw. `setup_future_usage` keeps the card on file, which is
  // what the library's one-tap standing offer needs.
  if (sold.billingType === "one_time") {
    const gross = immediateChargeCents(sold);
    const discount = coupon ? Math.min(coupon.discountCents, Math.max(0, gross - MIN_CHARGE_CENTS)) : 0;
    // One charge, on-session, for the amount on the button. A second charge
    // afterwards is what Stripe refuses on an India-issued card without an
    // e-mandate — and it would also mean the figure the buyer agreed to and
    // the figure their card saw were never the same number.
    const bumpNowCents = bumpOffer ? immediateChargeCents(bumpOffer) : 0;
    const pi = await stripe().paymentIntents.create({
      amount: gross - discount + bumpNowCents,
      currency: sold.currency,
      customer: customerId,
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true },
      description,
      metadata: {
        ...metadata,
        discountCents: String(discount),
        bumpOfferId: bumpOffer?.id ?? "",
        // The bump's own name, not just its id. There is no second intent on
        // this path to carry it — without this a bump riding the host's
        // charge is indistinguishable from a host-only sale of the same total
        // in the dashboard, in exports, and in Zapier (which can only filter
        // on what Stripe holds). Same reason productTitle/offerName ride
        // alongside their own ids in lib/checkout.ts, the product side of
        // this same checkout.
        bumpOfferName: bumpOffer?.name ?? "",
        // Whether a bump was resolved, not whether it cost anything — a
        // genuinely $0 bump (a free add-on) is still fully paid for by THIS
        // intent, because there is nothing left to take. Keying this off
        // `bumpNowCents > 0` instead left a $0 bump indistinguishable from no
        // bump at all, and fulfilment is meant to read bumpPrepaid === "true"
        // to skip its own off-session charge for it — the exact off_session
        // PaymentIntent this checkout exists to avoid (Stripe refuses it
        // outright on an India-issued card with no e-mandate). Written by us
        // now, for that reader to trust later.
        bumpPrepaid: bumpOffer ? "true" : "",
      },
    });
    if (!pi.client_secret) return { ok: false, error: "Could not start checkout." };
    return { ok: true, clientSecret: pi.client_secret, customerId, mode: "payment" };
  }

  const si = await stripe().setupIntents.create({
    customer: customerId,
    usage: "off_session",
    automatic_payment_methods: { enabled: true },
    description,
    metadata,
  });
  if (!si.client_secret) return { ok: false, error: "Could not start checkout." };
  return { ok: true, clientSecret: si.client_secret, customerId, mode: "setup" };
}

// Called on return from Stripe. Idempotent: the eligibility re-check short-
// circuits a refresh, and the fulfilment key is derived from the intent id
// (whichever kind — see below), so Stripe itself refuses to create a second
// subscription even under a race.
export async function completeOfferCheckout(
  intentId: string,
  country?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Either kind. A one-time offer is paid for on-session, so the money is
  // already taken by the time the buyer lands back here; a recurring one saved
  // a card and its subscription is created below. Anything else is refused
  // rather than guessed at — a wrong retrieve would throw on a completed
  // purchase, which is the worst outcome available.
  const paid = intentId.startsWith("pi_");
  if (!paid && !intentId.startsWith("seti_")) {
    return { ok: false, error: "unknown_intent" };
  }
  const si = paid
    ? await stripe().paymentIntents.retrieve(intentId)
    : await stripe().setupIntents.retrieve(intentId);
  if (si.status !== "succeeded") return { ok: false, error: "card_not_saved" };

  const userId = si.metadata?.userId;
  const offerId = si.metadata?.offerId;
  const storeId = si.metadata?.storeId;
  if (!userId || !offerId || !storeId) return { ok: false, error: "unknown_intent_metadata" };

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

  // The bump's own charge-now figure, resolved the SAME WAY startOfferCheckout
  // resolved it: from THIS HOST's placement (raw.bumpPriceIds), never the bump
  // offer's own headline. A host may place its bump at a price other than that
  // offer's headline one — getOffer(bumpOfferId) alone returns the headline —
  // so reading immediateChargeCents straight off it here would book a figure
  // the buyer was never actually shown or charged.
  const bumpOfferId = si.metadata?.bumpOfferId ?? "";
  let bumpNowCents = 0;
  if (bumpOfferId) {
    const bumpRaw = await getOffer(bumpOfferId);
    // Mirrors fulfilBump's own guard below: a bump withdrawn since checkout
    // gets no order line from fulfilBump, so the ledger must not book one either.
    if (bumpRaw?.active) {
      const bumpPrice = shownPrices(bumpRaw.prices, raw.bumpPriceIds ?? [])[0] ?? null;
      bumpNowCents = immediateChargeCents(offerAtPrice(bumpRaw, bumpPrice));
    }
  }

  // What the card was actually charged. On the paid path that is the intent's
  // own amount, never `chargeNow`/`gross` recomputed above — a coupon that died
  // or a price that moved between opening the form and paying would otherwise
  // book a total the card was never charged. `si.object` is the discriminant
  // Stripe puts on both types (checking it rather than `paid` narrows `si` for
  // the `.amount` read below with no cast needed — and by the time we're here
  // `paid` true implies this anyway, since a mismatched retrieve would already
  // have thrown). The setup path takes nothing today, so `chargeNow` (today's
  // genuine figure — often $0, on a trial) is the honest number there.
  const totalCents = si.object === "payment_intent" ? si.amount : chargeNow;
  // The host's price plus the bump's — same shape as the product checkout's
  // subtotal_cents (lib/checkout.ts, `listCents + bumpNowCents`). Never below
  // what was actually charged, so a price cut between opening the form and
  // paying cannot turn into a negative discount just below.
  const subtotalCents = paid ? Math.max(gross + bumpNowCents, totalCents) : gross + bumpNowCents;
  // Recomputed from the real charge, not from the coupon, so the row still
  // adds up (subtotal - discount = total) even when the intent and `subtotal`
  // disagree. Using the coupon's own `discount` here on the paid path would
  // leave that gap silently unaccounted for on the order and on the receipt —
  // and, before `subtotal` above accounted for the bump, this was `gross -
  // totalCents`: negative on every bumped purchase, since totalCents included
  // the bump's money and gross alone never did.
  const discountCents = paid ? subtotalCents - totalCents : discount;
  const { data: inserted, error: orderErr } = await db
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
      subtotal_cents: subtotalCents,
      total_cents: totalCents,
      coupon_code: coupon?.code ?? null,
      discount_cents: discountCents,
      stripe_customer_id: customerId,
      // The payment that took the money, so purchaseSummary can find this
      // order by it — and, on the paid path, the claim this insert races on
      // below (orders_payment_intent_idx, 0070) when the webhook and the
      // return route land at once. NOT the SetupIntent: that column is
      // uniquely indexed (0055) and this function mints a fresh order per
      // visit, so recording it would make a retry after a failed fulfilment
      // collide for ever.
      stripe_payment_intent_id: paid ? si.id : null,
      buyer_country: normalizeCountry(country) ?? null,
    })
    .select("id")
    .single();

  // The claim. The webhook and the return route both reach this insert for
  // the same PaymentIntent — Stripe fires them independently, not in
  // sequence — and the eligibility check above only guards SEQUENTIAL
  // re-entry, not this. orders_payment_intent_idx (0070) turns the loser's
  // insert into a 23505 instead of a second `orders` row for one charge; only
  // the paid path sets stripe_payment_intent_id, so only it can collide here.
  let orderId: string;
  if (orderErr) {
    if (orderErr.code === "23505" && paid) {
      const { data: existing, error: readErr } = await db
        .from("orders")
        .select("id, status")
        .eq("stripe_payment_intent_id", si.id)
        .single();
      if (readErr || !existing) return { ok: false, error: "order_failed" };
      if (existing.status === "paid") return { ok: true }; // the winner already booked this purchase
      if (existing.status !== "failed") return { ok: false, error: "order_failed" };
      // The winner claimed this row, then fulfilOffer threw and the catch
      // below voided it, before this call ever reached the insert. Reclaim
      // and retry rather than refuse: a unique index paired with a voided
      // row that can never be retried is exactly the bug an earlier task on
      // this branch shipped (order_failed for ever, buyer sees a blank
      // page). Nothing to undo first — ownership and order_items are only
      // written after fulfilOffer succeeds, so the voided attempt granted
      // nothing.
      //
      // The reclaim itself has to be its own claim, not a bare update: with
      // three or more calls for one intent (a claim-then-fail, then two
      // redeliveries racing each other — a webhook retry against the buyer
      // reloading the return page, say) both could read "failed" here
      // before either writes "paid". An unguarded update would let both
      // fall through into fulfilment for the one order — order_items has no
      // unique constraint the way the orders insert above does, so that's a
      // duplicate line on one real charge, not just a duplicate row that
      // gets cleaned up. Scoped to "failed" and read back via .select("id"):
      // only the caller whose update actually matched a row goes on to
      // fulfil. The other lost the race and stops here, exactly like the
      // already-paid branch above.
      const { data: reclaimed, error: reclaimErr } = await db
        .from("orders")
        .update({ status: "paid" })
        .eq("id", existing.id as string)
        .eq("status", "failed")
        .select("id");
      if (reclaimErr) return { ok: false, error: "order_failed" };
      if (!reclaimed || reclaimed.length === 0) return { ok: true }; // someone else reclaimed it first
      orderId = existing.id as string;
    } else {
      return { ok: false, error: "order_failed" };
    }
  } else {
    if (!inserted) return { ok: false, error: "order_failed" };
    orderId = inserted.id as string;
  }

  try {
    const result = await fulfilOffer({
      order: { id: orderId, stripeCustomerId: customerId },
      offer: sold,
      paymentMethodId: pm,
      coupon: coupon
        ? { promotionCodeId: coupon.promotionCodeId, discountCents: coupon.discountCents, trialDays: coupon.trialDays }
        : null,
      idempotencyKey: `offerco_${intentId}_${offer.id}`,
      // The money is in the intent the buyer just confirmed.
      prepaid: paid,
    });

    // Granting and the ledger line live inside the SAME try as the charge/
    // subscription, not after it. grantOfferOwnership really can throw — a
    // non-23505 ownership error, or (for a subscription grant) the network
    // push to a connected app — and it used to sit outside this catch: a
    // throw there left the order "paid" for ever with no ownership row, and
    // every later delivery (a webhook redelivery, the buyer reloading the
    // return page) hit the already-paid branch above and returned
    // { ok: true } without ever retrying the grant. Told success, and never
    // got it.
    //
    // Safe to void even though fulfilOffer already ran: on the paid path it
    // was a no-op (the money moved in the buyer's own PaymentIntent, not
    // here), and on the recurring path it created the subscription under an
    // idempotency key derived from the intent id, so calling it again on
    // retry hands back the SAME subscription rather than a second one.
    // Nothing after the order_items insert lives inside this try, so a
    // purchase that actually finished (grant done, line written) can never
    // be the one this catches — only one where that work did not complete.
    await grantOfferOwnership(storeId, userId, sold, "grant", result.subscriptionId ?? null, {
      email,
      stripeCustomerId: customerId,
    });
    await db.from("order_items").insert({
      store_id: storeId,
      order_id: orderId,
      kind: "oto",
      offer_id: offer.id,
      description: offer.name,
      // The HOST's share alone, not the combined total — fulfilBump just below
      // writes the bump's own line at its own amount, and the two must sum to
      // total_cents. Equal to totalCents whenever bumpNowCents is 0 (no bump,
      // on every path except a bumped paid one), so this is a no-op rename
      // everywhere except the purchase this task exists to fix.
      amount_cents: totalCents - bumpNowCents,
      stripe_subscription_id: result.subscriptionId ?? null,
      stripe_payment_intent_id: result.paymentIntentId ?? null,
    });

    // The bump the buyer ticked, whose money is already in the intent above.
    // fulfilBump is the same function the product checkout uses — it grants,
    // writes exactly one order line however many times it runs, and charges
    // nothing when prepaid.
    if (bumpOfferId) {
      await fulfilBump({
        orderId,
        storeId,
        userId,
        email,
        stripeCustomerId: customerId,
        offerId: bumpOfferId,
        paymentMethodId: pm,
        prepaid: si.metadata?.bumpPrepaid === "true",
        paidByIntentId: paid ? si.id : null,
      });
    }
  } catch {
    // The card saved (and may already be charged or subscribed) but
    // fulfilment did not finish — granting access or recording the line can
    // be what failed just as much as the charge itself. Void the order so
    // it can't read as a completed purchase; the reclaim branch above picks
    // a "failed" row back up and runs this whole block again, which is safe
    // for the reasons above.
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return { ok: false, error: "charge_failed" };
  }
  return { ok: true };
}
