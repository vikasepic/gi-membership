import { describe, it, expect } from "vitest";
import type { MoneyData } from "@/lib/money-data";
import type { SubscriptionRow } from "@/lib/subscriptions";
import { deriveRenewals, renewalTotals, renewalFilterFrom, applyRenewalFilter } from "@/lib/renewals-view";

/**
 * Asked for 3 Nov 2026: how much comes in over the next 30 days, and who
 * renews. Stripe's preview is the amount, so a coupon counts as what it is.
 */
const NOW = new Date("2026-11-03T09:00:00Z");
const DAY = 864e5;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: over.stripeSubscriptionId ?? "s",
  stripeSubscriptionId: "s",
  stripeCustomerId: "cus",
  userId: "u",
  offerId: "ce",
  productId: null,
  status: "active",
  amountCents: 5800,
  currency: "usd",
  interval: "month",
  intervalCount: 1,
  installments: null,
  trialStart: null,
  trialEnd: null,
  currentPeriodStart: at(-20),
  currentPeriodEnd: at(10),
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  paidInvoices: 2,
  paidTotalCents: 11600,
  firstPaidAt: at(-50),
  lastPaidAt: at(-20),
  livemode: true,
  startedAt: at(-57),
  nextChargeCents: 5800,
  nextChargeNote: null,
  ...over,
});

const data = (subscriptions: SubscriptionRow[]): MoneyData => ({
  now: NOW,
  users: [{ id: "u", email: "kerry@e.com", name: "Kerry", isAdmin: false, createdAt: at(-60) }],
  orders: [],
  items: [],
  ownership: [],
  subscriptions,
  names: {
    offers: new Map([
      ["ce", { name: "Content Engine", contentName: "Content Engine", billingType: "recurring", priceCents: 5800 }],
      ["fa", { name: "Funnel App", contentName: "Funnel App", billingType: "recurring", priceCents: 2900 }],
    ]),
    products: new Map(),
    apps: new Map(),
  },
});

describe("renewals in the next 30 days", () => {
  it("lists a renewal with Stripe's figure, its discount, the price and the history", () => {
    const [r] = deriveRenewals(data([sub({ stripeSubscriptionId: "k", nextChargeCents: 0, nextChargeNote: "100% off, this charge only" })]));
    expect(r).toMatchObject({
      stripeSubscriptionId: "k",
      userId: "u",
      name: "Kerry",
      email: "kerry@e.com",
      what: "Content Engine",
      kind: "renewal",
      at: at(10),
      amountCents: 0,
      priceCents: 5800,
      note: "100% off, this charge only",
      startedAt: at(-57),
      paidInvoices: 2,
      paidTotalCents: 11600,
    });
  });

  it("keeps only the next 30 days, soonest first", () => {
    const rows = deriveRenewals(
      data([
        sub({ stripeSubscriptionId: "late", currentPeriodEnd: at(31) }),
        sub({ stripeSubscriptionId: "b", currentPeriodEnd: at(20) }),
        sub({ stripeSubscriptionId: "a", currentPeriodEnd: at(2) }),
        // A renewal date already behind us is a row the sync stopped
        // updating, not money on its way.
        sub({ stripeSubscriptionId: "stale", currentPeriodEnd: at(-5) }),
      ]),
    );
    expect(rows.map((r) => r.stripeSubscriptionId)).toEqual(["a", "b"]);
  });

  it("counts a trial's first payment, a past-due retry and a cancellation as their own kinds", () => {
    const rows = deriveRenewals(
      data([
        sub({ stripeSubscriptionId: "t", status: "trialing", paidInvoices: 0, paidTotalCents: 0, trialEnd: at(3), currentPeriodEnd: at(3) }),
        sub({ stripeSubscriptionId: "pd", status: "past_due", currentPeriodEnd: at(-2) }),
        sub({ stripeSubscriptionId: "c", cancelAtPeriodEnd: true, currentPeriodEnd: at(6), nextChargeCents: null }),
      ]),
    );
    const kind = Object.fromEntries(rows.map((r) => [r.stripeSubscriptionId, r.kind]));
    // Past due is still owed even though its date has passed: Stripe is retrying it.
    expect(kind).toEqual({ t: "trial converting", pd: "past due", c: "cancelling" });
    expect(rows.find((r) => r.kind === "cancelling")?.at).toBe(at(6));
  });

  it("leaves out ended, test-mode, free-access and other apps' subscriptions", () => {
    const rows = deriveRenewals(
      data([
        sub({ stripeSubscriptionId: "ended", status: "canceled", canceledAt: at(-1), endedAt: at(-1) }),
        sub({ stripeSubscriptionId: "test", livemode: false }),
        sub({ stripeSubscriptionId: "free", paidInvoices: 0, paidTotalCents: 0, nextChargeCents: 0 }),
        sub({ stripeSubscriptionId: "app", offerId: null, productId: null }),
      ]),
    );
    expect(rows).toEqual([]);
  });

  it("totals what is coming in, keeps cancellations and unknown figures out of it", () => {
    const t = renewalTotals(
      deriveRenewals(
        data([
          sub({ stripeSubscriptionId: "r1", nextChargeCents: 5800 }),
          sub({ stripeSubscriptionId: "r2", nextChargeCents: 0 }),
          sub({ stripeSubscriptionId: "r3", nextChargeCents: null }),
          sub({ stripeSubscriptionId: "t", status: "trialing", paidInvoices: 0, trialEnd: at(3), currentPeriodEnd: at(3), nextChargeCents: 2900 }),
          sub({ stripeSubscriptionId: "pd", status: "past_due", nextChargeCents: 5800 }),
          sub({ stripeSubscriptionId: "c", cancelAtPeriodEnd: true, nextChargeCents: null, amountCents: 5800 }),
        ]),
      ),
    );
    expect(t).toEqual({
      comingInCents: 5800 + 0 + 2900 + 5800,
      unknown: 1,
      renewals: { count: 3, cents: 5800 },
      trials: { count: 1, cents: 2900 },
      pastDue: { count: 1, cents: 5800 },
      // What the cancellations would have paid, at their price.
      cancelling: { count: 1, cents: 5800 },
      currency: "usd",
    });
  });
});

describe("the renewals filter", () => {
  const rows = deriveRenewals(
    data([
      sub({ stripeSubscriptionId: "ce-big", nextChargeCents: 9000, currentPeriodEnd: at(9) }),
      sub({ stripeSubscriptionId: "fa", offerId: "fa", nextChargeCents: 2900, currentPeriodEnd: at(1) }),
      sub({ stripeSubscriptionId: "t", status: "trialing", paidInvoices: 0, trialEnd: at(4), currentPeriodEnd: at(4), nextChargeCents: 100 }),
    ]),
  );

  it("whitelists what it reads off the URL", () => {
    expect(renewalFilterFrom({ kind: "renewal", offer: "fa", sort: "amount" })).toEqual({ kind: "renewal", offer: "fa", sort: "amount" });
    expect(renewalFilterFrom({ kind: "drop table", sort: "x" })).toEqual({ kind: "all", offer: "", sort: "date" });
  });

  it("filters by kind and offer, and sorts by amount, biggest first", () => {
    expect(applyRenewalFilter(rows, { kind: "renewal", offer: "", sort: "date" }).map((r) => r.stripeSubscriptionId)).toEqual(["fa", "ce-big"]);
    expect(applyRenewalFilter(rows, { kind: "all", offer: "fa", sort: "date" }).map((r) => r.stripeSubscriptionId)).toEqual(["fa"]);
    expect(applyRenewalFilter(rows, { kind: "all", offer: "", sort: "amount" }).map((r) => r.stripeSubscriptionId)).toEqual(["ce-big", "fa", "t"]);
  });
});
