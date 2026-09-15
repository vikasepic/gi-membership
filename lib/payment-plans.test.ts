import { describe, it, expect } from "vitest";
import { isPlan, planSentence, planOutcome } from "@/lib/payment-plans";

describe("what a plan is", () => {
  it("is a recurring price with instalments, and nothing else", () => {
    expect(isPlan({ billingType: "recurring", installments: 3 })).toBe(true);
    expect(isPlan({ billingType: "recurring", installments: null })).toBe(false);
    expect(isPlan({ billingType: "one_time", installments: null })).toBe(false);
    expect(isPlan({ billingType: "recurring" })).toBe(false);
  });
});

describe("what a plan says", () => {
  const monthly = { installments: 3, interval: "month", intervalCount: 1, trialDays: null };
  it("counts the payments and says when it is theirs", () => {
    expect(planSentence(monthly, "$199")).toBe("3 monthly payments of $199, then it's yours");
  });
  it("puts a trial in front", () => {
    expect(planSentence({ ...monthly, trialDays: 7 }, "$199")).toBe(
      "7 days free, then 3 monthly payments of $199, then it's yours",
    );
  });
  it("lets a coupon replace the trial, including taking it away", () => {
    expect(planSentence({ ...monthly, trialDays: 7 }, "$199", 30)).toContain("30 days free");
    expect(planSentence({ ...monthly, trialDays: 7 }, "$199", 0)).toBe("3 monthly payments of $199, then it's yours");
  });
  it("says the interval when it is not one month", () => {
    expect(planSentence({ ...monthly, intervalCount: 2 }, "$199")).toBe(
      "3 payments of $199 every 2 months, then it's yours",
    );
    expect(planSentence({ ...monthly, interval: "week" }, "$50")).toBe("3 weekly payments of $50, then it's yours");
  });
});

describe("what the end of a plan means", () => {
  it("is paid off only once every instalment is paid", () => {
    expect(planOutcome(3, 3)).toBe("paid_off");
    expect(planOutcome(3, 4)).toBe("paid_off");
    expect(planOutcome(3, 2)).toBe("canceled");
    expect(planOutcome(3, 0)).toBe("canceled");
  });
});
