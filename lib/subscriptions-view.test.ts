import { describe, it, expect } from "vitest";
import type { MoneyData, OrderRowLite, ItemRow } from "@/lib/money-data";
import type { SubscriptionRow } from "@/lib/subscriptions";
import {
  subFilterFrom,
  deriveSubscriptions,
  expectedCharges,
  subTotals,
  listRows,
  chipCounts,
  trialNote,
  type SubFilter,
} from "@/lib/subscriptions-view";

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

  it("carries Stripe's figure, its discount, the price and the history", () => {
    expect(one({ nextChargeCents: 0, nextChargeNote: "100% off, this charge only" })).toMatchObject({
      nextChargeAt: at(10),
      nextChargeCents: 0,
      nextChargeNote: "100% off, this charge only",
      priceCents: 5800,
      startedAt: at(-57),
      paidInvoices: 2,
      paidTotalCents: 11600,
    });
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

const day = (days: number) => at(days).slice(0, 10);
const range = (from: number, to: number, over: Partial<SubFilter> = {}): SubFilter => ({
  preset: "custom",
  from: day(from),
  to: day(to),
  offer: "",
  state: "all",
  sort: "date",
  ...over,
});
const one = (over: Partial<SubscriptionRow>) => deriveSubscriptions(data([sub(over)]))[0];

describe("expected charges", () => {
  it("the first is Stripe's figure, later ones in the range at list price", () => {
    const r = one({ currentPeriodEnd: at(10), nextChargeCents: 0, amountCents: 5800 });
    expect(expectedCharges(r, NOW, day(90)).map((c) => c.cents)).toEqual([0, 5800, 5800]);
  });

  it("a paying row whose date is already behind us expects nothing: the sync stopped updating it", () => {
    expect(expectedCharges(one({ currentPeriodEnd: at(-5) }), NOW, day(30))).toEqual([]);
  });

  it("an unknown preview stays unknown", () => {
    const r = one({ nextChargeCents: null });
    expect(expectedCharges(r, NOW, day(20))).toEqual([{ at: at(10), cents: null }]);
  });

  it("a payment plan stops after its last instalment", () => {
    const r = one({ installments: 3, paidInvoices: 2 });
    expect(expectedCharges(r, NOW, day(120))).toHaveLength(1);
  });

  it("a cancelling or ended subscription expects nothing", () => {
    expect(expectedCharges(one({ cancelAtPeriodEnd: true }), NOW, day(90))).toEqual([]);
    expect(expectedCharges(one({ status: "canceled", endedAt: at(-1), canceledAt: at(-1) }), NOW, day(90))).toEqual([]);
  });

  it("past due is still owed, even with its date behind us", () => {
    const r = one({ status: "past_due", currentPeriodEnd: at(-2) });
    expect(expectedCharges(r, NOW, day(5))).toEqual([{ at: NOW.toISOString(), cents: 5800 }]);
  });

  it("a trial's first charge comes at the trial end", () => {
    const r = one({ status: "trialing", paidInvoices: 0, trialEnd: at(3), currentPeriodEnd: at(3), nextChargeCents: 2900 });
    expect(expectedCharges(r, NOW, day(5))).toEqual([{ at: at(3), cents: 2900 }]);
  });
});

describe("subTotals", () => {
  const paidAt = (subId: string, ...days: number[]) => ({
    orders: days.map((d) => order({ id: `${subId}${d}`, createdAt: at(d) })),
    items: days.map((d) => item({ orderId: `${subId}${d}`, stripeSubscriptionId: subId, amountCents: 1000 })),
  });

  it("collected counts only charges between from and now", () => {
    const p = paidAt("s", -50, -20, -5);
    const rows = deriveSubscriptions(data([sub({})], p.orders, p.items));
    expect(subTotals(rows, range(-30, 30), NOW).collectedCents).toBe(2000);
  });

  it("a range wholly in the past has no expected; wholly in the future, no collected", () => {
    const rows = deriveSubscriptions(data([sub({})]));
    expect(subTotals(rows, range(-30, -1), NOW).expectedCents).toBeNull();
    expect(subTotals(rows, range(1, 30), NOW).collectedCents).toBeNull();
    expect(subTotals(rows, range(1, 30), NOW).expectedCents).toBe(5800);
  });

  it("a range ending today has no expected; one starting today, no collected", () => {
    const rows = deriveSubscriptions(data([sub({})]));
    expect(subTotals(rows, range(-29, 0), NOW).expectedCents).toBeNull();
    expect(subTotals(rows, range(0, 29), NOW).collectedCents).toBeNull();
  });

  it("running is paying + cancelling + past due", () => {
    const rows = deriveSubscriptions(
      data([
        sub({ stripeSubscriptionId: "a" }),
        sub({ stripeSubscriptionId: "b", cancelAtPeriodEnd: true }),
        sub({ stripeSubscriptionId: "c", status: "past_due" }),
        sub({ stripeSubscriptionId: "t", status: "trialing", paidInvoices: 0, trialEnd: at(3) }),
      ]),
    );
    const t = subTotals(rows, range(-30, 30), NOW);
    expect(t.running).toEqual({ total: 3, paying: 1, cancelling: 1, pastDue: 1 });
    expect([t.onTrial, t.endingThisWeek]).toEqual([1, 1]);
  });

  it("converted and lost follow trial outcome dates in the range; the rate leaves free access out", () => {
    const trial = { trialStart: at(-20), trialEnd: at(-13) };
    const rows = deriveSubscriptions(
      data([
        sub({ stripeSubscriptionId: "c1", ...trial, firstPaidAt: at(-13) }),
        sub({ stripeSubscriptionId: "c2", ...trial, firstPaidAt: at(-12) }),
        sub({ stripeSubscriptionId: "x", ...trial, status: "canceled", paidInvoices: 0, canceledAt: at(-15), endedAt: at(-15) }),
        sub({ stripeSubscriptionId: "f", ...trial, paidInvoices: 0 }),
        // Converted long before the range: not counted.
        sub({ stripeSubscriptionId: "old", trialStart: at(-90), trialEnd: at(-83), firstPaidAt: at(-83) }),
      ]),
    );
    const t = subTotals(rows, range(-30, 30), NOW);
    expect([t.converted, t.lost, t.free, t.rate]).toEqual([2, 1, 1, 67]);
  });

  it("ended counts access that ended in the range for subscriptions that paid", () => {
    const rows = deriveSubscriptions(
      data([
        sub({ stripeSubscriptionId: "paid", status: "canceled", canceledAt: at(-40), endedAt: at(-10) }),
        sub({ stripeSubscriptionId: "trial", status: "canceled", paidInvoices: 0, trialEnd: at(-10), canceledAt: at(-10), endedAt: at(-10) }),
      ]),
    );
    expect(subTotals(rows, range(-30, 30), NOW).ended).toBe(1);
  });

  it("set to cancel counts every cancelling subscription now, with the soonest date", () => {
    const rows = deriveSubscriptions(
      data([
        sub({ stripeSubscriptionId: "a", cancelAtPeriodEnd: true, currentPeriodEnd: at(12) }),
        sub({ stripeSubscriptionId: "b", cancelAt: at(6) }),
      ]),
    );
    const t = subTotals(rows, range(-30, 30), NOW);
    expect([t.setToCancel, t.setToCancelFirst]).toEqual([2, at(6)]);
  });

  it("the offer filter narrows the numbers too", () => {
    const rows = deriveSubscriptions(data([sub({ stripeSubscriptionId: "a" }), sub({ stripeSubscriptionId: "b", offerId: null, productId: "p" })]));
    expect(subTotals(rows, range(-30, 30, { offer: "p" }), NOW).running.total).toBe(1);
    // An id that matches nothing shows the whole picture, as a stale link should.
    expect(subTotals(rows, range(-30, 30, { offer: "gone" }), NOW).running.total).toBe(2);
  });
});

describe("the list", () => {
  const rows = deriveSubscriptions(
    data(
      [
        sub({ stripeSubscriptionId: "due", currentPeriodEnd: at(10), startedAt: at(-200) }),
        sub({ stripeSubscriptionId: "new", startedAt: at(-3), currentPeriodEnd: at(27), nextChargeCents: 9000 }),
        sub({ stripeSubscriptionId: "gone", status: "canceled", canceledAt: at(-40), endedAt: at(-8), startedAt: at(-200) }),
        sub({ stripeSubscriptionId: "quiet", status: "canceled", canceledAt: at(-300), endedAt: at(-300), startedAt: at(-400) }),
      ],
      [order({ id: "o1", createdAt: at(-150) })],
      [item({ orderId: "o1", stripeSubscriptionId: "due" })],
    ),
  );

  it("keeps a subscription that paid, started, ended or is due in the range, and drops one with nothing in it", () => {
    expect(listRows(rows, range(-30, 30), NOW).map((r) => r.stripeSubscriptionId).sort()).toEqual(["due", "gone", "new"]);
    // A range around the old charge only: just the one that paid then.
    expect(listRows(rows, range(-160, -140), NOW).map((r) => r.stripeSubscriptionId)).toEqual(["due"]);
  });

  it("the chip counts are counts of that list", () => {
    expect(chipCounts(rows, range(-30, 30), NOW)).toEqual({ all: 3, active: 2, trial: 0, free: 0, "past-due": 0, cancelling: 0, ended: 1 });
  });

  it("narrows by state and sorts by next charge date or amount, unknowns last", () => {
    expect(listRows(rows, range(-30, 30, { state: "ended" }), NOW).map((r) => r.stripeSubscriptionId)).toEqual(["gone"]);
    expect(listRows(rows, range(-30, 30), NOW).map((r) => r.stripeSubscriptionId)).toEqual(["due", "new", "gone"]);
    expect(listRows(rows, range(-30, 30, { sort: "amount" }), NOW).map((r) => r.stripeSubscriptionId)).toEqual(["new", "due", "gone"]);
  });
});

describe("trialNote", () => {
  it("says what became of a trial", () => {
    const trial = { trialStart: at(-30), trialEnd: at(-23) };
    expect(trialNote(one({ ...trial, firstPaidAt: "2026-10-12T10:00:00Z" }), NOW)).toBe("trial, converted 12 Oct 2026");
    expect(
      trialNote(one({ ...trial, status: "canceled", paidInvoices: 0, canceledAt: "2026-10-03T10:00:00Z", endedAt: "2026-10-03T10:00:00Z" }), NOW),
    ).toBe("trial, cancelled 3 Oct 2026");
    expect(trialNote(one({ ...trial, paidInvoices: 0 }), NOW)).toBe("trial, free access");
    expect(trialNote(one({ status: "trialing", paidInvoices: 0, trialStart: at(-5), trialEnd: at(2) }), NOW)).toBe("trial, ends in 2 days");
  });

  it("is null for a subscription that never had a trial", () => {
    expect(trialNote(one({}), NOW)).toBeNull();
  });
});
