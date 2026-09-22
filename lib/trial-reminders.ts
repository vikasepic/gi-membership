import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTrialEndingEmail } from "@/lib/subscription-emails";
import { stripe } from "@/lib/stripe";

/**
 * The trial reminder, one day before the card is charged.
 *
 * It used to ride Stripe's `customer.subscription.trial_will_end`, which fires
 * a fixed three days out and has no setting. Measured 22 Sep 2026 across
 * twenty live events: every one at exactly 3.00 days. So the timing becomes
 * ours, which means a sweep, which means remembering what it has already sent.
 *
 * Run hourly. The window is the next `HOURS_AHEAD`, so a trial ending at any
 * hour is reminded within an hour of its one-day mark rather than at whatever
 * time a daily sweep happened to run.
 */

/** How far ahead to look. One day, plus the sweep's own interval. */
export const HOURS_AHEAD = 25;

export type ReminderResult = {
  ok: boolean;
  due: number;
  sent: number;
  skipped: Record<string, number>;
};

export type Candidate = {
  stripeSubscriptionId: string;
  trialEnd: string;
  status: string;
  cancelAt: string | null;
  cancelAtPeriodEnd: boolean;
  paidInvoices: number;
};

/**
 * Who should hear from us.
 *
 * Pure, so the rules can be read and tested without a database or Stripe.
 *
 * Nobody who has already cancelled: their card will not be charged, and an
 * email saying it will is worse than no email. Nobody who has already paid,
 * because their trial converted early and the reminder would be nonsense.
 * Nothing already past, because a reminder about a charge that has happened
 * is not a reminder.
 */
export function dueForReminder(rows: Candidate[], now: Date, hoursAhead = HOURS_AHEAD): Candidate[] {
  const limit = now.getTime() + hoursAhead * 3600_000;
  return rows.filter((r) => {
    if (r.status !== "trialing") return false;
    if (r.paidInvoices > 0) return false;
    if (r.cancelAt || r.cancelAtPeriodEnd) return false;
    const end = new Date(r.trialEnd).getTime();
    if (!Number.isFinite(end)) return false;
    return end > now.getTime() && end <= limit;
  });
}

export async function sendDueTrialReminders(opts?: { dryRun?: boolean }): Promise<ReminderResult> {
  const skipped: Record<string, number> = {};
  const note = (why: string) => {
    skipped[why] = (skipped[why] ?? 0) + 1;
  };
  const db = createServiceClient();
  const now = new Date();

  const { data, error } = await db
    .from("subscriptions")
    .select("stripe_subscription_id, trial_end, status, cancel_at, cancel_at_period_end, paid_invoices")
    .is("trial_reminder_sent_at", null)
    .not("trial_end", "is", null)
    .eq("livemode", true)
    .order("trial_end", { ascending: true });
  if (error) throw new Error(`sendDueTrialReminders: ${error.message}`);

  const rows: Candidate[] = (data ?? []).map((r) => ({
    stripeSubscriptionId: r.stripe_subscription_id as string,
    trialEnd: r.trial_end as string,
    status: r.status as string,
    cancelAt: (r.cancel_at as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    paidInvoices: (r.paid_invoices as number) ?? 0,
  }));
  const due = dueForReminder(rows, now);

  let sent = 0;
  for (const row of due) {
    if (opts?.dryRun) {
      sent += 1;
      continue;
    }
    // Stamped BEFORE the send, not after. A crash between the two costs one
    // missed reminder; the other order costs a second email to everyone the
    // sweep had already mailed, every hour, until it stopped crashing.
    const { data: claimed } = await db
      .from("subscriptions")
      .update({ trial_reminder_sent_at: now.toISOString() })
      .eq("stripe_subscription_id", row.stripeSubscriptionId)
      .is("trial_reminder_sent_at", null)
      .select("stripe_subscription_id");
    if (!claimed || claimed.length === 0) {
      // Another run of the sweep took it first.
      note("already claimed");
      continue;
    }
    try {
      // Read from Stripe rather than our row: the email states a charge date
      // and a price, and Stripe is where both are actually decided.
      const sub = await stripe().subscriptions.retrieve(row.stripeSubscriptionId);
      if (sub.status !== "trialing") {
        note(`no longer trialing (${sub.status})`);
        continue;
      }
      await sendTrialEndingEmail(sub);
      sent += 1;
    } catch (e) {
      note(`error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
    }
  }

  return { ok: true, due: due.length, sent, skipped };
}
