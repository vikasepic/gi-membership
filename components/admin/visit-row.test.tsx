import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitRowView } from "@/components/admin/visit-row";
import type { VisitRow } from "@/lib/visit-reports";

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: "v1",
  startedAt: "2026-09-11T10:04:00Z",
  landingPath: "/p/digital-product-validator",
  landingQuery: "utm_source=meta&fbclid=IwZXBRAND",
  referrer: "https://l.facebook.com/l.php?u=abc",
  referrerHost: "l.facebook.com",
  utmFirst: { utm_source: "instaparty" },
  utmLast: { utm_source: "meta", utm_campaign: "Spring Push", utm_adset: "LAL Buyers" },
  device: "phone", browser: "Safari", os: "iOS",
  userAgent: "Mozilla/5.0 (iPhone)",
  steps: [],
  ...over,
});

const html = (v: VisitRow) =>
  renderToStaticMarkup(<table><tbody><VisitRowView visit={v} /></tbody></table>);

describe("a visit row", () => {
  it("names the landing page and where it came from", () => {
    const out = html(visit());
    expect(out).toContain("/p/digital-product-validator");
    expect(out).toContain("Spring Push");
  });

  it("shows the referrer host when there is no campaign", () => {
    const out = html(visit({ utmLast: {}, utmFirst: {} }));
    expect(out).toContain("l.facebook.com");
  });

  it("says direct when there is neither", () => {
    const out = html(visit({ utmLast: {}, utmFirst: {}, referrer: null, referrerHost: null }));
    expect(out).toContain("direct");
  });

  it("reports the furthest point the visit reached", () => {
    // money(4900, "usd") renders "$49" — lib/money.ts drops a whole-dollar
    // amount's trailing ".00" on purpose (see its own header comment), so a
    // fixture on a round number would pass even if the value never reached
    // the row. 4999 keeps its cents and actually pins the money path.
    expect(html(visit({ steps: [{ step: "purchase", at: "2026-09-11T10:09:00Z", orderId: "o1", valueCents: 4999 }] }))).toContain("$49.99");
    expect(html(visit({ steps: [{ step: "checkout", at: "2026-09-11T10:06:00Z", orderId: null, valueCents: null }] }))).toContain("checkout");
  });

  it("keeps the full link out of the row until it is asked for", () => {
    const out = html(visit());
    expect(out).not.toContain("fbclid=IwZXBRAND");
  });

  it("labels a seeded row rather than showing blank device columns", () => {
    const out = html(visit({ userAgent: null, device: null, browser: null, os: null }));
    expect(out).toContain("before visit tracking");
  });
});
