import { describe, it, expect } from "vitest";
import { findMismatches } from "@/lib/money-reconcile";

/**
 * The daily check that our money records agree with Stripe's.
 *
 * A $398 renewal sat "refunded" here for a day while Stripe had refunded
 * nothing (30 Sep 2026), and we found it from the member's account page.
 * Stripe is the record of money; this compares and reports.
 */

const none = { refundedOrders: [], stripeRefunds: [], paidInvoices: [] };

describe("findMismatches", () => {
  it("an order marked refunded that Stripe never refunded", () => {
    const m = findMismatches({
      ...none,
      refundedOrders: [
        { orderId: "24252a40-4caa-4d10-aa64-6d61dcf421f0", email: "a@example.com", totalCents: 39800, currency: "usd", stripeRefundedCents: 0 },
        { orderId: "ok-1", email: "b@example.com", totalCents: 2900, currency: "usd", stripeRefundedCents: 2900 },
        // Stripe could not be read for this one: say nothing rather than guess.
        { orderId: "unknown-1", email: "c@example.com", totalCents: 2900, currency: "usd", stripeRefundedCents: null },
      ],
    });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ kind: "refunded_here_not_in_stripe", key: "refunded_here_not_in_stripe:24252a40-4caa-4d10-aa64-6d61dcf421f0" });
    expect(m[0].message).toContain("a@example.com");
    expect(m[0].message).toContain("$398");
  });

  it("a refund in Stripe whose order is still paid here", () => {
    const m = findMismatches({
      ...none,
      stripeRefunds: [
        { refundId: "re_1", amountCents: 2900, currency: "usd", status: "succeeded", order: { id: "o1", email: "a@example.com", status: "paid" } },
        { refundId: "re_2", amountCents: 2900, currency: "usd", status: "succeeded", order: { id: "o2", email: "b@example.com", status: "refunded" } },
        // Another app's refund on the shared account: not ours to judge.
        { refundId: "re_3", amountCents: 9900, currency: "usd", status: "succeeded", order: null },
        { refundId: "re_4", amountCents: 2900, currency: "usd", status: "failed", order: { id: "o4", email: "d@example.com", status: "paid" } },
      ],
    });
    expect(m.map((x) => x.key)).toEqual(["refunded_in_stripe_not_here:re_1"]);
    expect(m[0].message).toContain("re_1");
  });

  it("a renewal Stripe charged that has no order here", () => {
    const m = findMismatches({
      ...none,
      paidInvoices: [
        { invoiceId: "in_1", number: "VTF9T3PM-0005", amountCents: 2900, currency: "usd", email: "a@example.com", hasOrder: false },
        { invoiceId: "in_2", number: "VTF9T3PM-0006", amountCents: 2900, currency: "usd", email: "b@example.com", hasOrder: true },
      ],
    });
    expect(m.map((x) => x.key)).toEqual(["paid_in_stripe_no_order:in_1"]);
    expect(m[0].message).toContain("VTF9T3PM-0005");
  });

  it("nothing to report when everything agrees", () => {
    expect(findMismatches(none)).toEqual([]);
  });
});
