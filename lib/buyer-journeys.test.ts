import { describe, it, expect } from "vitest";
import type { MoneyData } from "@/lib/money-data";
import type { SubscriptionRow } from "@/lib/subscriptions";
import { deriveJourneys, journeyRangeFrom } from "@/lib/buyer-journeys";

/**
 * Journeys: what each buyer bought first, what they bought later, and what
 * they have spent. Asked for by the ads team on 17 Nov 2026, who could not
 * read the order of purchases from ActiveCampaign tags.
 *
 * One test per rule in
 * docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

const NOW = new Date("2026-11-18T00:00:00Z");
type Order = MoneyData["orders"][number];
type Item = MoneyData["items"][number];

const order = (o: Partial<Order> & { id: string }): Order => ({
  userId: "a",
  email: "a@x.test",
  status: "paid",
  totalCents: 0,
  currency: "usd",
  livemode: true,
  createdAt: "2026-09-03T10:00:00Z",
  updatedAt: "2026-09-03T10:00:00Z",
  stripeInvoiceId: null,
  stripePaymentIntentId: "pi",
  hostOfferId: null,
  couponCode: null,
  utmFirst: {},
  utmLast: {},
  referrer: null,
  ...o,
});
const item = (i: Partial<Item> & { orderId: string }): Item => ({
  kind: "product",
  description: "A thing",
  amountCents: 0,
  offerId: null,
  productId: null,
  stripeSubscriptionId: null,
  ...i,
});
const sub = (id: string, paidInvoices: number): SubscriptionRow =>
  ({ id, stripeSubscriptionId: id, userId: "a", offerId: "ce", productId: null, status: paidInvoices ? "active" : "trialing", paidInvoices, amountCents: 4700, currency: "usd" }) as SubscriptionRow;
const user = (id: string, over: Partial<MoneyData["users"][number]> = {}): MoneyData["users"][number] => ({
  id, email: `${id}@x.test`, name: null, isAdmin: false, isViewer: false, createdAt: "2026-08-20T00:00:00Z", ...over,
});

const data = (d: Partial<MoneyData>): MoneyData => ({
  users: [user("a")],
  orders: [],
  items: [],
  subscriptions: [],
  ownership: [],
  courseGrants: [],
  names: {
    offers: new Map([
      ["fw", { name: "Foundations Weekend", contentName: null, billingType: "one_time", priceCents: 19700 }],
      ["fw-mv", { name: "Foundations Weekend Mindvalley", contentName: null, billingType: "one_time", priceCents: 19700 }],
      ["ce", { name: "Content Engine", contentName: null, billingType: "recurring", priceCents: 4700 }],
      ["mpb", { name: "The Micro-Product Builder", contentName: null, billingType: "one_time", priceCents: 2900 }],
    ]),
    products: new Map([
      ["dpv", { name: "Digital Product Validator", priceCents: 2700 }],
      ["ideas", { name: "150 Digital Product Ideas", priceCents: 1100 }],
    ]),
    apps: new Map([["app1", "Funnel App"]]),
  },
  now: NOW,
  ...d,
});
const run = (d: Partial<MoneyData>, range: "all" | "90" | "30" = "all", teamEmails: string[] = []) => deriveJourneys(data(d), { range, teamEmails });

// Validator on 3 Sep, Foundations Weekend on 9 Nov: the journey the ads team asked about.
const VALIDATOR_THEN_FW = {
  orders: [
    order({ id: "o1", createdAt: "2026-09-03T10:00:00Z", utmFirst: { utm_source: "meta", utm_campaign: "dpv" }, utmLast: { utm_source: "email" } }),
    order({ id: "o2", createdAt: "2026-11-09T10:00:00Z", hostOfferId: "fw" }),
  ],
  items: [
    item({ orderId: "o1", kind: "product", productId: "dpv", amountCents: 2700 }),
    item({ orderId: "o2", kind: "oto", offerId: "fw", amountCents: 19700 }),
  ],
};

describe("the order of purchases", () => {
  it("names the first purchase, the later one and the total spent", () => {
    const { people } = run(VALIDATOR_THEN_FW);
    expect(people).toHaveLength(1);
    expect(people[0].first).toMatchObject({ what: "Digital Product Validator", key: "product:dpv", at: "2026-09-03T10:00:00Z", valueCents: 2700 });
    expect(people[0].later.map((p) => [p.what, p.at])).toEqual([["Foundations Weekend", "2026-11-09T10:00:00Z"]]);
    expect(people[0].totalSpentCents).toBe(22400);
    expect(people[0].source).toBe("meta / dpv");
  });

  it("puts them in the cell for 'Validator first, then Foundations Weekend'", () => {
    const { summary, laterColumns } = run(VALIDATOR_THEN_FW);
    expect(summary).toEqual([
      { key: "product:dpv", what: "Digital Product Validator", buyers: 1, avgFirstValueCents: 2700, boughtAgain: 1, laterBy: { "offer:fw": 1 }, avgTotalSpentCents: 22400 },
    ]);
    expect(laterColumns).toEqual([{ key: "offer:fw", what: "Foundations Weekend" }]);
  });

  it("gives the download one row per line, in order", () => {
    const { people } = run(VALIDATOR_THEN_FW);
    expect(people[0].lines.map((l) => [l.purchaseNo, l.how, l.what, l.amountCents, l.sourceFirst, l.sourceLast])).toEqual([
      [1, "first", "Digital Product Validator", 2700, "meta / dpv", "email"],
      [2, "later", "Foundations Weekend", 19700, "meta / dpv", "email"],
    ]);
  });

  it("two orders minutes apart are two purchases", () => {
    const { people } = run({
      orders: [order({ id: "o1", createdAt: "2026-09-03T10:00:00Z" }), order({ id: "o2", createdAt: "2026-09-03T10:10:00Z", hostOfferId: "mpb" })],
      items: [item({ orderId: "o1", productId: "dpv", amountCents: 2700 }), item({ orderId: "o2", kind: "oto", offerId: "mpb", amountCents: 2900 })],
    });
    expect(people[0].later).toHaveLength(1);
  });

  it("keeps two funnels for the same thing as two rows", () => {
    const { summary } = run({
      users: [user("a"), user("b")],
      orders: [order({ id: "o1", hostOfferId: "fw" }), order({ id: "o2", userId: "b", email: "b@x.test", hostOfferId: "fw-mv" })],
      items: [item({ orderId: "o1", kind: "oto", offerId: "fw", amountCents: 19700 }), item({ orderId: "o2", kind: "oto", offerId: "fw-mv", amountCents: 19700 })],
    });
    expect(summary.map((r) => r.what).sort()).toEqual(["Foundations Weekend", "Foundations Weekend Mindvalley"]);
  });
});

describe("what one order is worth", () => {
  const WITH_EXTRAS = {
    orders: [order({ id: "o1", totalCents: 2700 })],
    items: [
      item({ orderId: "o1", kind: "product", productId: "dpv", amountCents: 2700 }),
      item({ orderId: "o1", kind: "bump", productId: "ideas", amountCents: 1100 }),
      item({ orderId: "o1", kind: "oto", offerId: "fw", amountCents: 19700 }),
    ],
  };

  it("a bump and an upsell ride on the order they were sold with", () => {
    const { people } = run(WITH_EXTRAS);
    expect(people[0].first.what).toBe("Digital Product Validator");
    expect(people[0].first.withIt).toEqual(["150 Digital Product Ideas", "Foundations Weekend"]);
    expect(people[0].later).toEqual([]);
    expect(people[0].lines.map((l) => l.how)).toEqual(["first", "bought with", "bought with"]);
  });

  it("is the sum of its lines, not the stored total an upsell never updates", () => {
    const { people, summary } = run(WITH_EXTRAS);
    expect(people[0].first.valueCents).toBe(23500);
    expect(people[0].totalSpentCents).toBe(23500);
    expect(summary[0].avgFirstValueCents).toBe(23500);
  });

  it("an old offer order with no host recorded: the first line that is not a bump is the purchase", () => {
    const { people } = run({
      orders: [order({ id: "o1", hostOfferId: null })],
      items: [item({ orderId: "o1", kind: "bump", productId: "ideas", amountCents: 1100 }), item({ orderId: "o1", kind: "oto", offerId: "mpb", amountCents: 2900 })],
    });
    expect(people[0].first.what).toBe("The Micro-Product Builder");
    expect(people[0].first.withIt).toEqual(["150 Digital Product Ideas"]);
  });
});

describe("a free start", () => {
  const trial = (paidInvoices: number) => ({
    orders: [order({ id: "t1", createdAt: "2026-10-01T10:00:00Z", hostOfferId: "ce" })],
    items: [item({ orderId: "t1", kind: "oto", offerId: "ce", amountCents: 0, stripeSubscriptionId: "sub_1" })],
    subscriptions: [sub("sub_1", paidInvoices)],
  });

  it("is not a purchase, and someone with nothing else is not a buyer", () => {
    expect(run(trial(0)).people).toEqual([]);
    expect(run({ ...trial(0), ownership: [{ userId: "a", productId: null, offerId: "fw", appId: null, status: "active", stripeSubscriptionId: null, source: "grant", createdAt: "2026-11-12T00:00:00Z" }] }).people).toEqual([]);
  });

  it("becomes a purchase from the day it started once it has taken money", () => {
    const t = trial(2);
    const renewal = (id: string, at: string) => order({ id, createdAt: at, stripeInvoiceId: `in_${id}`, totalCents: 4700 });
    const { people } = run({
      ...t,
      orders: [...t.orders, renewal("r1", "2026-10-08T10:00:00Z"), renewal("r2", "2026-11-08T10:00:00Z")],
      items: [...t.items, item({ orderId: "r1", kind: "renewal", offerId: "ce", amountCents: 4700, stripeSubscriptionId: "sub_1" }), item({ orderId: "r2", kind: "renewal", offerId: "ce", amountCents: 4700, stripeSubscriptionId: "sub_1" })],
    });
    expect(people[0].first).toMatchObject({ what: "Content Engine", at: "2026-10-01T10:00:00Z", valueCents: 0 });
    expect(people[0].later).toEqual([]);
    expect(people[0].totalSpentCents).toBe(9400);
    expect(people[0].lines.map((l) => [l.how, l.amountCents, l.purchaseNo])).toEqual([["first", 0, 1], ["renewal", 4700, null], ["renewal", 4700, null]]);
  });

  it("on a 100% coupon never becomes one; the first paid order is the first purchase", () => {
    const { people } = run({
      orders: [order({ id: "free", createdAt: "2026-09-01T10:00:00Z", couponCode: "GIFT" }), order({ id: "paid", createdAt: "2026-09-08T10:00:00Z", hostOfferId: "mpb" })],
      items: [item({ orderId: "free", productId: "dpv", amountCents: 0 }), item({ orderId: "paid", kind: "oto", offerId: "mpb", amountCents: 2900 })],
    });
    expect(people[0].startedFree).toEqual([{ what: "Digital Product Validator", at: "2026-09-01T10:00:00Z" }]);
    expect(people[0].first.what).toBe("The Micro-Product Builder");
    expect(people[0].lines.map((l) => [l.how, l.purchaseNo])).toEqual([["started free", null], ["first", 1]]);
  });

  it("taken as an upsell is bought with the order, not a purchase of its own", () => {
    const { people } = run({
      orders: [order({ id: "o1" })],
      items: [item({ orderId: "o1", productId: "dpv", amountCents: 2700 }), item({ orderId: "o1", kind: "oto", offerId: "ce", amountCents: 0, stripeSubscriptionId: "sub_1" })],
      subscriptions: [sub("sub_1", 0)],
    });
    expect(people[0].first.what).toBe("Digital Product Validator");
    expect(people[0].first.withIt).toEqual(["Content Engine"]);
    expect(people[0].first.valueCents).toBe(2700);
  });
});

describe("what does not count", () => {
  it("a refunded order: the next paid one is the first purchase", () => {
    const { people } = run({
      orders: [order({ id: "o1", status: "refunded", createdAt: "2026-09-01T10:00:00Z" }), order({ id: "o2", createdAt: "2026-09-05T10:00:00Z", hostOfferId: "mpb" })],
      items: [item({ orderId: "o1", productId: "dpv", amountCents: 2700 }), item({ orderId: "o2", kind: "oto", offerId: "mpb", amountCents: 2900 })],
    });
    expect(people[0].first.what).toBe("The Micro-Product Builder");
    expect(people[0].totalSpentCents).toBe(2900);
  });

  it("a test-mode order", () => {
    expect(run({ orders: [order({ id: "o1", livemode: false })], items: [item({ orderId: "o1", productId: "dpv", amountCents: 2700 })] }).people).toEqual([]);
  });

  it("an unpaid order", () => {
    expect(run({ orders: [order({ id: "o1", status: "pending" })], items: [item({ orderId: "o1", productId: "dpv", amountCents: 2700 })] }).people).toEqual([]);
  });

  it("renewals with no start in the data: not a buyer, and nothing throws", () => {
    const r = run({
      orders: [order({ id: "r1", stripeInvoiceId: "in_1", totalCents: 4700 })],
      items: [item({ orderId: "r1", kind: "renewal", offerId: "ce", amountCents: 4700, stripeSubscriptionId: "sub_gone" })],
    });
    expect(r.people).toEqual([]);
    expect(r.summary).toEqual([]);
  });

  it("the team: an admin, a read-only person and an environment admin", () => {
    const paid = (u: string) => [order({ id: `o-${u}`, userId: u, email: `${u}@x.test` })];
    const r = run(
      {
        users: [user("adm", { isAdmin: true }), user("ads", { isViewer: true }), user("own")],
        orders: [...paid("adm"), ...paid("ads"), ...paid("own")],
        items: ["adm", "ads", "own"].map((u) => item({ orderId: `o-${u}`, productId: "dpv", amountCents: 2700 })),
      },
      "all",
      ["OWN@x.test"],
    );
    expect(r.people).toEqual([]);
  });
});

describe("access that was given, not bought", () => {
  const GIVEN = {
    ...VALIDATOR_THEN_FW,
    ownership: [{ userId: "a", productId: null, offerId: "mpb", appId: null, status: "active", stripeSubscriptionId: null, source: "grant", createdAt: "2026-11-12T00:00:00Z" }],
    courseGrants: [{ userId: "a", courseTitle: "Foundations Weekend replays", createdAt: null }],
  };

  it("is listed on the person with its date where one is recorded", () => {
    expect(run(GIVEN).people[0].given).toEqual([
      { what: "The Micro-Product Builder", at: "2026-11-12T00:00:00Z" },
      { what: "Foundations Weekend replays", at: null },
    ]);
  });

  it("changes no count and no spend", () => {
    const withGift = run(GIVEN);
    const without = run(VALIDATOR_THEN_FW);
    expect(withGift.summary).toEqual(without.summary);
    expect(withGift.people[0].totalSpentCents).toBe(22400);
    expect(withGift.people[0].later).toHaveLength(1);
  });

  it("reaches the download as 'given' lines", () => {
    expect(run(GIVEN).people[0].lines.filter((l) => l.how === "given").map((l) => [l.what, l.at, l.amountCents, l.purchaseNo])).toEqual([
      ["The Micro-Product Builder", "2026-11-12T00:00:00Z", 0, null],
      ["Foundations Weekend replays", null, 0, null],
    ]);
  });

  it("access they bought is not called given", () => {
    const r = run({ ...VALIDATOR_THEN_FW, ownership: [{ userId: "a", productId: "dpv", offerId: null, appId: null, status: "active", stripeSubscriptionId: null, source: "purchase", createdAt: "2026-09-03T10:00:00Z" }] });
    expect(r.people[0].given).toEqual([]);
  });
});

describe("who a person is", () => {
  it("orders with no account are one person per email, whatever its case", () => {
    const { people } = run({
      users: [],
      orders: [order({ id: "o1", userId: null, email: "Guest@x.test", createdAt: "2026-09-03T10:00:00Z" }), order({ id: "o2", userId: null, email: "guest@x.test", createdAt: "2026-09-09T10:00:00Z", hostOfferId: "mpb" })],
      items: [item({ orderId: "o1", productId: "dpv", amountCents: 2700 }), item({ orderId: "o2", kind: "oto", offerId: "mpb", amountCents: 2900 })],
    });
    expect(people).toHaveLength(1);
    expect(people[0].userId).toBeNull();
    expect(people[0].later).toHaveLength(1);
  });
});

describe("the date range", () => {
  // First purchase 40 days back, a later one 5 days back.
  const OLD_THEN_RECENT = {
    orders: [order({ id: "o1", createdAt: "2026-10-09T00:00:00Z" }), order({ id: "o2", createdAt: "2026-11-13T00:00:00Z", hostOfferId: "fw" })],
    items: [item({ orderId: "o1", productId: "dpv", amountCents: 2700 }), item({ orderId: "o2", kind: "oto", offerId: "fw", amountCents: 19700 })],
  };

  it("filters on the first purchase, not on any purchase", () => {
    expect(run(OLD_THEN_RECENT, "30").people).toEqual([]);
    expect(run(OLD_THEN_RECENT, "90").people).toHaveLength(1);
    expect(run(OLD_THEN_RECENT, "all").people).toHaveLength(1);
  });

  it("is a whitelist off the URL: anything else is all time", () => {
    expect(journeyRangeFrom({ range: "90" })).toBe("90");
    expect(journeyRangeFrom({ range: "30" })).toBe("30");
    expect(journeyRangeFrom({ range: "7" })).toBe("all");
    expect(journeyRangeFrom({ range: ["30", "90"] })).toBe("all");
    expect(journeyRangeFrom({})).toBe("all");
  });
});

describe("the order things are listed in", () => {
  it("people newest first purchase first; rows by buyers; later columns by buyers", () => {
    const r = run({
      users: [user("a"), user("b"), user("c")],
      orders: [
        order({ id: "a1", userId: "a", email: "a@x.test", createdAt: "2026-09-01T00:00:00Z" }),
        order({ id: "b1", userId: "b", email: "b@x.test", createdAt: "2026-09-02T00:00:00Z" }),
        order({ id: "b2", userId: "b", email: "b@x.test", createdAt: "2026-10-02T00:00:00Z", hostOfferId: "fw" }),
        order({ id: "c1", userId: "c", email: "c@x.test", createdAt: "2026-09-03T00:00:00Z", hostOfferId: "mpb" }),
      ],
      items: [
        item({ orderId: "a1", productId: "dpv", amountCents: 2700 }),
        item({ orderId: "b1", productId: "dpv", amountCents: 2700 }),
        item({ orderId: "b2", kind: "oto", offerId: "fw", amountCents: 19700 }),
        item({ orderId: "c1", kind: "oto", offerId: "mpb", amountCents: 2900 }),
      ],
    });
    expect(r.people.map((p) => p.email)).toEqual(["c@x.test", "b@x.test", "a@x.test"]);
    expect(r.summary.map((s) => [s.what, s.buyers, s.boughtAgain, s.avgTotalSpentCents])).toEqual([
      ["Digital Product Validator", 2, 1, 12550],
      ["The Micro-Product Builder", 1, 0, 2900],
    ]);
  });
});
