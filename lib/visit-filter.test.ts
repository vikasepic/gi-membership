import { describe, it, expect } from "vitest";
import type { VisitRow } from "@/lib/visit-view";
import { keepVisit } from "@/lib/visit-filter";

const v = (over: Partial<VisitRow>): VisitRow => ({
  id: "v", startedAt: "", landingPath: "/", landingQuery: null, referrer: null, referrerHost: null,
  utmFirst: {}, utmLast: {}, device: "phone", browser: "Safari", os: "iOS", userAgent: "ua", steps: [], ...over,
});

const NONE = { campaign: "", host: "", device: "", outcome: "", visit: "" };

describe("keepVisit", () => {
  it("keeps everything when nothing is set", () => {
    expect(keepVisit(v({}), NONE)).toBe(true);
  });
  it("narrows on each field independently", () => {
    expect(keepVisit(v({ utmLast: { utm_campaign: "A" } }), { ...NONE, campaign: "A" })).toBe(true);
    expect(keepVisit(v({ utmLast: { utm_campaign: "A" } }), { ...NONE, campaign: "B" })).toBe(false);
    expect(keepVisit(v({ referrerHost: "x.test" }), { ...NONE, host: "x.test" })).toBe(true);
    expect(keepVisit(v({ device: "desktop" }), { ...NONE, device: "phone" })).toBe(false);
    expect(keepVisit(v({ steps: [{ step: "purchase", at: "", orderId: null, valueCents: 1 }] }), { ...NONE, outcome: "bought" })).toBe(true);
    expect(keepVisit(v({ steps: [] }), { ...NONE, outcome: "bought" })).toBe(false);
  });
  it("refuses an unrecognised value by leaving it unset", () => {
    // The page never constructs a VisitFilter with a value that is not in
    // the whitelist it built from the loaded rows — this pins the contract
    // that keepVisit trusts its caller rather than re-validating: an empty
    // string on any field means "no opinion", and that is the only value an
    // unrecognised URL param can ever be turned into upstream.
    expect(keepVisit(v({ device: "desktop" }), NONE)).toBe(true);
  });
  it("narrows to a single visit by id, for the 'See the visit' deep link (I5)", () => {
    expect(keepVisit(v({ id: "abc" }), { ...NONE, visit: "abc" })).toBe(true);
    expect(keepVisit(v({ id: "abc" }), { ...NONE, visit: "def" })).toBe(false);
    // Same "no opinion" rule as every other field: an id the page's
    // whitelist rejected (not among the rows it loaded) arrives here as "",
    // which keeps everything rather than matching nothing by accident.
    expect(keepVisit(v({ id: "abc" }), NONE)).toBe(true);
  });
});
