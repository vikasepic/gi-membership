import { describe, it, expect } from "vitest";
import { trialsOf, trialsByWeek, type TrialRow } from "@/lib/trials-view";

/**
 * Filtering the trials page by what the trial is for.
 *
 * The tiles, the chip counts and the weekly table all read from the same
 * filtered rows, so narrowing to one offer narrows every number on the page
 * rather than only the table under them.
 */
const row = (o: Partial<TrialRow>): TrialRow => ({
  stripeSubscriptionId: "s",
  userId: "u",
  email: "a@e.com",
  name: null,
  what: "Content Engine — Instagram",
  offerId: "ce-ig",
  productId: null,
  thenCents: 2900,
  interval: "month",
  currency: "usd",
  startedAt: "2026-09-14T10:00:00Z",
  endsAt: "2026-09-21T10:00:00Z",
  outcome: "on trial",
  outcomeAt: null,
  daysLeft: 3,
  paidTotalCents: 0,
  cancelledSince: false,
  ...o,
});

const rows = [
  row({ stripeSubscriptionId: "a", offerId: "ce-ig" }),
  row({ stripeSubscriptionId: "b", offerId: "ce-ig", outcome: "converted", paidTotalCents: 2900 }),
  row({ stripeSubscriptionId: "c", offerId: "funnel", what: "Funnel App" }),
  row({ stripeSubscriptionId: "d", offerId: null, productId: "dpv", what: "Digital Product Validator" }),
];

describe("narrowing to one product or offer", () => {
  it("keeps only that offer's trials", () => {
    expect(trialsOf(rows, "ce-ig").map((t) => t.stripeSubscriptionId)).toEqual(["a", "b"]);
  });

  it("matches a product as readily as an offer", () => {
    expect(trialsOf(rows, "dpv").map((t) => t.stripeSubscriptionId)).toEqual(["d"]);
  });

  it("is everything when nothing is chosen", () => {
    expect(trialsOf(rows, "")).toHaveLength(4);
  });

  it("an offer with no trials has none", () => {
    // The Subscriptions page whitelists the offer before it gets here, so a
    // stale link is already the whole picture. An offer that sells
    // subscriptions but never had a trial must show no trials, not every
    // trial in the store (review, 4 Nov).
    expect(trialsOf(rows, "no-trials-offer")).toHaveLength(0);
  });

  it("narrows the counts the tiles are built from, not just the table", () => {
    const narrowed = trialsOf(rows, "ce-ig");
    expect(narrowed.filter((t) => t.outcome === "converted")).toHaveLength(1);
    expect(narrowed.filter((t) => t.outcome === "on trial")).toHaveLength(1);
    expect(trialsByWeek(narrowed)[0]).toMatchObject({ started: 2, converted: 1, pending: 1 });
  });
});
