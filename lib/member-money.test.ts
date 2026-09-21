import { describe, it, expect } from "vitest";
import type { MoneyData } from "@/lib/money-data";
import type { SubscriptionRow } from "@/lib/subscriptions";
import { deriveMembers, applyMemberFilter, memberTiles, DEFAULT_MEMBER_FILTER, monthlyCents, sourceOf, subView } from "@/lib/member-money";
import { deriveLedger, applyLedgerFilter, ledgerTotals, breakdown, DEFAULT_LEDGER_FILTER } from "@/lib/ledger";
import { deriveTrials, trialsFor, trialsByWeek } from "@/lib/trials-view";

/**
 * The money screens' arithmetic, on one fixture.
 *
 * Asked for 21 Sep 2026: who is on a trial and when it ends, who converted,
 * who renewed, and what one person has paid in total. Every screen derives
 * from the same rows, so one fixture exercises all three derivations and the
 * totals they must agree on.
 */
const NOW = new Date("2026-09-21T09:00:00Z");
const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: over.stripeSubscriptionId ?? "s",
  stripeSubscriptionId: "s",
  stripeCustomerId: "cus",
  userId: null,
  offerId: "ce",
  productId: null,
  status: "trialing",
  amountCents: 5800,
  currency: "usd",
  interval: "month",
  intervalCount: 1,
  installments: null,
  trialStart: "2026-09-18T10:00:00Z",
  trialEnd: "2026-09-25T10:00:00Z",
  currentPeriodStart: "2026-09-18T10:00:00Z",
  currentPeriodEnd: "2026-09-25T10:00:00Z",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  paidInvoices: 0,
  paidTotalCents: 0,
  firstPaidAt: null,
  lastPaidAt: null,
  livemode: true,
  startedAt: "2026-09-18T10:00:00Z",
  ...over,
});
const order = (o: Partial<MoneyData["orders"][number]> & { id: string; userId: string }): MoneyData["orders"][number] => ({
  email: `${o.userId}@e.com`,
  status: "paid",
  totalCents: 2900,
  currency: "usd",
  livemode: true,
  createdAt: "2026-09-18T10:00:00Z",
  updatedAt: "2026-09-18T10:00:00Z",
  stripeInvoiceId: null,
  stripePaymentIntentId: "pi",
  hostOfferId: null,
  utmFirst: {},
  utmLast: {},
  referrer: null,
  ...o,
});

const DATA: MoneyData = {
  now: NOW,
  users: [
    { id: "eric", email: "eric@e.com", name: "Eric", isAdmin: false, createdAt: "2026-09-18T09:00:00Z" },
    { id: "dael", email: "dael@e.com", name: "Dael", isAdmin: false, createdAt: "2026-09-10T09:00:00Z" },
    { id: "ismat", email: "ismat@e.com", name: "Ismat", isAdmin: false, createdAt: "2026-09-11T09:00:00Z" },
    { id: "jenny", email: "jenny@e.com", name: "Jenny", isAdmin: false, createdAt: "2026-09-08T09:00:00Z" },
    { id: "nobody", email: "nobody@e.com", name: null, isAdmin: false, createdAt: "2026-09-01T09:00:00Z" },
  ],
  orders: [
    // Eric: bought the Micro-Product Builder from a Meta ad and started a Funnel App trial as a bump.
    order({ id: "o1", userId: "eric", hostOfferId: "mpb", utmFirst: { utm_source: "meta", utm_campaign: "MPB" }, utmLast: { utm_source: "meta", utm_campaign: "MPB" } }),
    // Dael: trial on 10 Sep, converted 17 Sep (a renewal order), renews again 17 Oct.
    order({ id: "o2", userId: "dael", totalCents: 0, createdAt: "2026-09-10T10:00:00Z", updatedAt: "2026-09-10T10:00:00Z", stripePaymentIntentId: null, hostOfferId: "ce" }),
    order({ id: "o3", userId: "dael", totalCents: 5800, createdAt: "2026-09-17T10:00:00Z", updatedAt: "2026-09-17T10:00:00Z", stripeInvoiceId: "in_1", stripePaymentIntentId: null }),
    // Ismat: trial cancelled before paying.
    order({ id: "o4", userId: "ismat", totalCents: 0, createdAt: "2026-09-11T10:00:00Z", updatedAt: "2026-09-11T10:00:00Z", stripePaymentIntentId: null, hostOfferId: "ce" }),
    // Jenny: bought a product, took the upsell, then the upsell was refunded.
    order({ id: "o5", userId: "jenny", totalCents: 2900, createdAt: "2026-09-08T10:00:00Z", updatedAt: "2026-09-08T10:00:00Z" }),
    order({ id: "o6", userId: "jenny", totalCents: 4700, status: "refunded", createdAt: "2026-09-08T11:00:00Z", updatedAt: "2026-09-09T11:00:00Z" }),
    // A test-mode order must count nowhere.
    order({ id: "o7", userId: "jenny", totalCents: 9900, livemode: false }),
  ],
  items: [
    { orderId: "o1", kind: "oto", description: "MPB", amountCents: 2900, offerId: "mpb", productId: null, stripeSubscriptionId: null },
    { orderId: "o1", kind: "bump", description: "Funnel App", amountCents: 0, offerId: "fa", productId: null, stripeSubscriptionId: "sub_fa" },
    { orderId: "o2", kind: "oto", description: "CE", amountCents: 0, offerId: "ce", productId: null, stripeSubscriptionId: "sub_dael" },
    { orderId: "o3", kind: "renewal", description: "CE", amountCents: 5800, offerId: "ce", productId: null, stripeSubscriptionId: "sub_dael" },
    { orderId: "o4", kind: "oto", description: "CE", amountCents: 0, offerId: "ce", productId: null, stripeSubscriptionId: "sub_ismat" },
    { orderId: "o5", kind: "product", description: "Validator", amountCents: 2900, offerId: null, productId: "dpv", stripeSubscriptionId: null },
    { orderId: "o6", kind: "oto", description: "Book Writer", amountCents: 4700, offerId: "bw", productId: null, stripeSubscriptionId: null },
    { orderId: "o7", kind: "product", description: "Validator", amountCents: 9900, offerId: null, productId: "dpv", stripeSubscriptionId: null },
  ],
  subscriptions: [
    sub({ stripeSubscriptionId: "sub_fa", userId: "eric", offerId: "fa", amountCents: 2900, trialEnd: "2026-09-25T10:00:00Z" }),
    sub({ stripeSubscriptionId: "sub_dael", userId: "dael", status: "active", trialStart: "2026-09-10T10:00:00Z", trialEnd: "2026-09-17T10:00:00Z", currentPeriodStart: "2026-09-17T10:00:00Z", currentPeriodEnd: "2026-10-17T10:00:00Z", paidInvoices: 1, paidTotalCents: 5800, firstPaidAt: "2026-09-17T10:00:00Z", lastPaidAt: "2026-09-17T10:00:00Z", startedAt: "2026-09-10T10:00:00Z" }),
    sub({ stripeSubscriptionId: "sub_ismat", userId: "ismat", status: "canceled", trialStart: "2026-09-11T10:00:00Z", trialEnd: "2026-09-18T10:00:00Z", canceledAt: "2026-09-15T10:00:00Z", endedAt: "2026-09-15T10:00:00Z", startedAt: "2026-09-11T10:00:00Z" }),
  ],
  ownership: [
    { userId: "eric", productId: null, offerId: "mpb", appId: null, status: "active", stripeSubscriptionId: null },
    { userId: "eric", productId: null, offerId: "fa", appId: "app", status: "trialing", stripeSubscriptionId: "sub_fa" },
    { userId: "dael", productId: null, offerId: "ce", appId: "app", status: "active", stripeSubscriptionId: "sub_dael" },
    { userId: "jenny", productId: "dpv", offerId: null, appId: null, status: "active", stripeSubscriptionId: null },
  ],
  names: {
    offers: new Map([
      ["mpb", { name: "The Micro-Product Builder", contentName: "Micro-Product Builder", billingType: "one_time", priceCents: 2900 }],
      ["fa", { name: "Funnel App", contentName: "Funnel App", billingType: "recurring", priceCents: 2900 }],
      ["ce", { name: "Content Engine — IG + LI", contentName: "Content Engine - IG + LI", billingType: "recurring", priceCents: 5800 }],
      ["bw", { name: "Book Writer", contentName: "Book Writer", billingType: "one_time", priceCents: 4700 }],
    ]),
    products: new Map([["dpv", { name: "Digital Product Validator", priceCents: 2900 }]]),
    apps: new Map([["app", "Content Engine"]]),
  },
};

describe("members", () => {
  const members = deriveMembers(DATA);
  const by = (id: string) => members.find((m) => m.id === id)!;

  it("puts each person in one journey and says what comes next", () => {
    expect(by("eric")).toMatchObject({ journey: "on trial", nextEvent: { what: "trial ends", at: "2026-09-25T10:00:00Z", name: "Funnel App" }, source: "meta / MPB" });
    expect(by("dael")).toMatchObject({ journey: "paying", converted: true, nextEvent: { what: "renews", at: "2026-10-17T10:00:00Z" }, mrrCents: 5800 });
    expect(by("ismat")).toMatchObject({ journey: "trial cancelled", converted: false, nextEvent: null });
    expect(by("jenny")).toMatchObject({ journey: "one-off buyer" });
    expect(by("nobody")).toMatchObject({ journey: "no access", totalPaidCents: 0 });
  });

  it("counts what each person has paid us, renewals in, refunds and test mode out", () => {
    expect(by("dael")).toMatchObject({ payments: 1, totalPaidCents: 5800, lastPaidAt: "2026-09-17T10:00:00Z" });
    expect(by("jenny")).toMatchObject({ payments: 1, refunds: 1, totalPaidCents: 2900, refundedCents: 4700 });
    expect(by("eric")).toMatchObject({ payments: 1, totalPaidCents: 2900 });
  });

  it("tiles follow the filter", () => {
    const all = memberTiles(members, NOW);
    expect(all).toMatchObject({ members: 5, paying: 1, mrrCents: 5800, onTrial: 1, endingThisWeek: 1, convertedThisMonth: 1, cancelledThisMonth: 1, collectedCents: 2900 + 5800 + 2900 - 4700 });
    const trials = applyMemberFilter(members, { ...DEFAULT_MEMBER_FILTER, journey: "on trial" }, NOW);
    expect(trials.map((m) => m.id)).toEqual(["eric"]);
    expect(memberTiles(trials, NOW).collectedCents).toBe(2900);
  });

  it("filters by what they hold and by an event within the week, and sorts by total", () => {
    expect(applyMemberFilter(members, { ...DEFAULT_MEMBER_FILTER, offer: "dpv" }, NOW).map((m) => m.id)).toEqual(["jenny"]);
    expect(applyMemberFilter(members, { ...DEFAULT_MEMBER_FILTER, soon: true }, NOW).map((m) => m.id)).toEqual(["eric"]);
    expect(applyMemberFilter(members, { ...DEFAULT_MEMBER_FILTER, sort: "total" }, NOW)[0].id).toBe("dael");
    expect(applyMemberFilter(members, { ...DEFAULT_MEMBER_FILTER, journey: "converted" }, NOW).map((m) => m.id)).toEqual(["dael"]);
  });

  it("normalises a yearly price to a month and reads a source off labels or the referrer", () => {
    expect(monthlyCents({ amountCents: 12000, interval: "year", intervalCount: 1 })).toBe(1000);
    expect(sourceOf({}, "https://www.facebook.com/")).toBe("facebook.com");
    expect(sourceOf({}, null)).toBe("direct");
  });
});

describe("ledger", () => {
  const rows = deriveLedger(DATA);
  it("gives every movement a kind, and a trial its end and outcome", () => {
    const kinds = rows.map((r) => `${r.kind}:${r.what}`);
    expect(kinds).toContain("purchase:The Micro-Product Builder");
    expect(kinds).toContain("trial:Funnel App");
    expect(kinds).toContain("renewal:Content Engine — IG + LI");
    expect(kinds).toContain("refund:Book Writer");
    expect(kinds).toContain("upsell:Book Writer");
    expect(kinds).toContain("cancellation:Content Engine — IG + LI");
    const daelTrial = rows.find((r) => r.kind === "trial" && r.userId === "dael")!;
    expect(daelTrial.trial).toMatchObject({ endsAt: "2026-09-17T10:00:00Z", thenCents: 5800, outcome: "converted", outcomeAt: "2026-09-17T10:00:00Z" });
    const ericTrial = rows.find((r) => r.kind === "trial" && r.userId === "eric")!;
    expect(ericTrial.trial?.outcome).toBe("on trial");
  });
  it("totals what is on screen, net of refunds, live only by default", () => {
    const shown = applyLedgerFilter(rows, { ...DEFAULT_LEDGER_FILTER, range: "all" }, NOW);
    expect(shown.some((r) => !r.livemode)).toBe(false);
    expect(ledgerTotals(shown)).toMatchObject({ grossCents: 2900 + 5800 + 2900 + 4700, refundCents: 4700, netCents: 2900 + 5800 + 2900, renewals: 1, renewalCents: 5800, trialsStarted: 3, newCustomers: 4 });
    const week = applyLedgerFilter(rows, { ...DEFAULT_LEDGER_FILTER, range: "7" }, NOW);
    expect(week.map((r) => r.kind).sort()).toEqual(["cancellation", "purchase", "renewal", "trial"]);
  });
  it("breaks down by what and by where they came from", () => {
    const shown = applyLedgerFilter(rows, { ...DEFAULT_LEDGER_FILTER, range: "all" }, NOW);
    expect(breakdown(shown, (r) => r.what)[0]).toMatchObject({ name: "Content Engine — IG + LI", netCents: 5800 });
    expect(breakdown(shown, (r) => r.source).find((b) => b.name === "meta / MPB")).toMatchObject({ netCents: 2900 });
  });
});

describe("trials", () => {
  const rows = deriveTrials(DATA);
  it("names each trial's outcome and days left", () => {
    expect(rows.map((t) => [t.email, t.outcome, t.daysLeft])).toEqual([
      ["eric@e.com", "on trial", 4],
      ["ismat@e.com", "cancelled", -3],
      ["dael@e.com", "converted", -4],
    ]);
    expect(trialsFor(rows, "ending").map((t) => t.email)).toEqual(["eric@e.com"]);
    expect(trialsFor(rows, "lost").map((t) => t.email)).toEqual(["ismat@e.com"]);
  });
  it("groups by the week the trial started", () => {
    const weeks = trialsByWeek(rows);
    expect(weeks[0]).toMatchObject({ weekStart: "2026-09-14T00:00:00.000Z", started: 1, pending: 1 });
    expect(weeks[1]).toMatchObject({ weekStart: "2026-09-07T00:00:00.000Z", started: 2, converted: 1, lost: 1, paidCents: 5800 });
  });
});

/**
 * Stripe schedules an end two ways. `cancel_at_period_end` is the one the
 * dashboard's button sets; a dated `cancel_at` leaves that flag false. Seen
 * live 21 Sep 2026: a member whose subscription stops on 12 Oct was shown
 * as paying, with "renews in 22 days" against the very date it ends.
 */
describe("a subscription that is scheduled to end", () => {
  it("is cancelling, and its next event is the cancellation", () => {
    const v = subView(
      sub({ status: "active", cancelAtPeriodEnd: false, cancelAt: "2026-10-12T18:11:41Z", canceledAt: "2026-09-21T03:33:50Z", paidInvoices: 2, paidTotalCents: 5800, currentPeriodEnd: "2026-10-12T18:11:41Z" }),
      "funnel builder",
    );
    expect(v.state).toBe("cancelling");
    expect(v.cancelsAt).toBe("2026-10-12T18:11:41Z");
    expect(v.nextChargeAt).toBeNull();
  });

  it("still counts toward what recurs, because the money has not stopped yet", () => {
    const v = subView(sub({ status: "active", cancelAt: "2026-10-12T18:11:41Z", amountCents: 2900, paidInvoices: 2 }), "x");
    expect(monthlyCents(v)).toBe(2900);
  });

  it("reads as a cancelled trial when the cancellation lands before the first charge", () => {
    const v = subView(sub({ status: "trialing", cancelAt: "2026-09-25T10:00:00Z" }), "x");
    expect(v.state).toBe("trial cancelled");
  });

  it("leaves an ordinary subscription alone", () => {
    const v = subView(sub({ status: "active", currentPeriodEnd: "2026-10-17T10:00:00Z", paidInvoices: 1 }), "x");
    expect(v.state).toBe("paying");
    expect(v.cancelsAt).toBeNull();
    expect(v.nextChargeAt).toBe("2026-10-17T10:00:00Z");
  });
});

describe("when a member joined", () => {
  it("is their oldest money, not the day this store first wrote a row for them", () => {
    // A subscription a connected app started creates the user row on the day
    // the sync runs. Eric's Funnel App trial began 18 Sep; his row says 18 Sep
    // too, so the honest date is unchanged here — Dael is the one who proves
    // the rule, joining on her trial rather than her row.
    const dael = deriveMembers(DATA).find((m) => m.id === "dael");
    expect(dael?.joinedAt).toBe("2026-09-10T09:00:00Z");
  });

  it("prefers a subscription older than the user row", () => {
    const data = { ...DATA, users: [{ id: "late", email: "late@e.com", name: null, isAdmin: false, createdAt: "2026-09-21T04:33:24Z" }], orders: [], items: [], ownership: [], subscriptions: [sub({ stripeSubscriptionId: "sub_late", userId: "late", status: "active", startedAt: "2026-08-05T18:11:41Z", paidInvoices: 2, paidTotalCents: 5800 })] };
    expect(deriveMembers(data).find((m) => m.id === "late")?.joinedAt).toBe("2026-08-05T18:11:41Z");
  });
});

describe("a trial that is already scheduled to stop", () => {
  it("is not counted among the trials still in flight", () => {
    const data = { ...DATA, subscriptions: [sub({ stripeSubscriptionId: "sub_out", userId: "eric", status: "trialing", cancelAt: "2026-09-25T10:00:00Z", canceledAt: "2026-09-20T10:00:00Z" })] };
    const rows = deriveTrials(data);
    expect(rows[0].outcome).toBe("cancelled");
    expect(trialsFor(rows, "on trial")).toHaveLength(0);
    expect(trialsFor(rows, "lost")).toHaveLength(1);
  });
});

/**
 * A subscription a connected app started has no order behind it, so nothing
 * in the order tables records that it began with a trial. Seen live 21 Sep
 * 2026: a member's funnel builder trial of 5 Aug was missing from her
 * timeline, which opened on a renewal with no beginning.
 */
describe("a subscription with no order of its own", () => {
  const appStarted = {
    ...DATA,
    users: [{ id: "britt", email: "britt@e.com", name: "Britt", isAdmin: false, createdAt: "2026-09-21T04:33:24Z" }],
    orders: [],
    items: [],
    ownership: [{ userId: "britt", productId: null, offerId: null, appId: "app", status: "active", stripeSubscriptionId: "sub_app" }],
    subscriptions: [
      sub({ stripeSubscriptionId: "sub_app", userId: "britt", offerId: null, amountCents: 2900, status: "active", trialStart: "2026-08-05T18:11:41Z", trialEnd: "2026-08-12T18:11:41Z", startedAt: "2026-08-05T18:11:41Z", paidInvoices: 2, paidTotalCents: 5800, firstPaidAt: "2026-08-12T18:11:41Z" }),
    ],
  };

  it("still puts its trial on the timeline, dated when the trial began", () => {
    const trial = deriveLedger(appStarted).find((r) => r.kind === "trial");
    expect(trial?.at).toBe("2026-08-05T18:11:41Z");
    expect(trial?.trial?.endsAt).toBe("2026-08-12T18:11:41Z");
    expect(trial?.trial?.outcome).toBe("converted");
  });

  it("names it after the app that holds the access, not 'Subscription'", () => {
    expect(deriveLedger(appStarted).find((r) => r.kind === "trial")?.what).toBe("Content Engine");
  });

  it("does not double up when an order already recorded the trial", () => {
    expect(deriveLedger(DATA).filter((r) => r.kind === "trial" && r.stripeSubscriptionId === "sub_dael")).toHaveLength(1);
  });
});
