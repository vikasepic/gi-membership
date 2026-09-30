/**
 * Money a connected app took itself, which is not Grow's to report.
 *
 * Decided 30 Sep 2026: a member may reach the Funnel App from their Grow
 * library, but what they paid the Funnel App, and the status of that
 * subscription, belong to the Funnel App alone. Grow's ledger, member money,
 * trials and totals show only what Grow sold.
 *
 * Grow's own subscriptions always carry a Grow offer or product, so a line
 * without either is somebody else's. The renewal recorder used to book the
 * Funnel App's own charges as Grow orders (two, for one member, Aug and Sep);
 * it no longer does, and this is how the ones already written are left out.
 */
export function isAppBilledOrder(items: ReadonlyArray<{ kind: string; offerId: string | null; productId: string | null }>): boolean {
  return items.length > 0 && items.every((i) => i.kind === "renewal" && !i.offerId && !i.productId);
}
