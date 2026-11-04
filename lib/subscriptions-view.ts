import type { MoneyData } from "@/lib/money-data";
import { subView, subscriptionNamer, type SubView } from "@/lib/member-money";
import { trialOutcomeOf, trialOutcomeAt, type TrialOutcome } from "@/lib/trials-view";
import { fmtDate, relative } from "@/components/admin/money-ui";

/**
 * The Subscriptions page: Trials and Renewals on one page (asked 4 Nov 2026).
 * Spec: docs/superpowers/specs/2026-11-04-subscriptions-page-design.md.
 *
 * Pure over MoneyData, like the other money screens. States come from subView
 * and trial outcomes from trialOutcomeOf, so this page cannot disagree with
 * Members or the ledger about what a subscription is doing.
 */

export type SubChip = "active" | "trial" | "free" | "past-due" | "cancelling" | "ended";
export const SUB_CHIPS: SubChip[] = ["active", "trial", "free", "past-due", "cancelling", "ended"];

export type SubPreset = "around" | "last-30" | "this-month" | "next-30" | "custom";
export type SubFilter = { preset: SubPreset; from: string; to: string; offer: string; state: "all" | SubChip; sort: "date" | "amount" };

export type Charge = { at: string; cents: number };

export type SubRow = {
  stripeSubscriptionId: string;
  userId: string | null;
  email: string;
  name: string | null;
  what: string;
  offerId: string | null;
  productId: string | null;
  state: SubView["state"];
  chip: SubChip;
  startedAt: string;
  endedAt: string | null;
  cancelsAt: string | null;
  trialEnd: string | null;
  nextChargeAt: string | null;
  nextChargeCents: number | null;
  nextChargeNote: string | null;
  priceCents: number;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  installments: number | null;
  paidInvoices: number;
  paidTotalCents: number;
  /** Money it actually brought in: paid order lines, by the order's date. */
  charges: Charge[];
  trial: { outcome: TrialOutcome; at: string | null } | null;
};

const DAY_MS = 864e5;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dayMs(v)) && isoDay(dayMs(v)) === v;

/**
 * Every value off the URL is a whitelist: one we do not recognise picks the
 * default. `today` is a parameter, as rangeOf (lib/traffic-funnel.ts) takes
 * it, so one render resolves one range.
 */
export function subFilterFrom(sp: Record<string, string | string[] | undefined>, today: string): SubFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const t = dayMs(today);
  const shift = (n: number) => isoDay(t + n * DAY_MS);
  const presets: Record<Exclude<SubPreset, "custom">, [string, string]> = {
    around: [shift(-30), shift(30)],
    "last-30": [shift(-29), today],
    "this-month": [`${today.slice(0, 7)}-01`, today],
    "next-30": [today, shift(29)],
  };
  const state = one("state");
  const base = {
    offer: one("offer").slice(0, 80),
    state: (SUB_CHIPS as string[]).includes(state) ? (state as SubChip) : ("all" as const),
    sort: one("sort") === "amount" ? ("amount" as const) : ("date" as const),
  };
  const preset = one("preset");
  if (preset in presets) {
    const [from, to] = presets[preset as keyof typeof presets];
    return { preset: preset as SubPreset, from, to, ...base };
  }
  const [from, to] = [one("from"), one("to")];
  if (isDay(from) && isDay(to)) {
    return { preset: "custom", ...(from <= to ? { from, to } : { from: to, to: from }), ...base };
  }
  const [dFrom, dTo] = presets.around;
  return { preset: "around", from: dFrom, to: dTo, ...base };
}

function chipOf(v: SubView, status: string): SubChip {
  switch (v.state) {
    case "paying": return "active";
    case "on trial": return "trial";
    case "free access": return "free";
    case "past due": return "past-due";
    case "cancelling": return "cancelling";
    // subView calls two different things "trial cancelled": a running trial
    // set to cancel (still live) and an unpaid trial that has ended.
    case "trial cancelled": return status === "trialing" ? "cancelling" : "ended";
    default: return "ended";
  }
}

export function deriveSubscriptions(d: MoneyData): SubRow[] {
  const users = new Map(d.users.map((u) => [u.id, u]));
  const nameOf = subscriptionNamer(d);
  const mine = d.subscriptions.filter((s) => s.livemode && (s.offerId || s.productId));
  const ids = new Set(mine.map((s) => s.stripeSubscriptionId));

  // Paid order lines, by subscription. A recurring product's first charge is a
  // `product` line written before the subscription existed, so it carries no
  // id (lib/checkout.ts, the SetupIntent path): it goes to the same person's
  // subscription for that product, the earliest if there are several.
  const orders = new Map(d.orders.filter((o) => o.status === "paid").map((o) => [o.id, o]));
  const productSub = new Map<string, string>();
  for (const s of [...mine].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))) {
    const key = `${s.userId}|${s.productId}`;
    if (s.productId && s.userId && !productSub.has(key)) productSub.set(key, s.stripeSubscriptionId);
  }
  const charges = new Map<string, { at: string; cents: number }[]>();
  for (const it of d.items) {
    const o = orders.get(it.orderId);
    if (!o) continue;
    const subId =
      it.stripeSubscriptionId ??
      (it.kind === "product" && it.productId && o.userId ? productSub.get(`${o.userId}|${it.productId}`) : undefined);
    if (!subId || !ids.has(subId)) continue;
    charges.set(subId, [...(charges.get(subId) ?? []), { at: o.createdAt, cents: it.amountCents }]);
  }

  return mine
    .map((s) => {
      const v = subView(s, nameOf(s));
      const u = s.userId ? users.get(s.userId) : undefined;
      return {
        stripeSubscriptionId: s.stripeSubscriptionId,
        userId: s.userId,
        email: u?.email ?? "",
        name: u?.name ?? null,
        what: v.name,
        offerId: s.offerId,
        productId: s.productId,
        state: v.state,
        chip: chipOf(v, s.status),
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        cancelsAt: v.cancelsAt,
        trialEnd: s.trialEnd,
        nextChargeAt: v.nextChargeAt,
        nextChargeCents: v.nextChargeCents,
        nextChargeNote: v.nextChargeNote,
        priceCents: s.amountCents,
        currency: s.currency,
        interval: s.interval,
        intervalCount: s.intervalCount,
        installments: s.installments,
        paidInvoices: s.paidInvoices,
        paidTotalCents: s.paidTotalCents,
        charges: (charges.get(s.stripeSubscriptionId) ?? []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
        trial: s.trialEnd ? { outcome: trialOutcomeOf(s), at: trialOutcomeAt(s) } : null,
      };
    })
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

const ms = (iso: string) => Date.parse(iso);
const endOf = (day: string) => dayMs(day) + DAY_MS - 1;

/** `n` billing periods after `iso`, by the calendar for months and years (UTC). */
function addPeriods(iso: string, interval: string | null, count: number | null, n: number): string {
  const d = new Date(iso);
  const k = (count ?? 1) * n;
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + k);
  else if (interval === "week") d.setUTCDate(d.getUTCDate() + 7 * k);
  else if (interval === "day") d.setUTCDate(d.getUTCDate() + k);
  else d.setUTCMonth(d.getUTCMonth() + k);
  return d.toISOString();
}

/**
 * What a subscription will be charged from now to the end of `to`.
 *
 * The first charge is Stripe's own preview, so a free month counts $0, and an
 * unknown preview stays unknown rather than being filled from the price.
 * Later charges in a long range are at the list price, assuming nobody
 * cancels and no coupon changes; a payment plan stops at its last instalment.
 * Past due is still owed while Stripe retries, so its date behind us counts
 * as now, as the Renewals page counted it.
 */
export function expectedCharges(r: SubRow, now: Date, to: string): (Charge | { at: string; cents: null })[] {
  if (!r.nextChargeAt || !["paying", "past due", "on trial"].includes(r.state)) return [];
  const end = endOf(to);
  const base = r.nextChargeAt;
  const overdue = r.state === "past due" && ms(base) < now.getTime();
  // A date behind us on anything but past due is a row the sync stopped
  // updating, not money on its way.
  if (!overdue && ms(base) < now.getTime()) return [];
  const cap = r.installments ? Math.max(0, r.installments - r.paidInvoices) : Infinity;
  const out: (Charge | { at: string; cents: null })[] = [];
  for (let i = 0; out.length < cap; i++) {
    const when = i === 0 && overdue ? now.toISOString() : addPeriods(base, r.interval, r.intervalCount, i);
    if (ms(when) > end) break;
    out.push(i === 0 ? { at: when, cents: r.nextChargeCents } : { at: when, cents: r.priceCents });
  }
  return out;
}

/** One product or offer; an id that matches nothing shows everything, as a stale link should. */
function scoped(rows: SubRow[], offer: string): SubRow[] {
  if (!offer) return rows;
  const hit = rows.filter((r) => r.offerId === offer || r.productId === offer);
  return hit.length > 0 ? hit : rows;
}

export type SubTotals = {
  /** Null when the range has no past part; Expected, when it has no future part. */
  collectedCents: number | null;
  expectedCents: number | null;
  unknown: number;
  running: { total: number; paying: number; cancelling: number; pastDue: number };
  onTrial: number;
  endingThisWeek: number;
  converted: number;
  lost: number;
  free: number;
  rate: number | null;
  ended: number;
  setToCancel: number;
  setToCancelFirst: string | null;
  currency: string;
};

export function subTotals(all: SubRow[], f: SubFilter, now: Date): SubTotals {
  const rows = scoped(all, f.offer);
  const t = now.getTime();
  const from = dayMs(f.from);
  const end = endOf(f.to);
  const within = (iso: string | null) => !!iso && ms(iso) >= from && ms(iso) <= end;

  let collectedCents: number | null = null;
  if (from <= t) {
    collectedCents = 0;
    for (const r of rows) for (const c of r.charges) if (ms(c.at) >= from && ms(c.at) <= Math.min(end, t)) collectedCents += c.cents;
  }
  let expectedCents: number | null = null;
  let unknown = 0;
  if (end >= t) {
    expectedCents = 0;
    for (const r of rows) {
      for (const c of expectedCharges(r, now, f.to)) {
        if (ms(c.at) < from) continue;
        if (c.cents == null) unknown += 1;
        else expectedCents += c.cents;
      }
    }
  }

  const count = (state: SubView["state"]) => rows.filter((r) => r.state === state).length;
  const running = { paying: count("paying"), cancelling: count("cancelling"), pastDue: count("past due") };
  const settled = rows.filter((r) => r.trial && within(r.trial.at));
  const converted = settled.filter((r) => r.trial!.outcome === "converted").length;
  const lost = settled.filter((r) => r.trial!.outcome === "cancelled" || r.trial!.outcome === "ended unpaid").length;
  const cancelling = rows.filter((r) => r.chip === "cancelling");
  const firsts = cancelling.map((r) => r.cancelsAt).filter((x): x is string => !!x).sort((a, b) => ms(a) - ms(b));

  return {
    collectedCents,
    expectedCents,
    unknown,
    running: { total: running.paying + running.cancelling + running.pastDue, ...running },
    onTrial: count("on trial"),
    endingThisWeek: rows.filter((r) => r.state === "on trial" && r.trialEnd && ms(r.trialEnd) - t <= 7 * DAY_MS).length,
    converted,
    lost,
    free: settled.filter((r) => r.trial!.outcome === "free access").length,
    rate: converted + lost ? Math.round((converted / (converted + lost)) * 100) : null,
    // Paid ones only: a trial that never paid is already counted as lost.
    ended: rows.filter((r) => r.paidInvoices > 0 && within(r.endedAt)).length,
    setToCancel: cancelling.length,
    setToCancelFirst: firsts[0] ?? null,
    currency: rows[0]?.currency ?? "usd",
  };
}

/** Something happened to it inside the range: paid, due, started, ended, or a trial ends. */
export function inRange(r: SubRow, f: SubFilter, now: Date): boolean {
  const from = dayMs(f.from);
  const end = endOf(f.to);
  const within = (iso: string | null) => !!iso && ms(iso) >= from && ms(iso) <= end;
  return (
    r.charges.some((c) => within(c.at)) ||
    expectedCharges(r, now, f.to).some((c) => within(c.at)) ||
    within(r.startedAt) ||
    within(r.endedAt) ||
    within(r.cancelsAt) ||
    (r.chip === "trial" && within(r.trialEnd))
  );
}

function inList(rows: SubRow[], f: SubFilter, now: Date): SubRow[] {
  return scoped(rows, f.offer).filter((r) => inRange(r, f, now));
}

/** The rows a range lists, narrowed by state and sorted. Unknowns sort last: they are not small, they are not known. */
export function listRows(rows: SubRow[], f: SubFilter, now: Date): SubRow[] {
  const out = inList(rows, f, now).filter((r) => f.state === "all" || r.chip === f.state);
  const key =
    f.sort === "amount"
      ? (r: SubRow) => (r.nextChargeCents == null ? Infinity : -r.nextChargeCents)
      : (r: SubRow) => (r.nextChargeAt ? ms(r.nextChargeAt) : Infinity);
  return [...out].sort((a, b) => key(a) - key(b));
}

/** Counts of the list a range shows, so "All" never means every subscription ever. */
export function chipCounts(rows: SubRow[], f: SubFilter, now: Date): Record<"all" | SubChip, number> {
  const list = inList(rows, f, now);
  const out = { all: list.length } as Record<"all" | SubChip, number>;
  for (const c of SUB_CHIPS) out[c] = list.filter((r) => r.chip === c).length;
  return out;
}

/** What became of a trial, in one line for the list. Null when there was no trial. */
export function trialNote(r: SubRow, now: Date): string | null {
  if (!r.trial) return null;
  const on = (iso: string | null) => (iso ? ` ${fmtDate(iso)}` : "");
  switch (r.trial.outcome) {
    case "converted": return `trial, converted${on(r.trial.at)}`;
    case "cancelled": return `trial, cancelled${on(r.trial.at)}`;
    case "free access": return "trial, free access";
    case "ended unpaid": return `trial, ended unpaid${on(r.trial.at)}`;
    default: return r.trialEnd ? `trial, ends ${relative(r.trialEnd, now)}` : "trial";
  }
}
