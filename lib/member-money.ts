import type { MoneyData, OrderRowLite } from "@/lib/money-data";
import type { SubscriptionRow } from "@/lib/subscriptions";
import type { Labels } from "@/lib/attribution";

/**
 * A member, as the money screens see them. Pure over MoneyData.
 *
 * One journey per person, the strongest current state; "converted" and
 * "cancelling" are facts beside it rather than states of their own, so a
 * converted member who later cancels still counts as converted for the month
 * they converted. Total paid is every paid live order (renewals included)
 * less refunds — the same ledger the Transactions page sums.
 */

export type Journey = "paying" | "on trial" | "trial cancelled" | "cancelling" | "lapsed" | "one-off buyer" | "no access";
export const JOURNEYS: Journey[] = ["paying", "on trial", "trial cancelled", "cancelling", "lapsed", "one-off buyer", "no access"];

export type SubView = {
  stripeSubscriptionId: string;
  name: string;
  offerId: string | null;
  state: "on trial" | "paying" | "cancelling" | "past due" | "trial cancelled" | "trial ended" | "cancelled";
  amountCents: number;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  installments: number | null;
  startedAt: string;
  trialEnd: string | null;
  nextChargeAt: string | null;
  cancelsAt: string | null;
  canceledAt: string | null;
  paidInvoices: number;
  paidTotalCents: number;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
};

export type NextEvent = { what: "trial ends" | "renews" | "cancels"; at: string; name: string };

export type MemberMoney = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  joinedAt: string;
  source: string;
  journey: Journey;
  converted: boolean;
  cancelling: boolean;
  mrrCents: number;
  payments: number;
  refunds: number;
  totalPaidCents: number;
  refundedCents: number;
  lastPaidAt: string | null;
  nextEvent: NextEvent | null;
  holds: string[];
  /** The offer and product ids behind `holds`, for the filter. */
  holdIds: string[];
  subs: SubView[];
  currency: string;
};

const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN);

/** "meta / Micro Product Builder | LAL" from labels, the referrer's host, or "direct". */
export function sourceOf(utm: Labels, referrer: string | null): string {
  const src = utm.utm_source?.trim();
  const camp = utm.utm_campaign?.trim();
  if (src) return camp ? `${src} / ${camp}` : src;
  if (referrer) {
    try {
      return new URL(referrer).hostname.replace(/^www\./, "");
    } catch {
      return referrer;
    }
  }
  return "direct";
}

/** Recurring amount per month, whatever the interval. */
export function monthlyCents(s: Pick<SubscriptionRow, "amountCents" | "interval" | "intervalCount">): number {
  const n = Math.max(1, s.intervalCount ?? 1);
  const per = { day: 30, week: 30 / 7, month: 1, year: 1 / 12 }[s.interval ?? "month"] ?? 1;
  return Math.round((s.amountCents * per) / n);
}

export function subView(s: SubscriptionRow, name: string): SubView {
  const paid = s.paidInvoices > 0;
  const trialing = s.status === "trialing";
  const live = s.status === "active" || s.status === "past_due" || s.status === "trialing";
  let state: SubView["state"];
  if (trialing) state = "on trial";
  else if (s.status === "past_due") state = "past due";
  else if (live && s.cancelAtPeriodEnd) state = "cancelling";
  else if (live) state = "paying";
  else if (!paid && (s.canceledAt || s.endedAt)) state = "trial cancelled";
  else if (!paid) state = "trial ended";
  else state = "cancelled";
  const cancelsAt = live && s.cancelAtPeriodEnd ? (s.cancelAt ?? s.currentPeriodEnd) : null;
  const nextChargeAt =
    state === "on trial" ? s.trialEnd : state === "paying" || state === "past due" ? s.currentPeriodEnd : null;
  return {
    stripeSubscriptionId: s.stripeSubscriptionId,
    name,
    offerId: s.offerId,
    state,
    amountCents: s.amountCents,
    currency: s.currency,
    interval: s.interval,
    intervalCount: s.intervalCount,
    installments: s.installments,
    startedAt: s.startedAt,
    trialEnd: s.trialEnd,
    nextChargeAt,
    cancelsAt,
    canceledAt: s.canceledAt,
    paidInvoices: s.paidInvoices,
    paidTotalCents: s.paidTotalCents,
    firstPaidAt: s.firstPaidAt,
    lastPaidAt: s.lastPaidAt,
  };
}

export function deriveMembers(d: MoneyData): MemberMoney[] {
  const ordersByUser = new Map<string, OrderRowLite[]>();
  for (const o of d.orders) {
    if (!o.userId || !o.livemode) continue;
    ordersByUser.set(o.userId, [...(ordersByUser.get(o.userId) ?? []), o]);
  }
  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const s of d.subscriptions) {
    if (!s.userId || !s.livemode) continue;
    subsByUser.set(s.userId, [...(subsByUser.get(s.userId) ?? []), s]);
  }
  const ownByUser = new Map<string, MoneyData["ownership"]>();
  for (const o of d.ownership) ownByUser.set(o.userId, [...(ownByUser.get(o.userId) ?? []), o]);

  const nameOf = (s: SubscriptionRow) =>
    (s.offerId && d.names.offers.get(s.offerId)?.name) ||
    (s.productId && d.names.products.get(s.productId)?.name) ||
    "Subscription";

  return d.users.map((u) => {
    const orders = (ordersByUser.get(u.id) ?? []).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    const paidOrders = orders.filter((o) => o.status === "paid" && o.totalCents > 0);
    const refunded = orders.filter((o) => o.status === "refunded");
    const subs = (subsByUser.get(u.id) ?? [])
      .map((s) => subView(s, nameOf(s)))
      .sort((a, b) => ms(b.startedAt) - ms(a.startedAt));
    const owns = ownByUser.get(u.id) ?? [];
    const activeHolds = owns.filter((o) => o.status === "active" || o.status === "trialing" || o.status === "past_due");
    const holds = [
      ...new Set(
        activeHolds.map(
          (o) =>
            (o.productId && d.names.products.get(o.productId)?.name) ||
            (o.offerId && d.names.offers.get(o.offerId)?.name) ||
            (o.appId && d.names.apps.get(o.appId)) ||
            "Access",
        ),
      ),
    ];
    const has = (st: SubView["state"]) => subs.some((s) => s.state === st);
    const cancelling = has("cancelling");
    let journey: Journey;
    if (has("paying") || has("past due")) journey = "paying";
    else if (cancelling) journey = "cancelling";
    else if (has("on trial")) journey = "on trial";
    else if (has("trial cancelled") || has("trial ended")) journey = "trial cancelled";
    else if (has("cancelled")) journey = "lapsed";
    else if (holds.length > 0) journey = "one-off buyer";
    else journey = "no access";
    const converted = subs.some((s) => s.trialEnd && s.paidInvoices > 0);
    const events: NextEvent[] = [];
    for (const s of subs) {
      if (s.state === "on trial" && s.trialEnd) events.push({ what: "trial ends", at: s.trialEnd, name: s.name });
      else if (s.state === "cancelling" && s.cancelsAt) events.push({ what: "cancels", at: s.cancelsAt, name: s.name });
      else if ((s.state === "paying" || s.state === "past due") && s.nextChargeAt) events.push({ what: "renews", at: s.nextChargeAt, name: s.name });
    }
    events.sort((a, b) => ms(a.at) - ms(b.at));
    const first = orders[0];
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      isAdmin: u.isAdmin,
      joinedAt: u.createdAt,
      source: first ? sourceOf(first.utmFirst, first.referrer) : "direct",
      journey,
      converted,
      cancelling,
      mrrCents: subs.filter((s) => s.state === "paying" || s.state === "past due" || s.state === "cancelling").reduce((n, s) => n + monthlyCents(s), 0),
      payments: paidOrders.length,
      refunds: refunded.length,
      totalPaidCents: paidOrders.reduce((n, o) => n + o.totalCents, 0),
      refundedCents: refunded.reduce((n, o) => n + o.totalCents, 0),
      lastPaidAt: paidOrders.length ? paidOrders[paidOrders.length - 1].createdAt : null,
      nextEvent: events[0] ?? null,
      holds,
      holdIds: [...new Set(activeHolds.flatMap((o) => [o.offerId, o.productId].filter((x): x is string => !!x)))],
      subs,
      currency: paidOrders[0]?.currency ?? subs[0]?.currency ?? "usd",
    };
  });
}

// ---------- filter, sort, tiles ----------

export type MemberFilter = {
  journey: "all" | Journey | "converted" | "admins";
  offer: string; // offer or product id, "" for any
  soon: boolean; // next event within 7 days
  q: string;
  sort: "newest" | "next" | "total" | "last";
};
export const DEFAULT_MEMBER_FILTER: MemberFilter = { journey: "all", offer: "", soon: false, q: "", sort: "newest" };

export function memberFilterFrom(sp: Record<string, string | string[] | undefined>): MemberFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const journey = one("journey");
  const sort = one("sort");
  return {
    journey: ([...JOURNEYS, "all", "converted", "admins"] as string[]).includes(journey) ? (journey as MemberFilter["journey"]) : "all",
    offer: one("offer").slice(0, 80),
    soon: one("soon") === "1",
    q: one("q").slice(0, 120),
    sort: (["newest", "next", "total", "last"] as string[]).includes(sort) ? (sort as MemberFilter["sort"]) : "newest",
  };
}

export function memberHref(f: MemberFilter, patch: Partial<MemberFilter>): string {
  const n = { ...f, ...patch };
  const p = new URLSearchParams();
  if (n.journey !== "all") p.set("journey", n.journey);
  if (n.offer) p.set("offer", n.offer);
  if (n.soon) p.set("soon", "1");
  if (n.q) p.set("q", n.q);
  if (n.sort !== "newest") p.set("sort", n.sort);
  const s = p.toString();
  return `/admin/members${s ? `?${s}` : ""}`;
}

const within = (at: string | null | undefined, now: Date, days: number) =>
  !!at && ms(at) >= now.getTime() - 864e5 && ms(at) <= now.getTime() + days * 864e5;

export function applyMemberFilter(rows: MemberMoney[], f: MemberFilter, now: Date, envAdmins: string[] = []): MemberMoney[] {
  const admin = (m: MemberMoney) => m.isAdmin || envAdmins.includes(m.email.toLowerCase());
  let out = rows.filter((m) => {
    if (f.journey === "all") return true;
    if (f.journey === "converted") return m.converted;
    if (f.journey === "admins") return admin(m);
    return m.journey === f.journey;
  });
  if (f.offer) out = out.filter((m) => m.subs.some((s) => s.offerId === f.offer) || m.holdIds.includes(f.offer));
  if (f.soon) out = out.filter((m) => m.nextEvent && within(m.nextEvent.at, now, 7));
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter((m) => m.email.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q));
  }
  const by: Record<MemberFilter["sort"], (a: MemberMoney, b: MemberMoney) => number> = {
    newest: (a, b) => ms(b.joinedAt) - ms(a.joinedAt),
    next: (a, b) => (a.nextEvent ? ms(a.nextEvent.at) : Infinity) - (b.nextEvent ? ms(b.nextEvent.at) : Infinity),
    total: (a, b) => b.totalPaidCents - a.totalPaidCents,
    last: (a, b) => (b.lastPaidAt ? ms(b.lastPaidAt) : 0) - (a.lastPaidAt ? ms(a.lastPaidAt) : 0),
  };
  return [...out].sort(by[f.sort]);
}
export type MemberTiles = {
  members: number;
  paying: number;
  mrrCents: number;
  onTrial: number;
  endingThisWeek: number;
  convertedThisMonth: number;
  cancelledThisMonth: number;
  collectedCents: number;
  currency: string;
};

const sameMonth = (at: string | null, now: Date) =>
  !!at && new Date(at).getUTCFullYear() === now.getUTCFullYear() && new Date(at).getUTCMonth() === now.getUTCMonth();

export function memberTiles(rows: MemberMoney[], now: Date): MemberTiles {
  return {
    members: rows.length,
    paying: rows.filter((m) => m.journey === "paying" || m.journey === "cancelling").length,
    mrrCents: rows.reduce((n, m) => n + m.mrrCents, 0),
    onTrial: rows.filter((m) => m.journey === "on trial").length,
    endingThisWeek: rows.filter((m) => m.journey === "on trial" && m.nextEvent && within(m.nextEvent.at, now, 7)).length,
    convertedThisMonth: rows.filter((m) => m.subs.some((s) => s.trialEnd && s.paidInvoices > 0 && sameMonth(s.firstPaidAt, now))).length,
    cancelledThisMonth: rows.filter((m) => m.subs.some((s) => sameMonth(s.canceledAt, now))).length,
    collectedCents: rows.reduce((n, m) => n + m.totalPaidCents - m.refundedCents, 0),
    currency: rows[0]?.currency ?? "usd",
  };
}

export function memberChipCounts(rows: MemberMoney[], envAdmins: string[] = []): Record<string, number> {
  const out: Record<string, number> = { all: rows.length, converted: rows.filter((m) => m.converted).length, admins: rows.filter((m) => m.isAdmin || envAdmins.includes(m.email.toLowerCase())).length };
  for (const j of JOURNEYS) out[j] = rows.filter((m) => m.journey === j).length;
  return out;
}
