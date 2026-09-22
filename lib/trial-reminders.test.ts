import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dueForReminder, HOURS_AHEAD, type Candidate } from "@/lib/trial-reminders";
import { chargeDayLabel } from "@/lib/subscription-emails";

/**
 * The trial reminder, one day out.
 *
 * It used to be Stripe's `customer.subscription.trial_will_end`, which fires
 * a fixed three days before the trial ends. Measured 22 Sep 2026 across
 * twenty live events: every one at exactly 3.00 days, with no setting to move
 * it. So the timing is ours now, which means a sweep, which means rules about
 * who should hear from us.
 */
const NOW = new Date("2026-09-22T12:00:00Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600_000).toISOString();

const sub = (o: Partial<Candidate>): Candidate => ({
  stripeSubscriptionId: "sub_1",
  trialEnd: at(24),
  status: "trialing",
  cancelAt: null,
  cancelAtPeriodEnd: false,
  paidInvoices: 0,
  ...o,
});

describe("who is due a reminder", () => {
  it("someone whose trial ends in a day", () => {
    expect(dueForReminder([sub({})], NOW)).toHaveLength(1);
  });

  it("nobody whose trial is further off than the window", () => {
    expect(dueForReminder([sub({ trialEnd: at(HOURS_AHEAD + 1) })], NOW)).toHaveLength(0);
    expect(dueForReminder([sub({ trialEnd: at(24 * 7) })], NOW)).toHaveLength(0);
  });

  it("nobody whose trial has already ended", () => {
    // A reminder about a charge that has happened is not a reminder.
    expect(dueForReminder([sub({ trialEnd: at(-1) })], NOW)).toHaveLength(0);
  });

  it("nobody who has already cancelled", () => {
    // Their card will not be charged. An email saying it will is worse than
    // no email at all.
    expect(dueForReminder([sub({ cancelAt: at(24) })], NOW)).toHaveLength(0);
    expect(dueForReminder([sub({ cancelAtPeriodEnd: true })], NOW)).toHaveLength(0);
  });

  it("nobody who has already paid", () => {
    expect(dueForReminder([sub({ paidInvoices: 1 })], NOW)).toHaveLength(0);
  });

  it("nobody whose subscription is no longer trialing", () => {
    expect(dueForReminder([sub({ status: "active" })], NOW)).toHaveLength(0);
    expect(dueForReminder([sub({ status: "canceled" })], NOW)).toHaveLength(0);
  });

  it("ignores a trial end that is not a date", () => {
    expect(dueForReminder([sub({ trialEnd: "not a date" })], NOW)).toHaveLength(0);
  });

  it("looks slightly further than a day, so an hourly sweep misses nobody", () => {
    // A trial ending 24.5 hours out would fall between two runs of a sweep
    // that looked exactly one day ahead.
    expect(HOURS_AHEAD).toBeGreaterThan(24);
    expect(dueForReminder([sub({ trialEnd: at(24.5) })], NOW)).toHaveLength(1);
  });
});

describe("what the email says the charge day is", () => {
  it("says tomorrow when it is tomorrow", () => {
    expect(chargeDayLabel(Math.floor(new Date(at(24)).getTime() / 1000), NOW)).toMatch(/^tomorrow, /);
  });

  it("gives a bare date when it is further off", () => {
    expect(chargeDayLabel(Math.floor(new Date(at(24 * 5)).getTime() / 1000), NOW)).not.toMatch(/tomorrow/);
  });

  it("falls back to words when there is no date at all", () => {
    expect(chargeDayLabel(null, NOW)).toBe("the end of your trial");
  });
});

describe("the sweep itself", () => {
  const sweep = readFileSync("lib/trial-reminders.ts", "utf8");
  const webhook = readFileSync("app/api/webhooks/stripe/route.ts", "utf8");

  it("claims the row before sending, never after", () => {
    // The other order mails everyone again, every hour, until it stops
    // crashing. This order costs at most one missed reminder.
    const claim = sweep.indexOf('.update({ trial_reminder_sent_at');
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(sweep.indexOf("await sendTrialEndingEmail"));
    expect(sweep).toContain('.is("trial_reminder_sent_at", null)');
  });

  it("re-reads Stripe before mailing, since the price and date live there", () => {
    expect(sweep).toContain("subscriptions.retrieve");
    expect(sweep).toContain('sub.status !== "trialing"');
  });

  it("only ever looks at live subscriptions", () => {
    expect(sweep).toContain('.eq("livemode", true)');
  });

  it("Stripe's own three-day event no longer sends mail", () => {
    expect(webhook).toContain('case "customer.subscription.trial_will_end":');
    expect(webhook).not.toContain("sendTrialEndingEmail");
  });
});
