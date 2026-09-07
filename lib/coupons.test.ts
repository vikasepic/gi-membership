import { describe, it, expect } from "vitest";
import { couponTrialDays, intervalAllowed, couponTrialNote } from "@/lib/coupons";

describe("the trial a coupon carries", () => {
  it("reads a whole number of days", () => {
    expect(couponTrialDays({ trial_days: "30" })).toBe(30);
    expect(couponTrialDays({ trial_days: " 14 " })).toBe(14);
  });

  it("has none when the key is absent", () => {
    expect(couponTrialDays({})).toBeNull();
  });

  it("ignores nonsense rather than refusing the whole code", () => {
    // A typo in Stripe must not break a code that also carries a discount.
    // Refusing here would take a working promotion off the air over a stray
    // character in a field that is optional in the first place.
    for (const bad of ["", "thirty", "30.5", "-1", "366", "1e3"]) {
      expect(couponTrialDays({ trial_days: bad })).toBeNull();
    }
  });

  it("allows zero, which means no trial at all", () => {
    // Distinct from absent: a code can deliberately REMOVE a trial.
    expect(couponTrialDays({ trial_days: "0" })).toBe(0);
  });
});

describe("which billing intervals a coupon allows", () => {
  it("allows everything when it names nothing", () => {
    expect(intervalAllowed({}, "month")).toBe(true);
    expect(intervalAllowed({}, "year")).toBe(true);
    expect(intervalAllowed({}, null)).toBe(true);
  });

  it("allows only what it names", () => {
    expect(intervalAllowed({ intervals: "month" }, "month")).toBe(true);
    expect(intervalAllowed({ intervals: "month" }, "year")).toBe(false);
    expect(intervalAllowed({ intervals: "month,year" }, "year")).toBe(true);
  });

  it("refuses a one-time purchase when it names intervals", () => {
    // A one-time charge has no interval, so a code that names one cannot
    // sensibly apply to it. This is the guard that stops a "2 months free"
    // code being flattened onto a single payment.
    expect(intervalAllowed({ intervals: "month" }, null)).toBe(false);
  });

  it("is not fooled by spacing or case", () => {
    expect(intervalAllowed({ intervals: " Month , YEAR " }, "year")).toBe(true);
  });
});

describe("what the buyer is told about a coupon's trial", () => {
  it("says nothing when the code does not touch the trial", () => {
    expect(couponTrialNote(null, 7)).toBeNull();
  });

  it("says nothing when the code grants the trial they already had", () => {
    // Technically a change, visibly not one. Saying "30 days free" twice is
    // noise, and noise beside a price reads as a trick.
    expect(couponTrialNote(30, 30)).toBeNull();
  });

  it("names the longer trial the code buys", () => {
    expect(couponTrialNote(30, 7)).toBe("30 days free instead of 7");
  });

  it("is honest when a code shortens or removes the trial", () => {
    expect(couponTrialNote(0, 7)).toBe("no free trial with this code");
    expect(couponTrialNote(3, 7)).toBe("3 days free instead of 7");
  });

  it("names a trial added to a price that had none", () => {
    expect(couponTrialNote(30, null)).toBe("30 days free");
    expect(couponTrialNote(30, 0)).toBe("30 days free");
  });
});
