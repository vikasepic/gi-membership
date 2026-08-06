"use client";

import Link from "next/link";
import { track } from "@/components/analytics";
import { eventIdFor } from "@/lib/analytics/events";

/**
 * A buy button on a sales page.
 *
 * Pressing it is the moment of intent — the last thing that happens before a
 * checkout, and the step most people stop at. Reported as AddToCart, which is
 * what an ad platform can optimise towards long before there are enough
 * purchases a week to learn from.
 *
 * It is a real link. The event fires on click and navigation carries on
 * regardless: a tracker that has to finish before the page moves is a tracker
 * that costs sales when it is slow, and loses the event anyway when it is
 * blocked.
 */
export function BuyLink({
  href,
  label,
  valueCents,
  currency,
  contentId,
  className,
  style,
  children,
}: {
  href: string;
  label?: string;
  valueCents?: number | null;
  currency?: string | null;
  contentId?: string | null;
  className?: string;
  /** For a button drawn in the band's own ink, like the outlined second price. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={() =>
        track(
          "AddToCart",
          {
            value: (valueCents ?? 0) / 100,
            currency: (currency ?? "usd").toUpperCase(),
            ...(contentId ? { content_ids: [contentId], content_type: "product" } : {}),
          },
          eventIdFor("AddToCart"),
        )
      }
    >
      {children ?? label}
    </Link>
  );
}
