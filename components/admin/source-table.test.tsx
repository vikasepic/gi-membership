import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceTable } from "@/components/admin/source-table";
import type { SourceRow } from "@/lib/visit-reports";

// Orders and visits disagree on purpose: facebook wins on visits, direct wins
// on orders. A component that ignored `rank` and always sorted by visits
// would still pass a fixture where the two rankings agree — this one cannot.
const rows: SourceRow[] = [
  { key: "l.facebook.com", visits: 120, orders: 2, revenueCents: 4999 },
  { key: "direct", visits: 80, orders: 6, revenueCents: 19600 },
  { key: "news.ycombinator.com", visits: 12, orders: 0, revenueCents: 0 },
];

const html = (rank: "visits" | "orders") =>
  renderToStaticMarkup(<SourceTable title="Referrers" nameHeader="Site" rows={rows} rank={rank} />);

describe("the source table", () => {
  it("ranks by visits, busiest first", () => {
    const out = html("visits");
    expect(out.indexOf("l.facebook.com")).toBeLessThan(out.indexOf("direct"));
    expect(out.indexOf("direct")).toBeLessThan(out.indexOf("news.ycombinator.com"));
  });

  it("re-ranks by orders when asked, which is a different order", () => {
    const out = html("orders");
    expect(out.indexOf("direct")).toBeLessThan(out.indexOf("l.facebook.com"));
    expect(out.indexOf("l.facebook.com")).toBeLessThan(out.indexOf("news.ycombinator.com"));
  });

  it("shows revenue as money and keeps direct as a row", () => {
    // 4999 keeps its cents; a whole-dollar fixture (lib/money.ts drops the
    // trailing .00) would pass even if money() were never called.
    const out = html("visits");
    expect(out).toContain("$49.99");
    expect(out).toContain("direct");
  });

  it("says so when empty", () => {
    const out = renderToStaticMarkup(<SourceTable title="Referrers" nameHeader="Site" rows={[]} rank="visits" />);
    expect(out).toContain("Nothing yet");
  });
});
