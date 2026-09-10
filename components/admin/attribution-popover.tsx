"use client";

import { useEffect, useRef, useState } from "react";
import { UTM_KEYS, sameLabels, type Labels } from "@/lib/attribution";
import { sourceLabel } from "@/lib/order-view";
import type { OrderRow } from "@/lib/orders";

/**
 * Where an order came from, on the Orders page.
 *
 * Two shapes of the same facts. SourcePill is the row's cell: "meta ·
 * paid_social" and, on click, a small popover with every label — a click,
 * not a hover, because hover does not exist on a phone. AttributionBlock is
 * the same list inline, for the expanded row, so a screenshot of an order
 * shows its campaign without anybody clicking.
 */

const SHORT: Record<string, string> = {
  utm_source: "Source",
  utm_medium: "Medium",
  utm_campaign: "Campaign",
  utm_adset: "Ad set",
  utm_content: "Ad",
  utm_term: "Term",
  utm_id: "Campaign id",
};

function Rows({ labels }: { labels: Labels }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {UTM_KEYS.filter((k) => labels[k]).map((k) => (
        <div key={k} className="contents">
          <dt className="text-muted">{SHORT[k]}</dt>
          <dd className="break-words">{labels[k]}</dd>
        </div>
      ))}
    </dl>
  );
}

function Referrer({ url }: { url: string }) {
  return (
    <div className="text-xs">
      <span className="text-muted">Referrer </span>
      <span className="break-all">{url.replace(/^https?:\/\//, "")}</span>
    </div>
  );
}

export function AttributionBlock({ order }: { order: OrderRow }) {
  const hasLast = Object.keys(order.utmLast).length > 0;
  const hasFirst = Object.keys(order.utmFirst).length > 0;
  if (!hasLast && !hasFirst && !order.referrer) return null;
  const firstDiffers = hasFirst && !sameLabels(order.utmFirst, order.utmLast);
  return (
    <div className="flex flex-col gap-2">
      {hasLast && <Rows labels={order.utmLast} />}
      {firstDiffers && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="kicker text-muted">First touch</span>
          <Rows labels={order.utmFirst} />
        </div>
      )}
      {order.referrer && <Referrer url={order.referrer} />}
    </div>
  );
}

export function SourcePill({ order }: { order: OrderRow }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside or Escape closes. Registered only while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = sourceLabel(order);
  const empty = !Object.keys(order.utmLast).length && !Object.keys(order.utmFirst).length && !order.referrer;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        // The row toggles on click; this must not.
        onClick={(e) => {
          e.stopPropagation();
          if (!empty) setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup={empty ? undefined : "dialog"}
        className={`inline-flex max-w-[12rem] items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${
          label === "direct" ? "bg-surface-2 text-muted" : "bg-navy/10 text-navy"
        } ${empty ? "cursor-default" : "cursor-pointer hover:opacity-80"}`}
        title={empty ? undefined : "Show every label"}
      >
        {label}
      </button>
      {open && (
        // Source sits near the right edge of a table inside a horizontal
        // scroller — left-anchored, the popover ran off the scroller and
        // got clipped, cutting off campaign, ad set, ad name and referrer.
        // Anchor right so it opens back into the table instead. On a phone
        // the pill's right edge sits too close to the scroller's own right
        // edge for a 288px (w-72) panel to fit either direction, so below
        // `sm` cap the width to 15rem — measured at 390px: right edge 273,
        // scroller starts at 20, so 15rem lands the left edge at 33.
        <div
          role="dialog"
          aria-label="Where this order came from"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[15rem] sm:max-w-none rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <AttributionBlock order={order} />
        </div>
      )}
    </div>
  );
}
