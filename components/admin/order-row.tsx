"use client";

import { useState } from "react";
import { RefundButton } from "@/components/admin/refund-button";
import { AttributionBlock, SourcePill } from "@/components/admin/attribution-popover";
import { money } from "@/lib/money";
import { shortDate, time, fullDateTime } from "@/lib/dates";
import type { OrderRow as Order, OrderItemRow } from "@/lib/orders";

const PILL: Record<string, string> = {
  paid: "bg-navy/10 text-navy",
  refunded: "bg-primary/12 text-primary",
  pending: "bg-surface-2 text-muted",
  failed: "bg-primary/12 text-primary",
};

/**
 * One order, one row — and its detail only when asked for.
 *
 * Every order used to be an expanded card carrying its own line items whether
 * you wanted them or not, so nine orders filled three screens. Almost everything
 * that happens here is a lookup: find the one someone emailed about. A row is
 * what a lookup needs; the items, the ids and the refund button are what the
 * one you found needs.
 */
/**
 * What a line actually was, in the admin's words.
 *
 * An offer sold on its own page and an offer accepted as an upsell are both
 * written with `kind: "oto"`, so the kind alone called a standalone app
 * purchase "OTO" — reported 10 Sep 2026. The order knows which offer it was
 * opened for; a line selling that offer is the purchase, not an upsell.
 * Anything older than migration 0077 has no host offer recorded and keeps the
 * kind it carries, which for those rows is all anyone can honestly say.
 */
function lineKind(item: OrderItemRow, hostOfferId: string | null | undefined): string {
  if (item.kind === "oto" && hostOfferId && item.offerId === hostOfferId) return "offer";
  return item.kind;
}

export function OrderRowView({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`cursor-pointer border-b border-border/60 transition-colors last:border-b-0 ${
          open ? "bg-surface-2" : "hover:bg-surface-2"
        }`}
      >
        <td className="px-3 py-2.5">
          <span className="block text-sm font-medium">{shortDate(order.createdAt)}</span>
          <span className="text-sm text-muted">{time(order.createdAt)}</span>
        </td>
        <td className="px-3 py-2.5">
          {order.buyerName && <span className="block text-sm font-medium">{order.buyerName}</span>}
          <span className={`text-sm ${order.buyerName ? "text-muted" : "font-medium"}`}>{order.email}</span>
          {order.buyerCountry && (
            <span className="ml-2 text-xs text-muted">{order.buyerCountry}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-sm text-muted">
          <span className="line-clamp-1">
            {order.items[0]?.description ?? "—"}
            {order.items.length > 1 && (
              <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                +{order.items.length - 1}
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
              PILL[order.status] ?? "bg-surface-2 text-muted"
            }`}
          >
            {order.status}
          </span>
          {/* A test purchase is a real paid row for money that never moved.
              Without saying so, it reads as revenue — which is how two of them
              were counted, and how their subscription ids sat waiting for a
              renewal Stripe will never send. */}
          {!order.livemode && (
            <span
              className="ml-1.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900"
              title="Made against a Stripe test key — no money moved"
            >
              test
            </span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <SourcePill order={order} />
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-medium tabular-nums">
          <span className={order.livemode ? "" : "text-muted line-through"}>
            {money(order.totalCents, order.currency)}
          </span>
        </td>
        <td className="pr-3 text-right text-xs text-muted">{open ? "⌄" : "›"}</td>
      </tr>

      {open && (
        <tr className="border-b border-border/60 bg-surface-2 last:border-b-0">
          <td colSpan={7} className="px-3 pb-3">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-xl border border-border bg-surface p-4">
              <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                {/* A bump or an upsell is a separate line because it was a
                    separate charge — never merged into one. */}
                {order.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between gap-4 text-sm">
                    <span className="text-muted">
                      {i.description}
                      {i.kind !== "product" && (
                        <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                          {lineKind(i, order.hostOfferId)}
                        </span>
                      )}
                      {i.stripeSubscriptionId && (
                        <span className="ml-2 text-[11px] text-muted">subscription</span>
                      )}
                    </span>
                    <span className="tabular-nums">{money(i.amountCents, order.currency)}</span>
                  </div>
                ))}
                {order.taxCents ? (
                  <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-sm text-muted">
                    <span>Tax</span>
                    <span className="tabular-nums">{money(order.taxCents, order.currency)}</span>
                  </div>
                ) : null}
              </div>

              <dl className="flex min-w-44 flex-col gap-1 text-xs text-muted">
                <div>{fullDateTime(order.createdAt)}</div>
                {order.stripePaymentIntentId && (
                  <div className="font-mono text-[11px]">{order.stripePaymentIntentId}</div>
                )}
                {order.items
                  .filter((i) => i.stripeSubscriptionId)
                  .map((i) => (
                    <div key={i.stripeSubscriptionId} className="font-mono text-[11px]">
                      {i.stripeSubscriptionId}
                    </div>
                  ))}
              </dl>

              <div className="min-w-56">
                <AttributionBlock order={order} />
              </div>

              <div className="ml-auto">
                {order.status === "paid" ? (
                  <RefundButton
                    orderId={order.id}
                    email={order.email}
                    amount={money(order.totalCents, order.currency)}
                  />
                ) : (
                  <span className="text-sm text-muted">
                    {order.status === "refunded" ? "Refunded" : "Nothing to refund"}
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
