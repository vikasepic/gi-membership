import { describe, it, expect } from "vitest";
import type { SubscriptionRow } from "@/lib/subscriptions";
import { billingOf } from "@/lib/app-billing";

/**
 * The billing facts a connected app is sent beside the entitlement.
 *
 * Until 1 Oct 2026 an app was told only whether a member had access. It could
 * not show "your trial ends on", "you were charged on", or "renews on", and a
 * scheduled cancellation looked exactly like a paying member, so the apps
 * asked the members instead. `nextPaymentAt` is the one an app most needs and
 * the one easiest to get wrong, so most of this is about it.
 */

const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: "row",
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
  trialStart: "2026-09-23T15:29:38+00:00",
  trialEnd: "2026-09-30T15:29:38+00:00",
  currentPeriodStart: "2026-09-30T15:29:38+00:00",
  currentPeriodEnd: "2026-10-30T15:29:38+00:00",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  paidInvoices: 1,
  paidTotalCents: 2900,
  firstPaidAt: "2026-09-30T16:30:31+00:00",
  lastPaidAt: "2026-09-30T16:30:31+00:00",
  livemode: true,
  startedAt: "2026-09-23T15:29:38+00:00",
  ...over,
});

describe("billingOf", () => {
  it("a paying member: the price, the last payment, and the next one at the end of the period", () => {
    expect(billingOf(sub({}))).toEqual({
      subscriptionStatus: "active",
      amountCents: 2900,
      currency: "usd",
      interval: "month",
      intervalCount: 1,
      installments: null,
      trialEndsAt: "2026-09-30T15:29:38.000Z",
      currentPeriodStart: "2026-09-30T15:29:38.000Z",
      currentPeriodEnd: "2026-10-30T15:29:38.000Z",
      nextPaymentAt: "2026-10-30T15:29:38.000Z",
      cancelAtPeriodEnd: false,
      cancelsAt: null,
      canceledAt: null,
      lastPaymentAt: "2026-09-30T16:30:31.000Z",
      paidInvoices: 1,
      paidTotalCents: 2900,
    });
  });

  it("a member on trial: the first payment is the day the trial ends", () => {
    const b = billingOf(sub({ status: "trialing", currentPeriodEnd: "2026-09-30T15:29:38+00:00", paidInvoices: 0, paidTotalCents: 0, firstPaidAt: null, lastPaidAt: null }));
    expect(b.nextPaymentAt).toBe("2026-09-30T15:29:38.000Z");
    expect(b.lastPaymentAt).toBeNull();
  });

  it("a cancellation at period end: no next payment, and the day access ends", () => {
    const b = billingOf(sub({ cancelAtPeriodEnd: true, cancelAt: "2026-10-30T15:29:38+00:00" }));
    expect(b.nextPaymentAt).toBeNull();
    expect(b.cancelAtPeriodEnd).toBe(true);
    expect(b.cancelsAt).toBe("2026-10-30T15:29:38.000Z");
    // Still the member's until then: the status the app keys access on is untouched.
    expect(b.subscriptionStatus).toBe("active");
  });

  it("a trial cancelled before it converts: nothing will be charged", () => {
    expect(billingOf(sub({ status: "trialing", cancelAt: "2026-09-30T15:29:38+00:00" })).nextPaymentAt).toBeNull();
  });

  it("an ended subscription: no next payment", () => {
    const b = billingOf(sub({ status: "canceled", canceledAt: "2026-10-01T06:25:09+00:00", endedAt: "2026-10-01T06:25:09+00:00" }));
    expect(b.nextPaymentAt).toBeNull();
    expect(b.canceledAt).toBe("2026-10-01T06:25:09.000Z");
  });

  it("a payment plan with every instalment paid: no next payment", () => {
    expect(billingOf(sub({ installments: 3, paidInvoices: 3 })).nextPaymentAt).toBeNull();
    expect(billingOf(sub({ installments: 3, paidInvoices: 2 })).nextPaymentAt).toBe("2026-10-30T15:29:38.000Z");
  });

  it("reads dates in the shape PostgREST returns them, and survives a missing one", () => {
    const b = billingOf(sub({ currentPeriodEnd: "2026-10-30 15:29:38+00", trialEnd: null }));
    expect(b.currentPeriodEnd).toBe("2026-10-30T15:29:38.000Z");
    expect(b.trialEndsAt).toBeNull();
  });
});
