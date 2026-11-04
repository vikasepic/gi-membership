import type { MoneyData } from "@/lib/money-data";
import { subView, subscriptionNamer, type SubView } from "@/lib/member-money";
import { trialOutcomeOf, trialOutcomeAt, type TrialOutcome } from "@/lib/trials-view";

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
