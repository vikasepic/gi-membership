import "server-only";
import { stripe } from "@/lib/stripe";

/**
 * The Stripe half of a payment plan.
 *
 * A plan is an ordinary subscription plus a schedule that ends it after N
 * invoices. The schedule is what makes "3 payments" mean three: iterations
 * count billing periods, where a cancel_at date is arithmetic a delayed
 * retry can land on the wrong side of.
 */

type SubLike = { id: string; trial_end: number | null; items: { data: { price: { id: string } }[] } };

/**
 * Wrap a just-created subscription in a schedule of exactly N invoices.
 *
 * A trial gets its own phase. Inside the billing phase it would eat into the
 * iterations, and "7 days free then 3 payments" would bill twice.
 * Idempotent on the subscription: the thank-you page and the webhook race
 * to fulfil, and one schedule is the right number.
 */
export async function scheduleInstalments(sub: SubLike, installments: number): Promise<string> {
  const s = stripe();
  const schedule = await s.subscriptionSchedules.create(
    { from_subscription: sub.id },
    { idempotencyKey: `plan_${sub.id}` },
  );
  const items = [{ price: sub.items.data[0].price.id, quantity: 1 }];
  const billing = { items, iterations: installments };
  const phases = sub.trial_end ? [{ items, trial: true, end_date: sub.trial_end }, billing] : [billing];
  await s.subscriptionSchedules.update(schedule.id, { end_behavior: "cancel", phases });
  return schedule.id;
}

/** The schedule managing a subscription, or null. */
async function scheduleOf(subscriptionId: string): Promise<string | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const sched = (sub as { schedule?: string | { id: string } | null }).schedule;
  return typeof sched === "string" ? sched : (sched?.id ?? null);
}

/**
 * End it now. Stripe refuses to cancel a subscription a schedule manages,
 * so the schedule is what gets cancelled, and the subscription goes with it.
 */
export async function endSubscription(subscriptionId: string): Promise<void> {
  const sched = await scheduleOf(subscriptionId);
  if (sched) await stripe().subscriptionSchedules.cancel(sched);
  else await stripe().subscriptions.cancel(subscriptionId);
}

/**
 * Hand the subscription back to itself so cancel_at_period_end can be set.
 * Releasing keeps the subscription running; it only stops the schedule
 * driving it, so the member's own cancel behaves as it does for any
 * subscription: they keep what they paid for until the period ends.
 */
export async function releaseSchedule(subscriptionId: string): Promise<void> {
  const sched = await scheduleOf(subscriptionId);
  if (sched) await stripe().subscriptionSchedules.release(sched);
}
