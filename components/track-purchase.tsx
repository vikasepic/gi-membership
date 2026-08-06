"use client";

import { useEffect, useRef } from "react";
import { track, adsConversion } from "@/components/analytics";
import { eventIdFor } from "@/lib/analytics/events";

/**
 * The browser half of a completed purchase.
 *
 * The server sends the same events with the same ids from finalizeOrder, which
 * is what makes them survive a buyer who closes the tab on the redirect. Meta
 * deduplicates on the id, so this is extra signal rather than a second sale.
 *
 * The ids are derived from the order, so both halves compute the same value
 * without either telling the other — the page and the webhook never speak.
 *
 * GA4 gets nothing here on purpose: it does not deduplicate, and a purchase
 * reported from a page AND a webhook is two purchases and a revenue figure
 * nobody can reconcile afterwards.
 */
export function TrackPurchase({
  orderId,
  valueCents,
  currency,
  trialCents,
  email,
  adsLabel,
}: {
  orderId: string;
  /** What was actually charged today. */
  valueCents: number;
  currency: string;
  /** The recurring value of any trial started on this order, if there was one. */
  trialCents?: number | null;
  email?: string | null;
  adsLabel?: string | null;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    track(
      "Purchase",
      { value: valueCents / 100, currency: currency.toUpperCase(), order_id: orderId },
      eventIdFor("Purchase", orderId),
    );

    // A trial is not a purchase — no money moved today. Reported separately so
    // Meta can be told to optimise for trials that convert rather than for
    // people who collect free ones.
    if (trialCents) {
      track(
        "StartTrial",
        { value: trialCents / 100, currency: currency.toUpperCase(), predicted_ltv: trialCents / 100 },
        eventIdFor("StartTrial", orderId),
      );
    }

    if (adsLabel) {
      adsConversion(adsLabel, { valueCents, currency, orderId, email });
    }
  }, [orderId, valueCents, currency, trialCents, email, adsLabel]);

  return null;
}
