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

/**
 * A reminder only counts for the trial end it was sent about.
 *
 * Extending a trial (the admin's Extend trial, or trial_end changed straight
 * in Stripe, which the webhook syncs) moves the charge date but leaves the
 * old stamp behind. Treating any stamp as "reminded" meant an extended trial
 * got no reminder before its new charge. A stamp older than this, measured
 * back from the current trial end, belongs to an earlier date and is ignored.
 */
export const REMINDER_VALID_HOURS = 48;

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
  /** When the reminder went out, if it has. See REMINDER_VALID_HOURS. */
  reminderSentAt: string | null;
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
    if (r.reminderSentAt && new Date(r.reminderSentAt).getTime() >= end - REMINDER_VALID_HOURS * 3600_000) return false;
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
    .select("stripe_subscription_id, trial_end, status, cancel_at, cancel_at_period_end, paid_invoices, trial_reminder_sent_at")
    // Only the window, stamped or not: a stamp may belong to an earlier trial
    // end (see REMINDER_VALID_HOURS), so it cannot be filtered out here.
    .gt("trial_end", now.toISOString())
    .lte("trial_end", new Date(now.getTime() + HOURS_AHEAD * 3600_000).toISOString())
    .eq("livemode", true)
    // Only what this store sold. The table also held the Funnel App's own
    // signups and Circle's memberships, and one Funnel App signup was sent
    // the store's reminder on 27 Sep 2026.
    .or("offer_id.not.is.null,product_id.not.is.null")
    .order("trial_end", { ascending: true });
  if (error) throw new Error(`sendDueTrialReminders: ${error.message}`);

  const rows: Candidate[] = (data ?? []).map((r) => ({
    stripeSubscriptionId: r.stripe_subscription_id as string,
    trialEnd: r.trial_end as string,
    status: r.status as string,
    cancelAt: (r.cancel_at as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    paidInvoices: (r.paid_invoices as number) ?? 0,
    reminderSentAt: (r.trial_reminder_sent_at as string | null) ?? null,
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
    // Compare-and-set on the stamp we read, so two sweeps still cannot both
    // send, whether the old stamp was empty or belonged to an earlier date.
    const claim = db
      .from("subscriptions")
      .update({ trial_reminder_sent_at: now.toISOString() })
      .eq("stripe_subscription_id", row.stripeSubscriptionId);
    const { data: claimed } = await (row.reminderSentAt
      ? claim.eq("trial_reminder_sent_at", row.reminderSentAt)
      : claim.is("trial_reminder_sent_at", null)
    ).select("stripe_subscription_id");
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
      // Stripe's word on whose it is, since the email speaks for the store.
      if (sub.metadata?.store_created !== "true") {
        note("not a store subscription");
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
