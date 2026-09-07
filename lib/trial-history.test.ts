import { describe, it, expect } from "vitest";
import { grantKeysOf, withoutTrial } from "@/lib/trial-history";
import type { Offer } from "@/lib/types";

// A free trial is a thing you get once. The rules that decide it, without the
// database around them.

const offer = (over: Partial<Offer>): Offer =>
  ({
    id: "o1",
    grantAppId: null,
    grantEntitlementKey: null,
    grantProductId: null,
    grantChannels: [],
    trialDays: 7,
    priceCents: 2900,
    interval: "month",
    billingType: "recurring",
    currency: "usd",
    ...over,
  }) as Offer;

describe("what a trial is remembered against", () => {
  it("the app and entitlement it granted, not the offer that sold it", () => {
    // The monthly and the yearly Funnel App offers grant the same thing, so
    // trialling one has to close the other. An offer-keyed record would be a
    // loophole with two doors.
    const monthly = offer({ id: "m", grantAppId: "app1", grantEntitlementKey: "funnel" });
    const yearly = offer({ id: "y", grantAppId: "app1", grantEntitlementKey: "funnel" });
    expect(grantKeysOf(monthly)).toEqual(grantKeysOf(yearly));
  });

  it("keeps different apps apart", () => {
    expect(grantKeysOf(offer({ grantAppId: "a", grantEntitlementKey: "x" }))).not.toEqual(
      grantKeysOf(offer({ grantAppId: "b", grantEntitlementKey: "x" })),
    );
  });

  it("keeps different entitlements of one app apart", () => {
    expect(grantKeysOf(offer({ grantAppId: "a", grantEntitlementKey: "basic" }))).not.toEqual(
      grantKeysOf(offer({ grantAppId: "a", grantEntitlementKey: "pro" })),
    );
  });

  it("handles an offer that grants a product instead", () => {
    expect(grantKeysOf(offer({ grantProductId: "p1" }))).toEqual(["product:p1"]);
  });

  it("is empty for an offer that grants nothing identifiable", () => {
    expect(grantKeysOf(offer({}))).toEqual([]);
  });
});

describe("selling to someone who has already had one", () => {
  it("takes the trial off", () => {
    expect(withoutTrial(offer({ trialDays: 7 })).trialDays).toBeNull();
  });

  it("changes nothing else about the offer", () => {
    const before = offer({ trialDays: 7, priceCents: 2900 });
    const after = withoutTrial(before);
    expect(after.priceCents).toBe(2900);
    expect(after.interval).toBe("month");
    expect(after.id).toBe(before.id);
  });

  it("returns the very same object when there is no trial to remove", () => {
    // The common path must allocate nothing and behave exactly as before.
    const plain = offer({ trialDays: null });
    expect(withoutTrial(plain)).toBe(plain);
  });
});

describe("what removing the trial makes every surface do", () => {
  // The point of doing it this way: six things read the trial off the offer,
  // so removing it there moves all six together and none can disagree.
  const repeat = withoutTrial(offer({ trialDays: 7, priceCents: 2900 }));

  it("charges the full price today instead of nothing", async () => {
    const { immediateChargeCents } = await import("@/lib/offers");
    expect(immediateChargeCents(offer({ trialDays: 7 }))).toBe(0);
    expect(immediateChargeCents(repeat)).toBe(2900);
  });

  it("stops the bump badging a free trial", async () => {
    const { saveBadge } = await import("@/lib/bump");
    expect(saveBadge(offer({ trialDays: 7 }))).toBe("7 days free");
    expect(saveBadge(repeat)).toBeNull();
  });

  it("starts ownership active rather than trialing", () => {
    // The same expression grantOfferOwnership uses.
    const status = (o: Offer) => (o.trialDays && o.trialDays > 0 ? "trialing" : "active");
    expect(status(offer({ trialDays: 7 }))).toBe("trialing");
    expect(status(repeat)).toBe("active");
  });

  it("applies the buyer tag rather than the trial tag", async () => {
    const { lifecycleTagOps } = await import("@/lib/ac-tags");
    const tags = { trial: "T", buyer: "B", cancelled: "C" };
    expect(lifecycleTagOps(tags, "trialing").add).toContain("T");
    expect(lifecycleTagOps(tags, "active").add).toContain("B");
  });

  it("leaves {trial} with nothing to say", () => {
    const label = (o: Offer) => (o.trialDays ? `${o.trialDays} days` : null);
    expect(label(offer({ trialDays: 7 }))).toBe("7 days");
    expect(label(repeat)).toBeNull();
  });
});

const app = (channels: string[]) => ({
  grantAppId: "8ee0321c-c78b-4638-a4a6-81a70d1e37bb",
  grantEntitlementKey: "content-engine",
  grantProductId: null,
  grantChannels: channels,
});

describe("what a trial is recorded against", () => {
  it("keeps the old key exactly when an offer has no channels", () => {
    // Rows already exist under this string. A changed format would silently
    // hand everybody a second free trial of something they have had.
    expect(grantKeysOf(app([]))).toEqual([
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine",
    ]);
  });

  it("records a product grant unchanged", () => {
    expect(
      grantKeysOf({ grantAppId: null, grantEntitlementKey: null, grantProductId: "p1", grantChannels: [] }),
    ).toEqual(["product:p1"]);
  });

  it("gives one key per channel", () => {
    expect(grantKeysOf(app(["instagram"]))).toEqual([
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine:ch:instagram",
    ]);
  });

  it("gives the bundle both channels' keys", () => {
    expect(grantKeysOf(app(["instagram", "linkedin"]))).toEqual([
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine:ch:instagram",
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine:ch:linkedin",
    ]);
  });

  it("does not repeat a key when a channel is listed twice", () => {
    // Two identical conflict keys in one upsert is not a duplicate Postgres
    // shrugs at — it aborts the statement ("cannot affect row a second time"),
    // so a duplicated channel would turn recording a trial into an error.
    expect(grantKeysOf(app(["instagram", "instagram"]))).toEqual([
      "app:8ee0321c-c78b-4638-a4a6-81a70d1e37bb:content-engine:ch:instagram",
    ]);
  });

  it("orders channels the same way however they arrive", () => {
    // The key IS the identity. Two spellings of one channel set would be two
    // trials, which is the loophole this is meant to close.
    expect(grantKeysOf(app(["linkedin", "instagram"]))).toEqual(grantKeysOf(app(["instagram", "linkedin"])));
  });

  it("grants nothing a key when it grants nothing", () => {
    expect(
      grantKeysOf({ grantAppId: null, grantEntitlementKey: null, grantProductId: null, grantChannels: [] }),
    ).toEqual([]);
  });
});
