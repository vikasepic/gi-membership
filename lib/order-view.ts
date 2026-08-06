import type { OrderRow } from "@/lib/orders";

/**
 * Which orders are on screen, and what they add up to.
 *
 * Separated from the page because the figures at the top have to be computed
 * from the SAME list the table shows. They used to be computed from everything,
 * so filtering changed the rows and left the totals saying something about a
 * set nobody was looking at — three numbers that never move are decoration.
 */

export type OrderFilter = {
  status: "all" | "paid" | "refunded" | "pending" | "failed" | "subscriptions";
  q: string;
  /** Days back from now, or "all". */
  range: "7" | "30" | "90" | "all";
  sort: "newest" | "oldest" | "largest";
};

export const DEFAULT_FILTER: OrderFilter = { status: "all", q: "", range: "all", sort: "newest" };

const STATUSES = ["all", "paid", "refunded", "pending", "failed", "subscriptions"] as const;
const RANGES = ["7", "30", "90", "all"] as const;
const SORTS = ["newest", "oldest", "largest"] as const;

/** Read a filter off the URL, refusing anything it does not recognise. */
export function filterFrom(params: Record<string, string | string[] | undefined>): OrderFilter {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const pick = <T extends readonly string[]>(k: string, allowed: T, fallback: T[number]) => {
    const v = one(k);
    return (allowed as readonly string[]).includes(v ?? "") ? (v as T[number]) : fallback;
  };
  return {
    status: pick("status", STATUSES, "all"),
    q: (one("q") ?? "").trim().slice(0, 120),
    range: pick("range", RANGES, "all"),
    sort: pick("sort", SORTS, "newest"),
  };
}

/** The filter as a query string, for a link that keeps everything else. */
export function filterHref(filter: OrderFilter, patch: Partial<OrderFilter>): string {
  const next = { ...filter, ...patch };
  const q = new URLSearchParams();
  if (next.status !== "all") q.set("status", next.status);
  if (next.q) q.set("q", next.q);
  if (next.range !== "all") q.set("range", next.range);
  if (next.sort !== "newest") q.set("sort", next.sort);
  const s = q.toString();
  return s ? `/admin/orders?${s}` : "/admin/orders";
}

/**
 * Everything about an order a search should be able to reach.
 *
 * The payment id is in here because that is what arrives in a support email
 * from someone who cannot remember which address they used, and the product
 * names because "who bought the Validator" is a question with no other answer.
 */
function haystack(o: OrderRow): string {
  return [
    o.email,
    o.status,
    o.buyerCountry ?? "",
    o.stripePaymentIntentId ?? "",
    ...o.items.map((i) => i.description),
    ...o.items.map((i) => i.stripeSubscriptionId ?? ""),
  ]
    .join(" ")
    .toLowerCase();
}

const hasSubscription = (o: OrderRow) => o.items.some((i) => i.stripeSubscriptionId);

export function applyFilter(orders: OrderRow[], filter: OrderFilter, now = Date.now()): OrderRow[] {
  const q = filter.q.trim().toLowerCase();
  const cutoff = filter.range === "all" ? null : now - Number(filter.range) * 86_400_000;

  const out = orders.filter((o) => {
    if (filter.status === "subscriptions") {
      // A different question from "who paid": someone on a plan may have paid
      // nothing today, and the status column cannot say so.
      if (!hasSubscription(o)) return false;
    } else if (filter.status !== "all" && o.status !== filter.status) {
      return false;
    }
    if (cutoff !== null && new Date(o.createdAt).getTime() < cutoff) return false;
    if (q && !haystack(o).includes(q)) return false;
    return true;
  });

  return [...out].sort((a, b) => {
    if (filter.sort === "largest") return b.totalCents - a.totalCents;
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    return filter.sort === "oldest" ? at - bt : bt - at;
  });
}

export type OrderTotals = {
  shown: number;
  paidCents: number;
  paidCount: number;
  refundedCents: number;
  refundedCount: number;
  averageCents: number;
  currency: string;
};

/**
 * What is on screen, added up.
 *
 * A refunded order is deliberately not revenue — it was taken and given back,
 * and a total that counts it is a total that overstates what the store has.
 */
export function totalsFor(orders: OrderRow[], fallbackCurrency = "usd"): OrderTotals {
  const paid = orders.filter((o) => o.status === "paid");
  const refunded = orders.filter((o) => o.status === "refunded");
  const paidCents = paid.reduce((n, o) => n + o.totalCents, 0);
  return {
    shown: orders.length,
    paidCents,
    paidCount: paid.length,
    refundedCents: refunded.reduce((n, o) => n + o.totalCents, 0),
    refundedCount: refunded.length,
    // Across the orders that were actually paid: dividing by everything would
    // report an average nobody was ever charged.
    averageCents: paid.length ? Math.round(paidCents / paid.length) : 0,
    currency: orders[0]?.currency ?? fallbackCurrency,
  };
}

/**
 * How many orders each chip would show.
 *
 * Counted against the OTHER filters, not against everything — a chip saying
 * "Refunded 3" while the date range is this week, when all three were in July,
 * is a chip that lies about what clicking it does.
 */
export function chipCounts(
  orders: OrderRow[],
  filter: OrderFilter,
  now = Date.now(),
): Record<OrderFilter["status"], number> {
  const counts = {} as Record<OrderFilter["status"], number>;
  for (const status of STATUSES) {
    counts[status] = applyFilter(orders, { ...filter, status }, now).length;
  }
  return counts;
}
