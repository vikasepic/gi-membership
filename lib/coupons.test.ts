import { describe, it, expect } from "vitest";
import { couponTrialDays, intervalAllowed } from "@/lib/coupons";

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
