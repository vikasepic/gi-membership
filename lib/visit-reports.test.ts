// lib/visit-reports.test.ts
import { describe, it, expect } from "vitest";
import { outcomeOf, labelPairs, type VisitRow } from "@/lib/visit-reports";

const visit = (steps: VisitRow["steps"]): VisitRow => ({
  id: "v1", startedAt: "2026-09-11T10:00:00Z", landingPath: "/", landingQuery: null,
  referrer: null, referrerHost: null, utmFirst: {}, utmLast: {},
  device: "desktop", browser: "Chrome", os: "macOS", userAgent: "ua", steps,
});

describe("outcomeOf", () => {
  it("reports the furthest point reached, not the last one recorded", () => {
    expect(outcomeOf(visit([]))).toBe("browsed");
    expect(outcomeOf(visit([{ step: "checkout", at: "", orderId: null, valueCents: null }]))).toBe("checkout");
    expect(outcomeOf(visit([{ step: "upsell", at: "", orderId: null, valueCents: null }, { step: "checkout", at: "", orderId: null, valueCents: null }]))).toBe("upsell");
    expect(outcomeOf(visit([{ step: "checkout", at: "", orderId: null, valueCents: null }, { step: "purchase", at: "", orderId: "o1", valueCents: 4900 }]))).toBe("bought");
  });
});

describe("labelPairs", () => {
  it("names each label in the order a reader expects, skipping the absent ones", () => {
    expect(labelPairs({ utm_campaign: "A", utm_source: "meta", utm_adset: "LAL" })).toEqual([
      { label: "Source", value: "meta" },
      { label: "Campaign", value: "A" },
      { label: "Ad set", value: "LAL" },
    ]);
  });
  it("returns nothing for an empty set", () => {
    expect(labelPairs({})).toEqual([]);
  });
});
