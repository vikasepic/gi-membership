import { describe, it, expect } from "vitest";
import {
  applyFilter,
  chipCounts,
  filterFrom,
  filterHref,
  totalsFor,
  DEFAULT_FILTER,
} from "@/lib/order-view";
import type { OrderRow } from "@/lib/orders";

const NOW = Date.parse("2026-08-06T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: "o1",
  email: "a@test.com",
  status: "paid",
  currency: "usd",
  totalCents: 499,
  taxCents: null,
  buyerCountry: "IN",
  stripePaymentIntentId: "pi_abc123",
  livemode: true,
  createdAt: daysAgo(1),
  items: [{ kind: "product", description: "The Guide", amountCents: 499, stripeSubscriptionId: null }],
  ...over,
});

/** Close to the real store: nine orders, six paid, three refunded. */
const SET: OrderRow[] = [
  order({ id: "1", email: "ronit@test.com", status: "refunded", totalCents: 50, createdAt: daysAgo(1) }),
  order({ id: "2", email: "vicky@test.com", status: "refunded", totalCents: 499, createdAt: daysAgo(5) }),
  order({ id: "3", email: "vicky+1@test.com", totalCents: 499, createdAt: daysAgo(5) }),
  order({ id: "4", email: "connect@test.com", totalCents: 700, createdAt: daysAgo(8) }),
  order({
    id: "5",
    email: "hello@test.com",
    totalCents: 9900,
    createdAt: daysAgo(40),
    items: [
      { kind: "product", description: "Content Engine — Yearly", amountCents: 9900, stripeSubscriptionId: "sub_1" },
    ],
  }),
  order({ id: "6", email: "ronit@test.com", status: "refunded", totalCents: 499, createdAt: daysAgo(60) }),
  order({ id: "7", email: "vikas@test.com", totalCents: 700, createdAt: daysAgo(100) }),
  order({
    id: "8",
    email: "trial@test.com",
    totalCents: 0,
    createdAt: daysAgo(2),
    items: [{ kind: "bump", description: "Funnel App — Monthly", amountCents: 0, stripeSubscriptionId: "sub_2" }],
  }),
  order({ id: "9", email: "test+9@test.com", totalCents: 499, createdAt: daysAgo(3) }),
];

const at = (f: Partial<typeof DEFAULT_FILTER> = {}) => ({ ...DEFAULT_FILTER, ...f });
const ids = (rows: OrderRow[]) => rows.map((o) => o.id);

describe("reading a filter off the URL", () => {
  it("defaults to everything, newest first", () => {
    expect(filterFrom({})).toEqual(DEFAULT_FILTER);
  });

  it("refuses a status it does not know", () => {
    // A hand-edited URL should show everything, not nothing and not a crash.
    expect(filterFrom({ status: "'; drop table orders" }).status).toBe("all");
  });

  it("refuses a range it does not know", () => {
    expect(filterFrom({ range: "9999" }).range).toBe("all");
  });

  it("takes the first of a repeated parameter", () => {
    expect(filterFrom({ status: ["paid", "refunded"] }).status).toBe("paid");
  });

  it("caps a search that is really a payload", () => {
    expect(filterFrom({ q: "x".repeat(500) }).q.length).toBe(120);
  });
});

describe("the links the chips carry", () => {
  it("leaves nothing in the URL for the default view", () => {
    // A tidy address is one someone can read, and "all/all/newest" says nothing.
    expect(filterHref(DEFAULT_FILTER, {})).toBe("/admin/orders");
  });

  it("keeps everything else while changing one thing", () => {
    const href = filterHref(at({ q: "ronit", range: "30" }), { status: "refunded" });
    expect(href).toContain("status=refunded");
    expect(href).toContain("q=ronit");
    expect(href).toContain("range=30");
  });

  it("drops a value that has gone back to the default", () => {
    expect(filterHref(at({ status: "paid" }), { status: "all" })).toBe("/admin/orders");
  });
});

describe("filtering", () => {
  it("shows everything by default", () => {
    expect(applyFilter(SET, DEFAULT_FILTER, NOW)).toHaveLength(9);
  });

  it("filters by status", () => {
    expect(applyFilter(SET, at({ status: "refunded" }), NOW)).toHaveLength(3);
    expect(applyFilter(SET, at({ status: "paid" }), NOW)).toHaveLength(6);
  });

  it("treats subscriptions as its own question", () => {
    // Someone on a plan may have paid nothing today, and the status column
    // cannot say so — which is why the orders list could not answer this at all.
    expect(ids(applyFilter(SET, at({ status: "subscriptions" }), NOW))).toEqual(["8", "5"]);
  });

  it("cuts by date", () => {
    expect(applyFilter(SET, at({ range: "7" }), NOW)).toHaveLength(5);
    expect(applyFilter(SET, at({ range: "30" }), NOW)).toHaveLength(6);
  });

  it("combines a status with a range", () => {
    expect(applyFilter(SET, at({ status: "refunded", range: "7" }), NOW)).toHaveLength(2);
  });
});

describe("searching", () => {
  it("finds a buyer", () => {
    expect(applyFilter(SET, at({ q: "ronit" }), NOW)).toHaveLength(2);
  });

  it("finds a payment id", () => {
    // What actually arrives in a support email from someone who cannot
    // remember which address they used.
    expect(applyFilter(SET, at({ q: "pi_abc123" }), NOW)).toHaveLength(9);
  });

  it("finds a product name", () => {
    expect(ids(applyFilter(SET, at({ q: "content engine" }), NOW))).toEqual(["5"]);
  });

  it("finds a subscription id", () => {
    expect(ids(applyFilter(SET, at({ q: "sub_2" }), NOW))).toEqual(["8"]);
  });

  it("ignores case", () => {
    expect(applyFilter(SET, at({ q: "RONIT" }), NOW)).toHaveLength(2);
  });

  it("finds nothing rather than everything when nothing matches", () => {
    expect(applyFilter(SET, at({ q: "zzzz" }), NOW)).toHaveLength(0);
  });
});

describe("sorting", () => {
  it("puts the newest first", () => {
    expect(ids(applyFilter(SET, DEFAULT_FILTER, NOW))[0]).toBe("1");
  });

  it("can put the oldest first", () => {
    expect(ids(applyFilter(SET, at({ sort: "oldest" }), NOW))[0]).toBe("7");
  });

  it("can put the largest first", () => {
    expect(ids(applyFilter(SET, at({ sort: "largest" }), NOW))[0]).toBe("5");
  });

  it("does not reorder the caller's array", () => {
    const before = ids(SET);
    applyFilter(SET, at({ sort: "largest" }), NOW);
    expect(ids(SET)).toEqual(before);
  });
});

describe("the figures", () => {
  it("count what is on screen, not what exists", () => {
    // Three numbers that never move whatever you filter to are decoration.
    const shown = applyFilter(SET, at({ range: "7" }), NOW);
    expect(totalsFor(shown).shown).toBe(5);
    expect(totalsFor(SET).shown).toBe(9);
  });

  it("leave refunded money out of the takings", () => {
    // It was taken and given back. A total that counts it overstates the store.
    const t = totalsFor(SET);
    expect(t.paidCents).toBe(499 + 700 + 9900 + 0 + 700 + 499);
    expect(t.refundedCents).toBe(50 + 499 + 499);
  });

  it("average across what was actually paid", () => {
    // Dividing by everything would report an average nobody was charged.
    const t = totalsFor(SET);
    expect(t.averageCents).toBe(Math.round(t.paidCents / t.paidCount));
  });

  it("survive an empty screen", () => {
    const t = totalsFor([]);
    expect(t.shown).toBe(0);
    expect(t.averageCents).toBe(0);
    expect(t.currency).toBe("usd");
  });
});

describe("the counts on the chips", () => {
  it("say how many each one would show", () => {
    const c = chipCounts(SET, DEFAULT_FILTER, NOW);
    expect(c.all).toBe(9);
    expect(c.paid).toBe(6);
    expect(c.refunded).toBe(3);
    expect(c.subscriptions).toBe(2);
  });

  it("respect the other filters", () => {
    // "Refunded 3" while the range is this week, when all three were in July,
    // is a chip lying about what clicking it does.
    const c = chipCounts(SET, at({ range: "7" }), NOW);
    expect(c.refunded).toBe(2);
    expect(c.all).toBe(5);
  });

  it("are not changed by the status already chosen", () => {
    // Otherwise every chip but the active one would read zero.
    const c = chipCounts(SET, at({ status: "refunded" }), NOW);
    expect(c.paid).toBe(6);
  });

  it("respect the search too", () => {
    const c = chipCounts(SET, at({ q: "ronit" }), NOW);
    expect(c.all).toBe(2);
    expect(c.paid).toBe(0);
  });
});
