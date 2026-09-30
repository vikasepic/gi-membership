import { describe, it, expect } from "vitest";
import { trialOutcomeOf, trialsByWeek, trialsFor, type TrialRow } from "@/lib/trials-view";

/**
 * What became of a trial, one rule for the Trials page and the ledger.
 * 30 Sep 2026: eleven Funnel App signups on a repeating 100% coupon read
 * "ended unpaid, the card was not charged", which looks like eleven failed
 * payments. Stripe had them active at $0.
 */
const base = { paidInvoices: 0, status: "trialing", cancelAt: null, cancelAtPeriodEnd: false, canceledAt: null };

describe("trialOutcomeOf", () => {
  it("a paid invoice is a conversion, whatever happened after", () => {
    expect(trialOutcomeOf({ ...base, paidInvoices: 1, status: "canceled", canceledAt: "2026-09-20T00:00:00Z" })).toBe("converted");
  });

  it("still on trial, unless a cancellation is already booked", () => {
    expect(trialOutcomeOf(base)).toBe("on trial");
    expect(trialOutcomeOf({ ...base, cancelAtPeriodEnd: true })).toBe("cancelled");
    expect(trialOutcomeOf({ ...base, cancelAt: "2026-10-01T00:00:00Z" })).toBe("cancelled");
  });

  it("active after the trial with nothing paid is free access, not a failed payment", () => {
    expect(trialOutcomeOf({ ...base, status: "active" })).toBe("free access");
  });

  it("a real failure still reads as ended unpaid", () => {
    for (const status of ["past_due", "unpaid", "incomplete_expired"]) {
      expect(trialOutcomeOf({ ...base, status })).toBe("ended unpaid");
    }
  });

  it("cancelled without paying is cancelled", () => {
    expect(trialOutcomeOf({ ...base, status: "canceled", canceledAt: "2026-09-04T00:00:00Z" })).toBe("cancelled");
  });
});

describe("free access in the numbers", () => {
  const row = (outcome: TrialRow["outcome"]): TrialRow =>
    ({ outcome, startedAt: "2026-09-01T10:00:00Z", paidTotalCents: 0, daysLeft: -20 }) as TrialRow;
  const rows = [row("converted"), row("free access"), row("free access"), row("ended unpaid")];

  it("is neither converted nor lost", () => {
    expect(trialsFor(rows, "lost")).toHaveLength(1);
    expect(trialsFor(rows, "converted")).toHaveLength(1);
    expect(trialsFor(rows, "free")).toHaveLength(2);
  });

  it("has its own count in the week, so paid + lost + free + pending = started", () => {
    expect(trialsByWeek(rows)[0]).toMatchObject({ started: 4, converted: 1, lost: 1, free: 2, pending: 0 });
  });
});
