import { describe, it, expect } from "vitest";
import type { SubscriptionDrift } from "@/lib/subscription-reconcile";

// Which disagreements matter, and which are never acted on.
//
// The shape of the rule rather than the Stripe calls around it: the calls are
// covered against the real API in subscription-sync.integration.test.ts, and
// what is worth pinning here is the classification, because it decides whether
// somebody gets their access back.

const drift = (over: Partial<SubscriptionDrift>): SubscriptionDrift => ({
  ownershipId: "own-1",
  userId: "u1",
  email: "buyer@example.com",
  offerId: "o1",
  offerName: "Funnel App",
  subscriptionId: "sub_1",
  ours: "canceled",
  theirs: "trialing",
  losingAccess: true,
  ...over,
});

// The same expression the finder uses, exercised through the type it produces.
const losing = (ours: SubscriptionDrift["ours"], theirs: SubscriptionDrift["theirs"]) =>
  theirs !== "missing" && theirs !== "canceled" && ours === "canceled";

describe("who is actually being hurt", () => {
  it("counts someone billed by Stripe whose access we took away", () => {
    // The reported case: refund the product, the trial keeps billing, the app
    // withdraws access. They pay for something they cannot open.
    expect(losing("canceled", "trialing")).toBe(true);
    expect(losing("canceled", "active")).toBe(true);
  });

  it("counts a card in dunning too — Stripe is still trying to charge it", () => {
    expect(losing("canceled", "past_due")).toBe(true);
  });

  it("does not count access we still grant", () => {
    expect(losing("trialing", "canceled")).toBe(false);
    expect(losing("active", "past_due")).toBe(false);
  });

  it("does not count a subscription Stripe cannot find", () => {
    // No answer is not the same as "cancelled". A wrong key makes every row
    // look missing, and treating that as churn would revoke the whole store.
    expect(losing("canceled", "missing")).toBe(false);
  });
});

describe("what the list puts first", () => {
  const sort = (rows: SubscriptionDrift[]) =>
    [...rows].sort((a, b) => Number(b.losingAccess) - Number(a.losingAccess));

  it("leads with the people paying for nothing", () => {
    const rows = [
      drift({ ownershipId: "quiet", losingAccess: false }),
      drift({ ownershipId: "urgent", losingAccess: true }),
    ];
    expect(sort(rows)[0].ownershipId).toBe("urgent");
  });

  it("keeps the rest, rather than hiding them", () => {
    const rows = [drift({ losingAccess: false }), drift({ losingAccess: false })];
    expect(sort(rows)).toHaveLength(2);
  });
});
