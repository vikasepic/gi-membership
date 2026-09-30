import { describe, it, expect } from "vitest";
import type { MoneyData } from "@/lib/money-data";
import type { SubscriptionRow } from "@/lib/subscriptions";
import { deriveMembers, subView } from "@/lib/member-money";
import { deriveTrials } from "@/lib/trials-view";
import { deriveLedger } from "@/lib/ledger";

/**
 * A comped subscription is free access, not a paying customer.
 *
 * 30 Sep 2026: Kerry Watson's Funnel App signup carries a repeating 100%
 * coupon. Stripe keeps it active and invoices $0. The member page called
 * her "paying", counted $29 a month, promised a "Next charge", titled the
 * card "Subscription", and the Trials page said the card was not charged.
 */
const NOW = new Date("2026-09-30T09:00:00Z");
const row = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: "r",
  stripeSubscriptionId: "sub_x",
  stripeCustomerId: "cus",
  userId: "kerry",
  offerId: null,
  productId: null,
  status: "active",
  amountCents: 2900,
  currency: "usd",
  interval: "month",
  intervalCount: 1,
  installments: null,
  trialStart: "2026-08-31T13:41:00Z",
  trialEnd: "2026-09-07T13:41:00Z",
  currentPeriodStart: "2026-09-07T13:41:00Z",
  currentPeriodEnd: "2026-10-07T13:41:00Z",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  paidInvoices: 0,
  paidTotalCents: 0,
  firstPaidAt: null,
  lastPaidAt: null,
  livemode: true,
  startedAt: "2026-08-31T13:41:00Z",
  ...over,
});

const comped = row({ stripeSubscriptionId: "sub_funnel" });
const ceTrial = row({
  stripeSubscriptionId: "sub_ce",
  offerId: "ce",
  status: "trialing",
  amountCents: 5800,
  trialStart: "2026-09-27T10:00:00Z",
  trialEnd: "2026-10-04T10:00:00Z",
  currentPeriodEnd: "2026-10-04T10:00:00Z",
  startedAt: "2026-09-27T10:00:00Z",
});

const data = (subs: SubscriptionRow[]): MoneyData =>
  ({
    now: NOW,
    users: [{ id: "kerry", email: "kerry@e.com", name: "Kerry Watson", isAdmin: false, createdAt: "2026-08-31T13:41:00Z" }],
    orders: [],
    items: [],
    subscriptions: subs,
    ownership: [
      { userId: "kerry", productId: null, offerId: null, appId: "funnel", status: "active", stripeSubscriptionId: "sub_funnel" },
      { userId: "kerry", productId: null, offerId: "ce", appId: "ce-app", status: "trialing", stripeSubscriptionId: "sub_ce" },
    ],
    names: {
      offers: new Map([["ce", { name: "Content Engine — Instagram + LinkedIn", contentName: null, billingType: "recurring", priceCents: 5800 }]]),
      products: new Map(),
      apps: new Map([["funnel", "Funnel App"], ["ce-app", "Content Engine"]]),
    },
  }) as unknown as MoneyData;

describe("a subscription invoiced $0 after its trial", () => {
  it("is free access, with no next charge promised", () => {
    const v = subView(comped, "Funnel App");
    expect(v.state).toBe("free access");
    expect(v.nextChargeAt).toBeNull();
  });

  it("a real payment still makes it paying", () => {
    expect(subView(row({ paidInvoices: 1 }), "x").state).toBe("paying");
  });

  it("adds nothing to the monthly figure and makes nobody 'paying'", () => {
    const [m] = deriveMembers(data([comped]));
    expect(m.mrrCents).toBe(0);
    expect(m.journey).toBe("free access");
    expect(m.nextEvent).toBeNull();
  });

  it("ranks below a trial that is actually running", () => {
    const [m] = deriveMembers(data([comped, ceTrial]));
    expect(m.journey).toBe("on trial");
    expect(m.nextEvent?.what).toBe("trial ends");
  });

  it("is named as the app's own signup, not 'Subscription', on every screen", () => {
    const d = data([comped]);
    expect(deriveMembers(d)[0].subs[0].name).toBe("Funnel App (own signup)");
    const trialRow = deriveLedger(d).find((r) => r.stripeSubscriptionId === "sub_funnel");
    expect(trialRow?.what).toBe("Funnel App (own signup)");
    expect(trialRow?.trial?.outcome).toBe("free access");
  });

  it("is not one of Grow's trials, so the Trials page leaves it out", () => {
    const d = data([comped, ceTrial]);
    expect(deriveTrials(d).map((t) => t.stripeSubscriptionId)).toEqual(["sub_ce"]);
  });

  it("a Grow offer's trial that ends at $0 is free access on the Trials page", () => {
    const grow = row({ stripeSubscriptionId: "sub_grow", offerId: "ce" });
    expect(deriveTrials(data([grow]))[0]).toMatchObject({ outcome: "free access", what: "Content Engine — Instagram + LinkedIn" });
  });
});
