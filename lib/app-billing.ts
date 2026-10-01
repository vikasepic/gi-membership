import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { rowOf, type SubscriptionRow } from "@/lib/subscriptions";

/**
 * The billing facts a connected app is sent beside the entitlement: what the
 * member pays, when they last paid, and when they next will.
 *
 * Until 1 Oct 2026 an app was told only whether a member had access. It
 * could not show "your trial ends on" or "renews on", and a cancellation
 * scheduled for the end of a paid month looked exactly like a paying member.
 *
 * Every date is an ISO 8601 string in UTC. Read from the `subscriptions`
 * table, which the Stripe webhook re-syncs before it pushes, so the facts are
 * Stripe's as of that event.
 */
export type AppBilling = {
  /** Stripe's own status: trialing, active, past_due, canceled, unpaid… */
  subscriptionStatus: string;
  /** The price per period, in cents. */
  amountCents: number;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  /** A payment plan's number of payments; null for an ordinary subscription. */
  installments: number | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** When the card is next charged; null when nothing more will be. */
  nextPaymentAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** When a scheduled cancellation takes effect: the last day of access. */
  cancelsAt: string | null;
  canceledAt: string | null;
  lastPaymentAt: string | null;
  paidInvoices: number;
  paidTotalCents: number;
};

/** PostgREST answers "2026-10-30 15:29:38+00" or ISO; apps get one shape. */
const iso = (t: string | null): string | null => {
  if (!t) return null;
  const d = new Date(t.includes("T") ? t : t.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function billingOf(s: SubscriptionRow): AppBilling {
  const over = s.status === "canceled" || s.status === "incomplete_expired" || !!s.endedAt;
  const stopping = s.cancelAtPeriodEnd || !!s.cancelAt;
  const planDone = s.installments != null && s.paidInvoices >= s.installments;
  const nextPaymentAt =
    over || stopping || planDone ? null : s.status === "trialing" ? iso(s.trialEnd) : iso(s.currentPeriodEnd);
  return {
    subscriptionStatus: s.status,
    amountCents: s.amountCents,
    currency: s.currency,
    interval: s.interval,
    intervalCount: s.intervalCount,
    installments: s.installments,
    trialEndsAt: iso(s.trialEnd),
    currentPeriodStart: iso(s.currentPeriodStart),
    currentPeriodEnd: iso(s.currentPeriodEnd),
    nextPaymentAt,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    cancelsAt: iso(s.cancelAt),
    canceledAt: iso(s.canceledAt),
    lastPaymentAt: iso(s.lastPaidAt),
    paidInvoices: s.paidInvoices,
    paidTotalCents: s.paidTotalCents,
  };
}

/** The billing facts for one subscription, or null when the store has no record of it. */
export async function billingForSubscription(stripeSubscriptionId: string | null): Promise<AppBilling | null> {
  if (!stripeSubscriptionId) return null;
  const { data } = await createServiceClient()
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  return data ? billingOf(rowOf(data as Record<string, unknown>)) : null;
}
