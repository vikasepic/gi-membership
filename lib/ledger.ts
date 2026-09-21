import type { MoneyData } from "@/lib/money-data";
import { sourceOf } from "@/lib/member-money";

/**
 * The ledger: every time money moved, or was promised, one row each.
 *
 * Built from orders and their lines plus the subscriptions table, so a
 * renewal, a refund and a cancellation sit beside the first purchase they
 * belong to. Pure over MoneyData; the Transactions page and the person page
 * both read it, which is how their totals agree.
 */

export type LedgerKind = "purchase" | "renewal" | "trial" | "upsell" | "add-on" | "refund" | "cancellation";
export const LEDGER_KINDS: { key: LedgerKind; label: string }[] = [
  { key: "purchase", label: "Purchase" },
  { key: "renewal", label: "Renewal" },
  { key: "trial", label: "Trial started" },
  { key: "upsell", label: "Upsell" },
  { key: "add-on", label: "Add-on" },
  { key: "refund", label: "Refund" },
  { key: "cancellation", label: "Cancellation" },
];

export type LedgerRow = {
  id: string;
  at: string;
  userId: string | null;
  email: string;
  name: string | null;
  kind: LedgerKind;
  what: string;
  offerId: string | null;
  productId: string | null;
  amountCents: number;
  currency: string;
  livemode: boolean;
  source: string;
  orderId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  /** For a trial row: when it ends and what it will cost. */
  trial?: { endsAt: string | null; thenCents: number; interval: string | null; outcome: "on trial" | "converted" | "cancelled" | "ended unpaid"; outcomeAt: string | null };
  /** For a purchase or refund: the order's status, so a refunded purchase can be struck. */
  refunded?: boolean;
};

const ms = (s: string) => new Date(s).getTime();

export function deriveLedger(d: MoneyData): LedgerRow[] {
  const userName = new Map(d.users.map((u) => [u.id, u.name]));
  const subs = new Map(d.subscriptions.map((s) => [s.stripeSubscriptionId, s]));
  const itemsByOrder = new Map<string, MoneyData["items"]>();
  for (const it of d.items) itemsByOrder.set(it.orderId, [...(itemsByOrder.get(it.orderId) ?? []), it]);
  const nameOf = (offerId: string | null, productId: string | null, fallback: string) =>
    (offerId && d.names.offers.get(offerId)?.name) || (productId && d.names.products.get(productId)?.name) || fallback;

  const rows: LedgerRow[] = [];
  for (const o of d.orders) {
    if (o.status !== "paid" && o.status !== "refunded") continue;
    const base = {
      userId: o.userId,
      email: o.email,
      name: o.userId ? (userName.get(o.userId) ?? null) : null,
      currency: o.currency,
      livemode: o.livemode,
      source: sourceOf(o.utmLast, o.referrer),
      orderId: o.id,
      stripePaymentIntentId: o.stripePaymentIntentId,
    };
    const items = itemsByOrder.get(o.id) ?? [];
    if (o.stripeInvoiceId) {
      const it = items[0];
      rows.push({
        ...base,
        id: `${o.id}:renewal`,
        at: o.createdAt,
        kind: "renewal",
        what: nameOf(it?.offerId ?? null, it?.productId ?? null, it?.description ?? "Subscription"),
        offerId: it?.offerId ?? null,
        productId: it?.productId ?? null,
        amountCents: o.totalCents,
        stripeSubscriptionId: it?.stripeSubscriptionId ?? null,
        refunded: o.status === "refunded",
      });
    } else {
      for (const [i, it] of items.entries()) {
        const sub = it.stripeSubscriptionId ? subs.get(it.stripeSubscriptionId) : undefined;
        const isTrial = it.amountCents === 0 && !!it.stripeSubscriptionId;
        const kind: LedgerKind = isTrial
          ? "trial"
          : it.kind === "bump"
            ? "add-on"
            : it.kind === "oto"
              ? o.hostOfferId && it.offerId === o.hostOfferId
                ? "purchase"
                : "upsell"
              : "purchase";
        const offerMeta = it.offerId ? d.names.offers.get(it.offerId) : undefined;
        rows.push({
          ...base,
          id: `${o.id}:${i}`,
          at: o.createdAt,
          kind,
          what: nameOf(it.offerId, it.productId, it.description),
          offerId: it.offerId,
          productId: it.productId,
          amountCents: it.amountCents,
          stripeSubscriptionId: it.stripeSubscriptionId,
          refunded: o.status === "refunded",
          ...(isTrial
            ? {
                trial: {
                  endsAt: sub?.trialEnd ?? null,
                  thenCents: sub?.amountCents ?? offerMeta?.priceCents ?? 0,
                  interval: sub?.interval ?? null,
                  outcome: !sub
                    ? "on trial"
                    : sub.paidInvoices > 0
                      ? "converted"
                      : sub.status === "trialing"
                        ? "on trial"
                        : sub.canceledAt
                          ? "cancelled"
                          : "ended unpaid",
                  outcomeAt: sub ? (sub.paidInvoices > 0 ? sub.firstPaidAt : sub.canceledAt ?? sub.trialEnd) : null,
                },
              }
            : {}),
        });
      }
    }
    if (o.status === "refunded") {
      const it = items[0];
      rows.push({
        ...base,
        id: `${o.id}:refund`,
        at: o.updatedAt,
        kind: "refund",
        what: nameOf(it?.offerId ?? null, it?.productId ?? null, it?.description ?? "Order"),
        offerId: it?.offerId ?? null,
        productId: it?.productId ?? null,
        amountCents: -o.totalCents,
        stripeSubscriptionId: it?.stripeSubscriptionId ?? null,
      });
    }
  }
  for (const s of d.subscriptions) {
    if (!s.canceledAt) continue;
    const u = s.userId ? d.users.find((x) => x.id === s.userId) : null;
    rows.push({
      id: `${s.stripeSubscriptionId}:cancel`,
      at: s.canceledAt,
      userId: s.userId,
      email: u?.email ?? "",
      name: u?.name ?? null,
      kind: "cancellation",
      what: nameOf(s.offerId, s.productId, "Subscription"),
      offerId: s.offerId,
      productId: s.productId,
      amountCents: 0,
      currency: s.currency,
      livemode: s.livemode,
      source: "",
      orderId: null,
      stripeSubscriptionId: s.stripeSubscriptionId,
      stripePaymentIntentId: null,
    });
  }
  return rows.sort((a, b) => ms(b.at) - ms(a.at));
}

// ---------- filter, totals, breakdowns ----------

export type Range = "today" | "7" | "30" | "mtd" | "all";
export type LedgerFilter = { range: Range; kinds: LedgerKind[]; offer: string; source: string; q: string; live: boolean };
export const DEFAULT_LEDGER_FILTER: LedgerFilter = { range: "30", kinds: [], offer: "", source: "", q: "", live: true };

export function ledgerFilterFrom(sp: Record<string, string | string[] | undefined>): LedgerFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const range = one("range");
  const kinds = one("kind").split(",").filter((k): k is LedgerKind => LEDGER_KINDS.some((x) => x.key === k));
  return {
    range: (["today", "7", "30", "mtd", "all"] as string[]).includes(range) ? (range as Range) : "30",
    kinds,
    offer: one("offer").slice(0, 80),
    source: one("source").slice(0, 120),
    q: one("q").slice(0, 120),
    live: one("live") !== "0",
  };
}

export function ledgerHref(f: LedgerFilter, patch: Partial<LedgerFilter>): string {
  const n = { ...f, ...patch };
  const p = new URLSearchParams();
  if (n.range !== "30") p.set("range", n.range);
  if (n.kinds.length) p.set("kind", n.kinds.join(","));
  if (n.offer) p.set("offer", n.offer);
  if (n.source) p.set("source", n.source);
  if (n.q) p.set("q", n.q);
  if (!n.live) p.set("live", "0");
  const s = p.toString();
  return `/admin/orders${s ? `?${s}` : ""}`;
}

export function rangeStart(range: Range, now: Date): number {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (range) {
    case "today": return day.getTime();
    case "7": return day.getTime() - 7 * 864e5;
    case "30": return day.getTime() - 30 * 864e5;
    case "mtd": return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    default: return 0;
  }
}

export function applyLedgerFilter(rows: LedgerRow[], f: LedgerFilter, now: Date): LedgerRow[] {
  const from = rangeStart(f.range, now);
  const q = f.q.toLowerCase();
  return rows.filter(
    (r) =>
      ms(r.at) >= from &&
      (!f.live || r.livemode) &&
      (f.kinds.length === 0 || f.kinds.includes(r.kind)) &&
      (!f.offer || r.offerId === f.offer || r.productId === f.offer) &&
      (!f.source || r.source === f.source) &&
      (!q || r.email.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q)),
  );
}

export type LedgerTotals = {
  rows: number;
  grossCents: number;
  payments: number;
  refundCents: number;
  refunds: number;
  netCents: number;
  renewals: number;
  renewalCents: number;
  newCustomers: number;
  trialsStarted: number;
  currency: string;
};

export function ledgerTotals(rows: LedgerRow[]): LedgerTotals {
  const paid = rows.filter((r) => r.amountCents > 0);
  const refunds = rows.filter((r) => r.kind === "refund");
  const renewals = rows.filter((r) => r.kind === "renewal");
  const gross = paid.reduce((n, r) => n + r.amountCents, 0);
  const refunded = -refunds.reduce((n, r) => n + r.amountCents, 0);
  return {
    rows: rows.length,
    grossCents: gross,
    payments: paid.length,
    refundCents: refunded,
    refunds: refunds.length,
    netCents: gross - refunded,
    renewals: renewals.length,
    renewalCents: renewals.reduce((n, r) => n + r.amountCents, 0),
    newCustomers: new Set(rows.filter((r) => r.kind === "purchase" || r.kind === "trial").map((r) => r.userId ?? r.email)).size,
    trialsStarted: rows.filter((r) => r.kind === "trial").length,
    currency: rows[0]?.currency ?? "usd",
  };
}

export function breakdown(rows: LedgerRow[], key: (r: LedgerRow) => string): { name: string; count: number; netCents: number }[] {
  const m = new Map<string, { count: number; netCents: number }>();
  for (const r of rows) {
    const k = key(r) || "—";
    const e = m.get(k) ?? { count: 0, netCents: 0 };
    e.count += 1;
    e.netCents += r.amountCents;
    m.set(k, e);
  }
  return [...m].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.netCents - a.netCents);
}

export function sourcesIn(rows: LedgerRow[]): string[] {
  return [...new Set(rows.map((r) => r.source).filter(Boolean))].sort();
}
