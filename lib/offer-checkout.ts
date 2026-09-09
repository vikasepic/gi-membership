import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer, getStoreName } from "@/lib/store";
import { isOfferEligible, shouldShowOffer, immediateChargeCents, offerAtPrice, offerWithCouponTrial } from "@/lib/offers";
import { livePrices, priceForChoice, shownPrices } from "@/lib/offer-prices";
import { ownershipFor, fulfilOffer, fulfilBump, grantOfferOwnership, customerForUser } from "@/lib/checkout";
import { orderForPaymentIntent } from "@/lib/orders";
import { stripe, stripeMode } from "@/lib/stripe";
import { normalizeCountry } from "@/lib/tax";
import { ensureUserProfile } from "@/lib/users";
import { MIN_CHARGE_CENTS, resolveCoupon, type AppliedCoupon } from "@/lib/coupons";
import { offerAsSoldTo } from "@/lib/trial-history";
import { recordError, messageOf } from "@/lib/errors";
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
       * cardholder is there for. A recurring offer opens a SetupIntent
       * instead, whatever it charges today — a trial is genuinely $0, and a
       * no-trial price bills its first period through the subscription
       * itself rather than this intent, but either way a $0 PaymentIntent is
       * not a thing Stripe will make, so the card is saved here regardless.
       * Getting this wrong is how a no-trial recurring offer's Elements
       * mismatch was written in the first place — see checkout-form.tsx's own
       * comment on the same bug on the product side.
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
  // The PRICE they ticked, not just the offer — shownPrices can show more than
  // one, so bumpChoice: 1 is a real purchase. Carried to metadata below so
  // completion reads back which one, instead of assuming the first.
  let bumpPriceId: string | null = null;
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
    bumpPriceId = price.id;
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
    const amount = gross - discount + bumpNowCents;
    // Stripe refuses a PaymentIntent below its own minimum outright — and
    // book-launch-system is priced 0 in production right now. Left unchecked,
    // `paymentIntents.create` below throws, and nothing between here and the
    // browser catches it: the form's onSubmit awaits this server action with
    // no try/catch of its own, so the throw becomes an unhandled rejection
    // and `setBusy(false)` never runs — the button sits on "Processing"
    // forever with no message on screen. Refusing here, before Stripe ever
    // sees it, is the only version of this that tells the buyer anything.
    if (amount < MIN_CHARGE_CENTS) {
      return {
        ok: false,
        error: "This offer isn’t available to buy right now. Please contact us and we’ll sort it out.",
      };
    }
    // Belt and braces beyond the floor check above: ANY Stripe error here
    // (a network blip, a bad customer id, a rate limit) must come back as a
    // result, not a throw, for exactly the reason above — there is nothing
    // downstream of this server action that catches an exception.
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe().paymentIntents.create({
        amount,
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
          // The exact price they ticked — offerPriceId's counterpart for the
          // bump. Without this, completion had no way to tell bumpChoice: 1 from
          // bumpChoice: 0 and simply assumed the first price the placement shows.
          bumpPriceId: bumpOffer ? (bumpPriceId ?? "") : "",
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
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not start checkout." };
    }
    if (!pi.client_secret) return { ok: false, error: "Could not start checkout." };
    return { ok: true, clientSecret: pi.client_secret, customerId, mode: "payment" };
  }

  let si: Stripe.SetupIntent;
  try {
    si = await stripe().setupIntents.create({
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
      description,
      metadata,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start checkout." };
  }
  if (!si.client_secret) return { ok: false, error: "Could not start checkout." };
  return { ok: true, clientSecret: si.client_secret, customerId, mode: "setup" };
}

// Called on return from Stripe. Idempotent: the eligibility re-check short-
// circuits a refresh, and the fulfilment key is derived from the intent id
// (whichever kind — see below), so Stripe itself refuses to create a second
// subscription even under a race.
//
// `orderId` rides the success return so the caller can resolve this order's
// own upsell directly (resolveOtoForOfferOrder, lib/checkout.ts) rather than
// asking Stripe to retrieve `intentId` again and read its metadata — the
// mechanism resolveOtoForOrder uses for the PRODUCT path, which cannot work
// here: a recurring offer's order carries neither stripe_payment_intent_id
// nor stripe_setup_intent_id (see the order insert below for why the latter
// is never written), so that lookup always came back empty for exactly the
// case an upsell exists to serve. Present on every ok:true return, including
// the eligibility short-circuit just below on the PAID path — see the comment
// there for why that path needs it too. Absent only for a recurring offer's
// short-circuit, which has no PaymentIntent to look an order up by.
export async function completeOfferCheckout(
  intentId: string,
  country?: string,
): Promise<{ ok: true; orderId?: string } | { ok: false; error: string }> {
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

  // A refresh of the return page lands here again — by then they own it. So
  // does the Stripe webhook: it calls this same function for every offer
  // PaymentIntent (route.ts), racing the buyer's own trip back through
  // /checkout/offer/complete. When the webhook wins that race, THIS call is
  // the buyer's only visit here, not a refresh of an earlier one — so on the
  // paid path, resolve the order the webhook already wrote (findable by
  // intent id, same as finalizeOrder's callers use) and hand its id back so
  // the caller still gets its shot at the OTO. Without this the upsell was
  // silently lost every time the webhook happened to land first.
  //
  // The recurring (SetupIntent) path never races a webhook — no PaymentIntent
  // means the webhook's `if (pi.metadata?.offerId)` branch never runs for it
  // — so there is nothing to look up there and no id is returned; that path's
  // OTO chance is still the one grant on the call that actually created the
  // subscription, same as before.
  const owned = await ownershipFor(userId);
  if (!isOfferEligible(offer, owned)) {
    const existing = paid ? await orderForPaymentIntent(intentId) : null;
    return { ok: true, orderId: existing?.id };
  }

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
  // the buyer was never actually shown or charged. Fetched and kept (bumpRaw)
  // rather than just the cents figure: the fulfilment call further down reuses
  // this exact object instead of fetching the same row again a moment later.
  const bumpOfferId = si.metadata?.bumpOfferId ?? "";
  // Whether a bump was resolved, not whether it cost anything — see the
  // matching comment in startOfferCheckout. Always "true" whenever
  // bumpOfferId is set on this path; read back once here rather than three
  // times below.
  const bumpPrepaid = si.metadata?.bumpPrepaid === "true";
  let bumpRaw: Offer | null = null;
  let bumpNowCents = 0;
  if (bumpOfferId) {
    bumpRaw = await getOffer(bumpOfferId);
    // Mirrors fulfilBump's own guard below: a bump withdrawn since checkout
    // gets no order line from fulfilBump, so the ledger must not book one either.
    if (bumpRaw?.active) {
      // The price chosen at start, read back from metadata WE wrote — never
      // assumed to be index 0: shownPrices can show more than one price for
      // one placement, so bumpChoice: 1 is a real purchase resolving to a
      // different price than bumpChoice: 0. Falls back to the placement's
      // first price when the id is missing (an intent from before this field
      // existed) or has since been archived — the same fallback shape
      // offerPriceId uses for the host's own price above.
      const bumpOptions = shownPrices(bumpRaw.prices, raw.bumpPriceIds ?? []);
      const wantBumpPriceId = si.metadata?.bumpPriceId ?? "";
      const bumpPrice =
        (wantBumpPriceId ? bumpOptions.find((p) => p.id === wantBumpPriceId && !p.archived) : null) ??
        bumpOptions[0] ??
        null;
      bumpNowCents = immediateChargeCents(offerAtPrice(bumpRaw, bumpPrice));
    }
  }
  // Paid for (bumpPrepaid, above) but not resolvable any more — an admin
  // deactivated it between start and completion. The card already took its
  // money as part of the single intent above, so this can't just vanish: see
  // the recordError call near the bottom of this function.
  const bumpUnresolved = Boolean(bumpOfferId) && bumpPrepaid && !bumpRaw?.active;

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
      // The winner already booked this purchase. orderId is still handed
      // back — it is a real, paid order — but its host order_items row is
      // not GUARANTEED to exist yet: "paid" is set the instant the winner's
      // insert lands, before that row is written (see hostOfferIdFor's own
      // comment on the window this opens). resolveOtoForOfferOrder fails
      // closed on that (no host row → no upsell shown) rather than guessing,
      // so the worst case here is a missed upsell, never a wrong one.
      if (existing.status === "paid") return { ok: true, orderId: existing.id as string };
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
      // Someone else reclaimed it first, and is mid-fulfilment right now —
      // same "host row may not exist yet" caveat as the already-paid branch
      // above, for the same reason.
      if (!reclaimed || reclaimed.length === 0) return { ok: true, orderId: existing.id as string };
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
    // Nothing after the order_items insert lives inside this try — the bump
    // is fulfilled separately, below, OUTSIDE it, for exactly the reason this
    // one exists: a purchase that actually finished (grant done, line
    // written) can never be the one this catches — only one where that work
    // did not complete.
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
      // The HOST's share alone, not the combined total — fulfilBump, further
      // below once this try succeeds, writes the bump's own line at its own
      // amount, and the two must sum to total_cents. Equal to totalCents
      // whenever bumpNowCents is 0 (no bump, on every path except a bumped
      // paid one), so this is a no-op rename everywhere except the purchase
      // this task exists to fix.
      amount_cents: totalCents - bumpNowCents,
      stripe_subscription_id: result.subscriptionId ?? null,
      stripe_payment_intent_id: result.paymentIntentId ?? null,
    });
  } catch (e) {
    // The card saved (and may already be charged or subscribed) but
    // fulfilment did not finish — granting access or recording the line can
    // be what failed just as much as the charge itself. Void the order so
    // it can't read as a completed purchase; the reclaim branch above picks
    // a "failed" row back up and runs this whole block again, which is safe
    // for the reasons above.
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    // LOG-ONLY: no jobKind/jobPayload, exactly as the bump's own unresolvable
    // branch below does it — there is no sweep job for "retry this order's
    // fulfilment". The retry IS this function running again: the webhook
    // route throws on the paid-path failure key below so Stripe redelivers,
    // and the reclaim branch above picks the "failed" row back up when it
    // does. What was missing was not a retry mechanism but an ALERT — on the
    // paid path the card is already charged by the time this catch runs, so a
    // silent void here was money taken with no order, no ownership, and
    // nothing on the admin's unresolved-errors badge. Unlike the two bump
    // failure paths below, which both call recordError, this one never did.
    await recordError({
      source: "offer_checkout",
      message: `Offer fulfilment failed after the order was claimed, voided for a retry to reclaim: ${messageOf(e)}`,
      context: { intentId, orderId, userId, amountCents: totalCents },
    });
    // The setup path (a saved card, usually not yet charged — see the trial
    // comment at the top of this file) keeps saying so; this branch did not
    // touch it. The paid path gets its own key: by the time this catch can
    // run, the PaymentIntent above has already succeeded, so "nothing was
    // charged" is no longer true and must never be shown to someone who has,
    // in fact, just paid.
    return { ok: false, error: paid ? "grant_failed" : "charge_failed" };
  }

  // The bump the buyer ticked, whose money is already in the intent above.
  // fulfilBump is the same function the product checkout uses — it grants,
  // writes exactly one order line however many times it runs, and charges
  // nothing when prepaid.
  //
  // Deliberately its OWN try/catch, separate from the host's above, and NEVER
  // rethrown — exactly the shape finalizeOrder (lib/checkout.ts) already uses
  // for the product checkout's own bump. The host is bought and paid for by
  // the time we get here (the try above already succeeded); an add-on that
  // could not be granted must not undo that or void an order that genuinely
  // completed. It used to sit INSIDE the try above, so a throw here — plainly
  // reachable, since grantOfferOwnership really can throw — voided the whole
  // order instead: the host's ownership row was already written, so the next
  // delivery (a webhook redelivery, the buyer reloading the return page) hit
  // the eligibility check at the top of this function and returned
  // { ok: true } without ever retrying the bump. Charged for host and bump,
  // granted only the host, told success.
  if (bumpOfferId && bumpRaw?.active) {
    try {
      await fulfilBump({
        orderId,
        storeId,
        userId,
        email,
        stripeCustomerId: customerId,
        offerId: bumpOfferId,
        // Already fetched above, fresh, to price the ledger — not fetched
        // again here.
        offer: bumpRaw,
        // The placement's price, not the bump's headline — see the
        // computation above.
        amountCents: bumpNowCents,
        paymentMethodId: pm,
        prepaid: bumpPrepaid,
        paidByIntentId: paid ? si.id : null,
      });
    } catch (e) {
      await recordError({
        source: "bump_charge",
        message: `Could not charge the order bump: ${e instanceof Error ? e.message : String(e)}`,
        context: { orderId, offerId: bumpOfferId },
        jobKind: "bump_charge",
        jobPayload: {
          orderId,
          storeId,
          userId,
          email,
          stripeCustomerId: customerId,
          offerId: bumpOfferId,
          paymentMethodId: pm,
          prepaid: bumpPrepaid,
          paidByIntentId: paid ? si.id : null,
          amountCents: bumpNowCents,
        },
      });
    }
  } else if (bumpUnresolved) {
    // The bump's money is already folded into totalCents above (the
    // Math.max clamp books it against the host's own line, because the order
    // still has to add up to what Stripe actually charged) but nothing was
    // granted for it, and fulfilBump would just no-op silently for the same
    // reason it never ran above. Recorded the same way a failed fulfilBump is
    // — so a human sees "this order's host line includes money for a bump
    // that was never granted" instead of a clean-looking order that quietly
    // absorbed it.
    //
    // LOG-ONLY: no jobKind/jobPayload. recordError only queues a retry when
    // BOTH are given. The offer is inactive BY DEFINITION in this branch, and
    // fulfilBump returns quietly rather than throwing on an inactive offer
    // (its own "nothing here a retry can fix" guard) — so a queued copy of
    // this would reach the sweep, throw nothing, and get stamped
    // resolved_at within a minute, exactly as if it had succeeded. That
    // erases the one thing this record exists to do: stay on the admin's
    // unresolved list until a human looks at it. Everything a retry payload
    // would have carried is folded into the message/context below instead,
    // since a log-only row keeps no job_payload to hold it.
    await recordError({
      source: "bump_charge",
      message:
        `Could not resolve the order bump: offer ${bumpOfferId} is no longer active. ` +
        `Buyer ${email} was already charged ${totalCents / 100} ${offer.currency.toUpperCase()} total, ` +
        `which silently absorbed whatever the bump should have cost — grant it by hand or refund the difference.`,
      context: { orderId, offerId: bumpOfferId, email, totalCents, currency: offer.currency },
    });
  }

  return { ok: true, orderId };
}
