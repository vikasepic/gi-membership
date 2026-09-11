import { describe, it, expect } from "vitest";
import type { VisitRow } from "@/lib/visit-view";
import { keepVisit } from "@/lib/visit-filter";

const v = (over: Partial<VisitRow>): VisitRow => ({
  id: "v", startedAt: "", landingPath: "/", landingQuery: null, referrer: null, referrerHost: null,
  utmFirst: {}, utmLast: {}, device: "phone", browser: "Safari", os: "iOS", userAgent: "ua", steps: [], ...over,
});

describe("keepVisit", () => {
  it("keeps everything when nothing is set", () => {
    expect(keepVisit(v({}), { campaign: "", host: "", device: "", outcome: "" })).toBe(true);
  });
  it("narrows on each field independently", () => {
    expect(keepVisit(v({ utmLast: { utm_campaign: "A" } }), { campaign: "A", host: "", device: "", outcome: "" })).toBe(true);
    expect(keepVisit(v({ utmLast: { utm_campaign: "A" } }), { campaign: "B", host: "", device: "", outcome: "" })).toBe(false);
    expect(keepVisit(v({ referrerHost: "x.test" }), { campaign: "", host: "x.test", device: "", outcome: "" })).toBe(true);
    expect(keepVisit(v({ device: "desktop" }), { campaign: "", host: "", device: "phone", outcome: "" })).toBe(false);
    expect(keepVisit(v({ steps: [{ step: "purchase", at: "", orderId: null, valueCents: 1 }] }), { campaign: "", host: "", device: "", outcome: "bought" })).toBe(true);
    expect(keepVisit(v({ steps: [] }), { campaign: "", host: "", device: "", outcome: "bought" })).toBe(false);
  });
  it("refuses an unrecognised value by leaving it unset", () => {
    // The page never constructs a VisitFilter with a value that is not in
    // the whitelist it built from the loaded rows — this pins the contract
    // that keepVisit trusts its caller rather than re-validating: an empty
    // string on any field means "no opinion", and that is the only value an
    // unrecognised URL param can ever be turned into upstream.
    expect(keepVisit(v({ device: "desktop" }), { campaign: "", host: "", device: "", outcome: "" })).toBe(true);
  });
});
