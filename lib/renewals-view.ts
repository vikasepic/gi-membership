import type { MoneyData } from "@/lib/money-data";
import { subView, subscriptionNamer } from "@/lib/member-money";

/**
 * What comes in over the next 30 days, and from whom. Pure over MoneyData.
 *
 * Asked for 3 Nov 2026. The amount is Stripe's own preview of each next
 * invoice (migration 0097), so a member on a free month counts as $0, not as
 * the price. A figure Stripe has not given yet stays unknown and is counted
 * as such, never filled in from the list price.
 */

export type RenewalKind = "renewal" | "trial converting" | "past due" | "cancelling";
export const RENEWAL_KINDS: RenewalKind[] = ["renewal", "trial converting", "past due", "cancelling"];
export const WINDOW_DAYS = 30;

export type RenewalRow = {
  stripeSubscriptionId: string;
  userId: string | null;
  email: string;
  name: string | null;
  what: string;
  offerId: string | null;
  productId: string | null;
  kind: RenewalKind;
  at: string;
  /** What Stripe will take. Null: unknown, or nothing (a cancellation). */
  amountCents: number | null;
  priceCents: number;
  currency: string;
  note: string | null;
  startedAt: string;
  paidInvoices: number;
  paidTotalCents: number;
};

const ms = (s: string) => new Date(s).getTime();

export function deriveRenewals(d: MoneyData): RenewalRow[] {
  const users = new Map(d.users.map((u) => [u.id, u]));
  const nameOf = subscriptionNamer(d);
  const now = d.now.getTime();
  const end = now + WINDOW_DAYS * 864e5;
  const out: RenewalRow[] = [];
  for (const s of d.subscriptions) {
    // Grow's own, as on the Trials page: one with no offer or product is a
    // connected app's signup, and its money is not this store's.
    if (!s.livemode || (!s.offerId && !s.productId)) continue;
    const v = subView(s, nameOf(s));
    let kind: RenewalKind;
    let when: string | null;
    if (v.state === "paying") [kind, when] = ["renewal", v.nextChargeAt];
    else if (v.state === "on trial") [kind, when] = ["trial converting", v.nextChargeAt];
    else if (v.state === "past due") [kind, when] = ["past due", v.nextChargeAt];
    else if (v.state === "cancelling" || v.state === "trial cancelled") [kind, when] = ["cancelling", v.cancelsAt];
    else continue;
    if (!when || ms(when) > end) continue;
    // A date already behind us is a row the sync stopped updating, except
    // past due, which is still owed while Stripe retries it.
    if (kind !== "past due" && ms(when) < now) continue;
    const u = s.userId ? users.get(s.userId) : undefined;
    out.push({
      stripeSubscriptionId: s.stripeSubscriptionId,
      userId: s.userId,
      email: u?.email ?? "",
      name: u?.name ?? null,
      what: v.name,
      offerId: s.offerId,
      productId: s.productId,
      kind,
      at: when,
      amountCents: kind === "cancelling" ? null : v.nextChargeCents,
      priceCents: s.amountCents,
      currency: s.currency,
      note: v.nextChargeNote,
      startedAt: s.startedAt,
      paidInvoices: s.paidInvoices,
      paidTotalCents: s.paidTotalCents,
    });
  }
  return out.sort((a, b) => ms(a.at) - ms(b.at));
}

export type RenewalTotals = {
  comingInCents: number;
  unknown: number;
  renewals: { count: number; cents: number };
  trials: { count: number; cents: number };
  pastDue: { count: number; cents: number };
  cancelling: { count: number; cents: number };
  currency: string;
};

export function renewalTotals(rows: RenewalRow[]): RenewalTotals {
  const group = (k: RenewalKind) => {
    const of = rows.filter((r) => r.kind === k);
    const cents = of.reduce((n, r) => n + (k === "cancelling" ? r.priceCents : (r.amountCents ?? 0)), 0);
    return { count: of.length, cents };
  };
  const renewals = group("renewal");
  const trials = group("trial converting");
  const pastDue = group("past due");
  return {
    comingInCents: renewals.cents + trials.cents + pastDue.cents,
    unknown: rows.filter((r) => r.kind !== "cancelling" && r.amountCents == null).length,
    renewals,
    trials,
    pastDue,
    cancelling: group("cancelling"),
    currency: rows[0]?.currency ?? "usd",
  };
}

export type RenewalFilter = { kind: "all" | RenewalKind; offer: string; sort: "date" | "amount" };

/** Every value off the URL is a whitelist: one we do not recognise picks the default. */
export function renewalFilterFrom(sp: Record<string, string | string[] | undefined>): RenewalFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const kind = one("kind");
  return {
    kind: (RENEWAL_KINDS as string[]).includes(kind) ? (kind as RenewalKind) : "all",
    offer: one("offer").slice(0, 80),
    sort: one("sort") === "amount" ? "amount" : "date",
  };
}

export function applyRenewalFilter(rows: RenewalRow[], f: RenewalFilter): RenewalRow[] {
  const out = rows.filter((r) => (f.kind === "all" || r.kind === f.kind) && (!f.offer || r.offerId === f.offer || r.productId === f.offer));
  // Unknown amounts sort last: they are not small, they are not known.
  return f.sort === "amount" ? [...out].sort((a, b) => (b.amountCents ?? -1) - (a.amountCents ?? -1)) : out;
}
