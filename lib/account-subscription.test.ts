import { describe, it, expect } from "vitest";
import { memberSubscriptionLine } from "@/lib/account-subscription";
import type { SubscriptionRow } from "@/lib/subscriptions";

/**
 * What a member reads under a subscription purchase on their account page.
 * Asked for 29 Sep 2026: a cancelled member could not see that it had worked,
 * or how long they kept access.
 */
const NOW = new Date("2026-09-29T12:00:00Z");
const line = (s: SubscriptionRow) => memberSubscriptionLine(s, NOW);

const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: "r1",
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  userId: "u1",
  offerId: "o1",
  productId: null,
  status: "active",
  amountCents: 2900,
  currency: "usd",
  interval: "month",
  intervalCount: 1,
  installments: null,
  trialStart: null,
  trialEnd: null,
  currentPeriodStart: "2026-09-05T00:00:00Z",
  currentPeriodEnd: "2026-10-05T00:00:00Z",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  paidInvoices: 1,
  paidTotalCents: 2900,
  firstPaidAt: "2026-09-05T00:00:00Z",
  lastPaidAt: "2026-09-05T00:00:00Z",
  livemode: true,
  startedAt: "2026-09-05T00:00:00Z",
  ...over,
});

describe("the status line under a subscription purchase", () => {
  it("a trial says when the first payment is", () => {
    const out = line(
      sub({ status: "trialing", paidInvoices: 0, trialEnd: "2026-10-05T17:52:59Z", currentPeriodEnd: "2026-10-05T17:52:59Z" }),
    );
    expect(out).toEqual({ state: "Free trial", detail: "first payment 5 Oct", tone: "ok" });
  });

  it("a paying subscription says when it renews", () => {
    expect(line(sub({}))).toEqual({ state: "Active", detail: "renews 5 Oct", tone: "ok" });
  });

  it("an instalment plan says next payment, not renews", () => {
    expect(line(sub({ installments: 3 })).detail).toBe("next payment 5 Oct");
  });

  it("cancelled but still running says until when they keep access", () => {
    expect(line(sub({ cancelAtPeriodEnd: true }))).toEqual({
      state: "Cancelled",
      detail: "access until 5 Oct",
      tone: "warn",
    });
    // Stripe's other way of ending one: a dated cancel_at with the flag off.
    expect(line(sub({ cancelAt: "2026-10-01T00:00:00Z" })).detail).toBe("access until 1 Oct");
  });

  it("a trial cancelled before it ended keeps access to the trial's end", () => {
    const out = line(
      sub({ status: "trialing", paidInvoices: 0, trialEnd: "2026-09-28T17:52:59Z", currentPeriodEnd: "2026-09-28T17:52:59Z", cancelAtPeriodEnd: true }),
    );
    expect(out).toEqual({ state: "Trial cancelled", detail: "access until 28 Sept", tone: "warn" });
  });

  it("a trial cancelled and over says when access ended", () => {
    const out = line(
      sub({ status: "canceled", paidInvoices: 0, canceledAt: "2026-09-27T16:18:00Z", endedAt: "2026-09-27T16:18:00Z" }),
    );
    expect(out).toEqual({ state: "Trial cancelled", detail: "access ended 27 Sept", tone: "ended" });
  });

  it("a paid subscription that has ended says so, with the date", () => {
    const out = line(sub({ status: "canceled", endedAt: "2026-09-21T03:33:00Z" }));
    expect(out).toEqual({ state: "Ended", detail: "access ended 21 Sept", tone: "ended" });
  });

  it("keeps the year for a date in another year", () => {
    expect(line(sub({ currentPeriodEnd: "2027-01-05T00:00:00Z" })).detail).toBe("renews 5 Jan 2027");
  });

  it("a failed payment asks them to update the card", () => {
    expect(line(sub({ status: "past_due" }))).toEqual({
      state: "Payment failed",
      detail: "update your card under Billing",
      tone: "warn",
    });
  });
});
