import { describe, it, expect } from "vitest";
import type { MoneyData, OrderRowLite, ItemRow } from "@/lib/money-data";
import type { SubscriptionRow } from "@/lib/subscriptions";
import { subFilterFrom, deriveSubscriptions } from "@/lib/subscriptions-view";

/**
 * One Subscriptions page in place of Trials and Renewals (asked 4 Nov 2026).
 * See docs/superpowers/specs/2026-11-04-subscriptions-page-design.md.
 */
const NOW = new Date("2026-11-04T09:00:00Z");
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

const order = (over: Partial<OrderRowLite>): OrderRowLite => ({
  id: "o",
  userId: "u",
  email: "kerry@e.com",
  status: "paid",
  totalCents: 5800,
  currency: "usd",
  livemode: true,
  createdAt: at(-20),
  updatedAt: at(-20),
  stripeInvoiceId: null,
  stripePaymentIntentId: null,
  hostOfferId: null,
  couponCode: null,
  utmFirst: {} as OrderRowLite["utmFirst"],
  utmLast: {} as OrderRowLite["utmLast"],
  referrer: null,
  ...over,
});

const item = (over: Partial<ItemRow>): ItemRow => ({
  orderId: "o",
  kind: "renewal",
  description: "Content Engine",
  amountCents: 5800,
  offerId: "ce",
  productId: null,
  stripeSubscriptionId: "s",
  ...over,
});

const data = (subscriptions: SubscriptionRow[], orders: OrderRowLite[] = [], items: ItemRow[] = []): MoneyData => ({
  now: NOW,
  users: [{ id: "u", email: "kerry@e.com", name: "Kerry", isAdmin: false, createdAt: at(-60) }],
  orders,
  items,
  ownership: [],
  subscriptions,
  names: {
    offers: new Map([["ce", { name: "Content Engine", contentName: "Content Engine", billingType: "recurring", priceCents: 5800 }]]),
    products: new Map([["p", { name: "The Idea Vault", priceCents: 2700 }], ["q", { name: "Other", priceCents: 1000 }]]),
    apps: new Map(),
  },
});

describe("subFilterFrom", () => {
  it("defaults to 30 days back through 30 days ahead", () => {
    expect(subFilterFrom({}, "2026-11-04")).toEqual({
      preset: "around",
      from: "2026-10-05",
      to: "2026-12-04",
      offer: "",
      state: "all",
      sort: "date",
    });
  });

  it("resolves the presets on the given day", () => {
    const r = (preset: string) => {
      const f = subFilterFrom({ preset }, "2026-11-04");
      return [f.preset, f.from, f.to];
    };
    expect(r("last-30")).toEqual(["last-30", "2026-10-06", "2026-11-04"]);
    expect(r("this-month")).toEqual(["this-month", "2026-11-01", "2026-11-04"]);
    expect(r("next-30")).toEqual(["next-30", "2026-11-04", "2026-12-03"]);
  });

  it("takes a custom range and swaps one given backwards", () => {
    const f = subFilterFrom({ from: "2026-12-01", to: "2026-11-01" }, "2026-11-04");
    expect([f.preset, f.from, f.to]).toEqual(["custom", "2026-11-01", "2026-12-01"]);
  });

  it("whitelists everything off the URL", () => {
    expect(subFilterFrom({ preset: "x", from: "1 Nov", state: "drop", sort: "y" }, "2026-11-04")).toEqual(
      subFilterFrom({}, "2026-11-04"),
    );
    expect(subFilterFrom({ state: "past-due", sort: "amount", offer: "ce" }, "2026-11-04")).toMatchObject({
      state: "past-due",
      sort: "amount",
      offer: "ce",
    });
  });
});

describe("deriveSubscriptions", () => {
  it("keeps Grow's live subscriptions only", () => {
    const rows = deriveSubscriptions(
      data([
        sub({ stripeSubscriptionId: "mine" }),
        sub({ stripeSubscriptionId: "test", livemode: false }),
        sub({ stripeSubscriptionId: "app", offerId: null, productId: null }),
      ]),
    );
    expect(rows.map((r) => r.stripeSubscriptionId)).toEqual(["mine"]);
    expect(rows[0]).toMatchObject({ email: "kerry@e.com", name: "Kerry", what: "Content Engine", priceCents: 5800 });
  });

  it("maps every subView state onto a chip", () => {
    const chip = (over: Partial<SubscriptionRow>) =>
      deriveSubscriptions(data([sub({ stripeSubscriptionId: "x", ...over })]))[0].chip;
    expect(chip({})).toBe("active");
    expect(chip({ status: "trialing", paidInvoices: 0, trialEnd: at(3) })).toBe("trial");
    expect(chip({ paidInvoices: 0, trialEnd: at(-3) })).toBe("free");
    expect(chip({ status: "past_due" })).toBe("past-due");
    expect(chip({ cancelAtPeriodEnd: true })).toBe("cancelling");
    // A running trial set to cancel is still live, so it is cancelling.
    expect(chip({ status: "trialing", paidInvoices: 0, trialEnd: at(3), cancelAtPeriodEnd: true })).toBe("cancelling");
    expect(chip({ status: "canceled", paidInvoices: 0, canceledAt: at(-2), endedAt: at(-2) })).toBe("ended");
    expect(chip({ status: "incomplete_expired", paidInvoices: 0 })).toBe("ended");
    expect(chip({ status: "canceled", canceledAt: at(-2), endedAt: at(-2) })).toBe("ended");
  });

  it("collects the paid lines that carry its subscription id", () => {
    const [r] = deriveSubscriptions(
      data(
        [sub({})],
        [order({ id: "o1", createdAt: at(-50) }), order({ id: "o2", createdAt: at(-20) })],
        [item({ orderId: "o1", kind: "oto", amountCents: 5800 }), item({ orderId: "o2", amountCents: 4000 })],
      ),
    );
    expect(r.charges).toEqual([
      { at: at(-50), cents: 5800 },
      { at: at(-20), cents: 4000 },
    ]);
  });

  it("leaves out refunded orders and other subscriptions' lines", () => {
    const [r] = deriveSubscriptions(
      data(
        [sub({})],
        [order({ id: "o1", status: "refunded" }), order({ id: "o2" })],
        [item({ orderId: "o1" }), item({ orderId: "o2", stripeSubscriptionId: "someone-else" })],
      ),
    );
    expect(r.charges).toEqual([]);
  });

  it("collects a recurring product's first charge, which carries no subscription id", () => {
    const [r] = deriveSubscriptions(
      data(
        [sub({ offerId: null, productId: "p" })],
        [order({ id: "o1", createdAt: at(-57), totalCents: 2700 })],
        [item({ orderId: "o1", kind: "product", offerId: null, productId: "p", stripeSubscriptionId: null, amountCents: 2700 })],
      ),
    );
    expect(r.charges).toEqual([{ at: at(-57), cents: 2700 }]);
  });

  it("does not give a one-off product line to a subscription for a different product", () => {
    const [r] = deriveSubscriptions(
      data(
        [sub({ offerId: null, productId: "p" })],
        [order({ id: "o1" })],
        [item({ orderId: "o1", kind: "product", offerId: null, productId: "q", stripeSubscriptionId: null })],
      ),
    );
    expect(r.charges).toEqual([]);
  });

  it("records what became of a trial", () => {
    const rows = deriveSubscriptions(
      data([
        sub({ stripeSubscriptionId: "t", trialStart: at(-57), trialEnd: at(-50), firstPaidAt: at(-50) }),
        sub({ stripeSubscriptionId: "n" }),
      ]),
    );
    const by = Object.fromEntries(rows.map((r) => [r.stripeSubscriptionId, r.trial]));
    expect(by.t).toEqual({ outcome: "converted", at: at(-50) });
    expect(by.n).toBeNull();
  });
});
