"use client";

import { useEffect, useRef } from "react";
import { track, adsConversion, trackNamedCustom } from "@/components/analytics";
import { eventIdFor, customEventIdFor } from "@/lib/analytics/events";
import { stripeAttributionMetadata, type Attribution } from "@/lib/attribution";

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
  customEvent,
  attribution,
  contentName,
  contentIds,
}: {
  orderId: string;
  /** What was actually charged today. */
  valueCents: number;
  currency: string;
  /** The recurring value of any trial started on this order, if there was one. */
  trialCents?: number | null;
  email?: string | null;
  adsLabel?: string | null;
  /**
   * This funnel's own event name, from the product row. One pixel serves
   * several funnels, so the ads team reports on a named event per funnel
   * rather than trying to split one Purchase between campaigns.
   */
  customEvent?: { name: string; contentName: string } | null;
  /** Off the order row, via the receipt — never off the URL. Same keys the server copy sends. */
  attribution?: Attribution | null;
  /** What was bought, so the copy Meta keeps names a product. Both off the receipt. */
  contentName?: string | null;
  contentIds?: string[];
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const campaign = stripeAttributionMetadata(attribution);
    // What was bought, on the standard events too — not only on the custom one.
    // Meta keeps whichever copy of a deduplicated event arrives first, and on
    // unblocked traffic that is this one; without these the surviving Purchase
    // named no product.
    const content = {
      ...(contentName ? { content_name: contentName } : {}),
      ...(contentIds?.length
        ? { content_ids: contentIds, content_type: "product", num_items: contentIds.length }
        : {}),
    };

    track(
      "Purchase",
      {
        value: valueCents / 100,
        currency: currency.toUpperCase(),
        order_id: orderId,
        ...content,
        ...campaign,
      },
      eventIdFor("Purchase", orderId),
    );

    // A trial is not a purchase — no money moved today. Reported separately so
    // Meta can be told to optimise for trials that convert rather than for
    // people who collect free ones.
    if (trialCents) {
      track(
        "StartTrial",
        {
          value: trialCents / 100,
          currency: currency.toUpperCase(),
          predicted_ltv: trialCents / 100,
          ...content,
          ...campaign,
        },
        eventIdFor("StartTrial", orderId),
      );
    }

    // This funnel's own event, beside the standard Purchase rather than
    // instead of it — Meta's own optimisation runs on Purchase, and a custom
    // event cannot replace it. Same money, read back from the order, so the
    // two can never disagree about what the sale was worth.
    if (customEvent) {
      trackNamedCustom(
        customEvent.name,
        {
          content_name: customEvent.contentName,
          content_type: "product",
          currency: currency.toUpperCase(),
          value: valueCents / 100,
          order_id: orderId,
          ...campaign,
        },
        // The server sends this same event with this same id from
        // finalizeOrder, so a blocked pixel or a closed tab still reports the
        // sale and an unblocked one is not counted twice.
        customEventIdFor(customEvent.name, orderId),
      );
    }

    if (adsLabel) {
      adsConversion(adsLabel, { valueCents, currency, orderId, email });
    }
  }, [orderId, valueCents, currency, trialCents, email, adsLabel, customEvent, attribution]);

  return null;
}
