import type { MoneyData } from "@/lib/money-data";

/**
 * Every free trial, when it ends, and what became of it. Pure over MoneyData.
 *
 * A trial converts the day its first paid invoice goes through. One that
 * ended with no payment and no cancellation is "ended unpaid" — the card
 * failed or the subscription was left to expire.
 */

export type TrialOutcome = "on trial" | "converted" | "cancelled" | "ended unpaid";
export type TrialRow = {
  stripeSubscriptionId: string;
  userId: string | null;
  email: string;
  name: string | null;
  what: string;
  thenCents: number;
  interval: string | null;
  currency: string;
  startedAt: string;
  endsAt: string;
  outcome: TrialOutcome;
  outcomeAt: string | null;
  daysLeft: number;
  paidTotalCents: number;
  cancelledSince: boolean;
};

const ms = (s: string) => new Date(s).getTime();

export function deriveTrials(d: MoneyData): TrialRow[] {
  const users = new Map(d.users.map((u) => [u.id, u]));
  const out: TrialRow[] = [];
  for (const s of d.subscriptions) {
    if (!s.trialEnd || !s.livemode) continue;
    const u = s.userId ? users.get(s.userId) : undefined;
    const paid = s.paidInvoices > 0;
    // A trial with a cancellation already scheduled is running, but it will
    // never be charged. Counting it as live overstates the trials in flight
    // and flatters the conversion rate, since it never settles either way.
    const stopping = !!s.cancelAt || s.cancelAtPeriodEnd;
    const outcome: TrialOutcome = paid
      ? "converted"
      : s.status === "trialing" && !stopping
        ? "on trial"
        : s.canceledAt || stopping
          ? "cancelled"
          : "ended unpaid";
    out.push({
      stripeSubscriptionId: s.stripeSubscriptionId,
      userId: s.userId,
      email: u?.email ?? "",
      name: u?.name ?? null,
      what: (s.offerId && d.names.offers.get(s.offerId)?.name) || (s.productId && d.names.products.get(s.productId)?.name) || "Subscription",
      thenCents: s.amountCents,
      interval: s.interval,
      currency: s.currency,
      startedAt: s.trialStart ?? s.startedAt,
      endsAt: s.trialEnd,
      outcome,
      outcomeAt: paid ? s.firstPaidAt : s.canceledAt ?? (outcome === "ended unpaid" ? s.trialEnd : null),
      daysLeft: Math.round((ms(s.trialEnd) - d.now.getTime()) / 864e5),
      paidTotalCents: s.paidTotalCents,
      cancelledSince: paid && !!s.canceledAt,
    });
  }
  return out.sort((a, b) => ms(b.startedAt) - ms(a.startedAt));
}

export type TrialView = "all" | "on trial" | "ending" | "converted" | "lost";

export function trialsFor(rows: TrialRow[], view: TrialView): TrialRow[] {
  switch (view) {
    case "on trial": return rows.filter((t) => t.outcome === "on trial");
    case "ending": return rows.filter((t) => t.outcome === "on trial" && t.daysLeft <= 7);
    case "converted": return rows.filter((t) => t.outcome === "converted");
    case "lost": return rows.filter((t) => t.outcome === "cancelled" || t.outcome === "ended unpaid");
    default: return rows;
  }
}

export type TrialWeek = { weekStart: string; started: number; converted: number; lost: number; pending: number; paidCents: number };

export function trialsByWeek(rows: TrialRow[]): TrialWeek[] {
  const weeks = new Map<string, TrialWeek>();
  for (const t of rows) {
    const d = new Date(t.startedAt);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const k = monday.toISOString();
    const w = weeks.get(k) ?? { weekStart: k, started: 0, converted: 0, lost: 0, pending: 0, paidCents: 0 };
    w.started += 1;
    if (t.outcome === "converted") w.converted += 1;
    else if (t.outcome === "on trial") w.pending += 1;
    else w.lost += 1;
    w.paidCents += t.paidTotalCents;
    weeks.set(k, w);
  }
  return [...weeks.values()].sort((a, b) => ms(b.weekStart) - ms(a.weekStart));
}
