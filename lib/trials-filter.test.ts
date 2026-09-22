import { describe, it, expect } from "vitest";
import { trialsOf, trialThings, trialsFor, trialsByWeek, type TrialRow } from "@/lib/trials-view";

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

  it("falls back to everything for an id that matches nothing", () => {
    // A stale link should show the whole picture, not an empty page that
    // reads as "no trials".
    expect(trialsOf(rows, "deleted-offer")).toHaveLength(4);
  });

  it("narrows the counts the tiles are built from, not just the table", () => {
    const narrowed = trialsOf(rows, "ce-ig");
    expect(trialsFor(narrowed, "converted")).toHaveLength(1);
    expect(trialsFor(narrowed, "on trial")).toHaveLength(1);
    expect(trialsByWeek(narrowed)[0]).toMatchObject({ started: 2, converted: 1, pending: 1 });
  });
});

describe("the picker", () => {
  it("lists only things that actually have a trial, named and sorted", () => {
    expect(trialThings(rows)).toEqual([
      { id: "ce-ig", name: "Content Engine — Instagram" },
      { id: "dpv", name: "Digital Product Validator" },
      { id: "funnel", name: "Funnel App" },
    ]);
  });

  it("lists each thing once however many trials it has", () => {
    expect(trialThings(rows).filter((t) => t.id === "ce-ig")).toHaveLength(1);
  });

  it("is empty when there is nothing to choose between", () => {
    expect(trialThings([])).toEqual([]);
  });
});
