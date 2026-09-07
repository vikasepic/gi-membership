"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { priceTerms, type OfferPrice } from "@/lib/offer-prices";

/**
 * The trial that will actually run, shared by the two halves of the checkout.
 *
 * A promotion code carrying `trial_days` REPLACES the price's own — the live
 * CE1M26 gives 30 against a price whose trial is 7 — and only the form can know
 * one has been applied, because a coupon is client state while the selling half
 * is rendered on the server from `offer.trialDays`. So the two halves stated
 * different trials at once: "30 days free" beside the card fields and "7-day
 * free trial" on the panel, on one screen, with no way to tell which the card
 * would honour.
 *
 * One value, published by the one component that can work it out. The form owns
 * `coupon.trialDays ?? price.trialDays` — the same expression the subscription
 * hands Stripe — and everything that states a trial reads the answer rather
 * than deriving it again. Two readers doing their own arithmetic off different
 * inputs is exactly how they came to disagree.
 *
 * Seeded on the server with the offer's own trial, so a buyer with no code
 * reads the right number in the first HTML sent and never needs JavaScript for
 * it. Nothing here reaches Stripe: this is what the page SAYS.
 */
type Trial = {
  /** Days, or null for no trial. Zero is a real answer — a code can remove one. */
  days: number | null;
  publish: (days: number | null) => void;
};

const Ctx = createContext<Trial>({ days: null, publish: () => {} });

export function CheckoutTrial({ days, children }: { days: number | null; children: ReactNode }) {
  const [live, setLive] = useState<number | null>(days);
  return <Ctx.Provider value={{ days: live, publish: setLive }}>{children}</Ctx.Provider>;
}

/** The trial that will actually run. Null or zero both mean there is none. */
export function useTrialDays(): number | null {
  return useContext(Ctx).days;
}

/**
 * Publish what the form worked out.
 *
 * An effect, not a render-time call: it writes to a provider ABOVE this
 * component, and React may not be told about that during a render.
 */
export function usePublishTrialDays(days: number | null): void {
  const { publish } = useContext(Ctx);
  useEffect(() => {
    publish(days);
  }, [publish, days]);
}

/**
 * The pill above the stage's title — `Content Engine · 30-day free trial`.
 *
 * Terms as a label, never a claim: an offer with no trial (or a code that took
 * it away) is named on its own rather than promising one.
 */
export function TrialEyebrow({ name }: { name: string }) {
  const days = useTrialDays();
  return <>{days ? `${name} · ${days}-day free trial` : name}</>;
}

/** The stage's caption — `30 days free, then $29.00 every month, cancel any time`. */
export function TrialPriceTerms({ price, currency }: { price: OfferPrice; currency: string }) {
  const days = useTrialDays();
  return <>{priceTerms(price, currency, days)}</>;
}
