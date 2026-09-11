"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sameLabels, type Labels } from "@/lib/attribution";
import { labelPairs } from "@/lib/visit-view";
import { sourceLabel } from "@/lib/order-view";
import type { OrderRow } from "@/lib/orders";

/**
 * Where an order came from, on the Orders page.
 *
 * Two shapes of the same facts. SourcePill is the row's cell: "meta ·
 * paid_social" and, on click, a small popover with every label — a click,
 * not a hover, because hover does not exist on a phone. AttributionBlock is
 * the same list inline: `layout="compact"` (the default) for that popover,
 * `layout="open"` for the expanded row, where the owner asked for
 * attribution to be plain and open rather than one more click away — both
 * label sets side by side, unabbreviated, with a link to the visit itself.
 *
 * `labelPairs` comes from `lib/visit-view.ts`, a pure module with no
 * `server-only` import — this file is a client component, and importing the
 * `server-only` `lib/visit-reports.ts` here breaks `npx next build` without
 * `tsc` or the test suite ever seeing it (both were caught doing exactly
 * that earlier on this branch).
 */

function Rows({ labels }: { labels: Labels }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {labelPairs(labels).map((p) => (
        <div key={p.label} className="contents">
          <dt className="text-muted">{p.label}</dt>
          <dd className="break-words">{p.value}</dd>
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

/** One named column of labels, for the open layout. Both touches show, even when empty — collapsing "same as last" is a compact-space saving, not a fact to hide once there is room to be plain. */
function Column({ heading, labels }: { heading: string; labels: Labels }) {
  const pairs = labelPairs(labels);
  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1.5">
      <span className="kicker text-muted">{heading}</span>
      {pairs.length === 0 ? <span className="text-xs text-muted">direct</span> : <Rows labels={labels} />}
    </div>
  );
}

function CompactBlock({ order }: { order: OrderRow }) {
  const hasLast = Object.keys(order.utmLast).length > 0;
  const hasFirst = Object.keys(order.utmFirst).length > 0;
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

function OpenBlock({ order }: { order: OrderRow }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Column heading="Last touch" labels={order.utmLast} />
        <Column heading="First touch" labels={order.utmFirst} />
      </div>
      {order.referrer && <Referrer url={order.referrer} />}
      {/* Orders placed before migration 0080 carry no visit_id — nothing to link to. */}
      {order.visitId && (
        <Link href="/admin/attribution/visits" className="w-fit text-xs text-muted underline-offset-4 hover:underline">
          See the visit →
        </Link>
      )}
    </div>
  );
}

export function AttributionBlock({ order, layout = "compact" }: { order: OrderRow; layout?: "compact" | "open" }) {
  const hasLast = Object.keys(order.utmLast).length > 0;
  const hasFirst = Object.keys(order.utmFirst).length > 0;
  if (!hasLast && !hasFirst && !order.referrer) return null;
  return layout === "open" ? <OpenBlock order={order} /> : <CompactBlock order={order} />;
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
