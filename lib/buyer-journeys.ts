import type { MoneyData } from "@/lib/money-data";
import { sourceOf } from "@/lib/member-money";

/**
 * Journeys: what each buyer bought first, what they bought later, and what
 * they have spent. Pure over MoneyData, like the ledger and the members list.
 *
 * Asked for by the ads team on 17 Nov 2026. ActiveCampaign tags say a person
 * has a product, not when they got it or whether they paid, so "bought the
 * Validator, then Foundations Weekend" could not be read from them. Grow's
 * orders can say it, for everything Grow sold.
 *
 * Named Buyer… because `Journey` in lib/member-money.ts already means the
 * state a member is in.
 *
 * The rules, each with a test in lib/buyer-journeys.test.ts:
 *   - One order is one purchase. Its bump and any upsell are lines on the same
 *     order and are "bought with" it. Two orders are two purchases.
 *   - An order is worth the sum of its lines. orders.total_cents is not
 *     updated when an upsell is accepted.
 *   - A $0 order (a trial start, a 100% coupon) is a "free start", not a
 *     purchase, until its subscription has taken money. Then it is a purchase
 *     dated the day it started. Renewals are never a purchase of their own.
 *   - Refunded, unpaid and test-mode orders do not exist here.
 *   - Access an admin gave by hand is listed on the person and counted nowhere.
 *   - The team (admins, read-only people) is left out.
 *
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

export type JourneyRange = "all" | "90" | "30";
export const JOURNEY_RANGES: { key: JourneyRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "90", label: "90 days" },
  { key: "30", label: "30 days" },
];

/** The range off the URL. A whitelist: anything else is all time. */
export function journeyRangeFrom(sp: Record<string, string | string[] | undefined>): JourneyRange {
  const v = sp.range;
  return v === "90" || v === "30" ? v : "all";
}

export type BuyerPurchase = { orderId: string; at: string; key: string; what: string; valueCents: number; withIt: string[] };
export type BuyerLine = {
  personKey: string;
  email: string;
  name: string | null;
  /** 1 for the first purchase, 2 for the next. Null on a renewal, a free start or given access. */
  purchaseNo: number | null;
  at: string | null;
  what: string;
  how: "first" | "bought with" | "later" | "renewal" | "started free" | "given";
  amountCents: number;
  currency: string;
  sourceFirst: string;
  sourceLast: string;
};
export type BuyerJourney = {
  personKey: string;
  userId: string | null;
  email: string;
  name: string | null;
  first: BuyerPurchase;
  later: BuyerPurchase[];
  startedFree: { what: string; at: string }[];
  given: { what: string; at: string | null }[];
  totalSpentCents: number;
  currency: string;
  /** First-touch source of the first purchase, as Members shows it. */
  source: string;
  lines: BuyerLine[];
};
export type JourneySummaryRow = {
  key: string;
  what: string;
  buyers: number;
  avgFirstValueCents: number;
  boughtAgain: number;
  /** By the key of what was bought later: how many of this row's buyers went on to buy it. */
  laterBy: Record<string, number>;
  avgTotalSpentCents: number;
};
export type Journeys = { people: BuyerJourney[]; summary: JourneySummaryRow[]; laterColumns: { key: string; what: string }[] };

type Order = MoneyData["orders"][number];
type Item = MoneyData["items"][number];

const ms = (s: string) => new Date(s).getTime();
const DAY = 86_400_000;

export function deriveJourneys(d: MoneyData, opts: { range: JourneyRange; teamEmails: string[] }): Journeys {
  const itemsOf = new Map<string, Item[]>();
  for (const it of d.items) itemsOf.set(it.orderId, [...(itemsOf.get(it.orderId) ?? []), it]);
  const paidSubs = new Set(d.subscriptions.filter((s) => s.paidInvoices > 0).map((s) => s.stripeSubscriptionId));
  const userById = new Map(d.users.map((u) => [u.id, u]));
  const userIdByEmail = new Map(d.users.map((u) => [u.email.toLowerCase(), u.id]));
  const teamEmails = new Set(opts.teamEmails.map((e) => e.toLowerCase()));
  const isTeam = (userId: string | null, email: string) => {
    const u = userId ? userById.get(userId) : undefined;
    return Boolean(u?.isAdmin || u?.isViewer) || teamEmails.has(email.toLowerCase()) || teamEmails.has(u?.email.toLowerCase() ?? "");
  };

  const nameOf = (it: Pick<Item, "offerId" | "productId" | "description">) =>
    (it.offerId && d.names.offers.get(it.offerId)?.name) || (it.productId && d.names.products.get(it.productId)?.name) || it.description;
  const keyOf = (it: Pick<Item, "offerId" | "productId" | "description">) =>
    it.offerId ? `offer:${it.offerId}` : it.productId ? `product:${it.productId}` : `other:${it.description}`;
  // An order with no lines recorded is worth what it says it is.
  const valueOf = (o: Order, lines: Item[]) => (lines.length ? lines.reduce((n, it) => n + it.amountCents, 0) : o.totalCents);

  // Everyone's counted orders, oldest first. An order with no account is its email's.
  const byPerson = new Map<string, Order[]>();
  for (const o of d.orders) {
    if (o.status !== "paid" || !o.livemode) continue;
    const userId = o.userId ?? userIdByEmail.get(o.email.toLowerCase()) ?? null;
    if (isTeam(userId, o.email)) continue;
    const key = userId ?? o.email.toLowerCase();
    byPerson.set(key, [...(byPerson.get(key) ?? []), o]);
  }

  const from = opts.range === "all" ? -Infinity : d.now.getTime() - Number(opts.range) * DAY;
  const people: BuyerJourney[] = [];

  for (const [personKey, unsorted] of byPerson) {
    const orders = [...unsorted].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    const firstOrder = orders[0];
    const userId = firstOrder.userId ?? userIdByEmail.get(firstOrder.email.toLowerCase()) ?? null;
    const u = userId ? userById.get(userId) : undefined;
    const email = u?.email ?? firstOrder.email;
    const name = u?.name ?? null;

    const purchases: BuyerPurchase[] = [];
    const startedFree: BuyerJourney["startedFree"] = [];
    // Lines are stamped with the person's source afterwards, once the first purchase is known.
    const lines: Omit<BuyerLine, "sourceFirst" | "sourceLast">[] = [];
    const line = (l: Pick<BuyerLine, "purchaseNo" | "at" | "what" | "how" | "amountCents">, currency: string) =>
      lines.push({ personKey, email, name, currency, ...l });
    let firstPurchaseOrder: Order | null = null;
    let total = 0;

    for (const o of orders) {
      const its = itemsOf.get(o.id) ?? [];
      const value = valueOf(o, its);
      if (o.stripeInvoiceId) {
        // A renewal: money, never a purchase of its own.
        total += value;
        line({ purchaseNo: null, at: o.createdAt, what: its[0] ? nameOf(its[0]) : "Subscription", how: "renewal", amountCents: value }, o.currency);
        continue;
      }
      // The thing the order was for: the product, or the offer the order was
      // opened on, never a bump. Offer orders from before host_offer_id was
      // recorded (migration 0077) have no host, so the first line that is not
      // a bump stands in.
      const main =
        its.find((it) => it.kind === "product") ??
        its.find((it) => it.kind === "oto" && o.hostOfferId && it.offerId === o.hostOfferId) ??
        its.find((it) => it.kind !== "bump") ??
        its[0];
      // Any line, not only the main one: a product on a 100% coupon whose
      // upsell trial went on to pay is an order somebody paid on.
      const paidLater = its.some((it) => it.stripeSubscriptionId && paidSubs.has(it.stripeSubscriptionId));
      if (value === 0 && !paidLater) {
        // A free start that has taken no money: a trial, or a 100% coupon.
        const what = main ? nameOf(main) : "An order";
        startedFree.push({ what, at: o.createdAt });
        line({ purchaseNo: null, at: o.createdAt, what, how: "started free", amountCents: 0 }, o.currency);
        continue;
      }
      total += value;
      firstPurchaseOrder ??= o;
      const no = purchases.length + 1;
      const others = its.filter((it) => it !== main);
      purchases.push({
        orderId: o.id,
        at: o.createdAt,
        key: main ? keyOf(main) : `other:${o.id}`,
        what: main ? nameOf(main) : "An order",
        valueCents: value,
        withIt: others.map(nameOf),
      });
      line({ purchaseNo: no, at: o.createdAt, what: main ? nameOf(main) : "An order", how: no === 1 ? "first" : "later", amountCents: main ? main.amountCents : value }, o.currency);
      for (const it of others) line({ purchaseNo: no, at: o.createdAt, what: nameOf(it), how: "bought with", amountCents: it.amountCents }, o.currency);
    }

    if (!firstPurchaseOrder || purchases.length === 0) continue;
    if (ms(purchases[0].at) < from) continue;

    // Given, not bought: an admin's name on the row. The source alone does
    // not say so, because the offer checkout writes "grant" for every offer it
    // sells (lib/offer-checkout.ts); on 18 Nov 2026 that was 309 rows against
    // 25 hand grants. A hand grant that was later bought has had its source
    // overwritten (lib/checkout.ts), so it reads as bought, which is right.
    const given: BuyerJourney["given"] = [];
    const bought = new Set(orders.flatMap((o) => (itemsOf.get(o.id) ?? []).map(keyOf)));
    if (userId) {
      for (const own of d.ownership) {
        if (own.userId !== userId || own.source !== "grant" || !own.grantedBy) continue;
        // Taken back, so they do not hold it.
        if (own.status === "canceled") continue;
        // Bought since on its own offer page: the checkout writes "grant"
        // again and leaves the granter's name on the row.
        if (bought.has(own.offerId ? `offer:${own.offerId}` : `product:${own.productId}`)) continue;
        const what =
          (own.offerId && d.names.offers.get(own.offerId)?.name) ||
          (own.productId && d.names.products.get(own.productId)?.name) ||
          (own.appId && d.names.apps.get(own.appId)) ||
          "Access";
        given.push({ what, at: own.createdAt ?? null });
      }
      for (const g of d.courseGrants ?? []) if (g.userId === userId) given.push({ what: g.courseTitle, at: g.createdAt ?? null });
    }
    for (const g of given) line({ purchaseNo: null, at: g.at, what: g.what, how: "given", amountCents: 0 }, firstPurchaseOrder.currency);

    const sourceFirst = sourceOf(firstPurchaseOrder.utmFirst, firstPurchaseOrder.referrer);
    const sourceLast = sourceOf(firstPurchaseOrder.utmLast, firstPurchaseOrder.referrer);
    people.push({
      personKey,
      userId,
      email,
      name,
      first: purchases[0],
      later: purchases.slice(1),
      startedFree,
      given,
      totalSpentCents: total,
      currency: firstPurchaseOrder.currency,
      source: sourceFirst,
      lines: lines.map((l) => ({ ...l, sourceFirst, sourceLast })),
    });
  }

  people.sort((a, b) => ms(b.first.at) - ms(a.first.at));

  // One row per first purchase; the columns are what its buyers bought later.
  const rows = new Map<string, { what: string; people: BuyerJourney[] }>();
  for (const p of people) {
    const row = rows.get(p.first.key) ?? { what: p.first.what, people: [] };
    row.people.push(p);
    rows.set(p.first.key, row);
  }
  const laterTotals = new Map<string, { what: string; count: number }>();
  const avg = (ns: number[]) => (ns.length ? Math.round(ns.reduce((n, v) => n + v, 0) / ns.length) : 0);
  const summary: JourneySummaryRow[] = [...rows.entries()].map(([key, row]) => {
    const laterBy: Record<string, number> = {};
    for (const p of row.people) {
      // Once per person, however many times they bought it again.
      for (const [k, what] of new Map(p.later.map((l) => [l.key, l.what]))) {
        laterBy[k] = (laterBy[k] ?? 0) + 1;
        laterTotals.set(k, { what, count: (laterTotals.get(k)?.count ?? 0) + 1 });
      }
    }
    return {
      key,
      what: row.what,
      buyers: row.people.length,
      avgFirstValueCents: avg(row.people.map((p) => p.first.valueCents)),
      boughtAgain: row.people.filter((p) => p.later.length > 0).length,
      laterBy,
      avgTotalSpentCents: avg(row.people.map((p) => p.totalSpentCents)),
    };
  });
  summary.sort((a, b) => b.buyers - a.buyers || a.what.localeCompare(b.what));
  const laterColumns = [...laterTotals.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].what.localeCompare(b[1].what))
    .map(([key, v]) => ({ key, what: v.what }));

  return { people, summary, laterColumns };
}
