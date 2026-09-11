import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignTable } from "@/components/admin/campaign-table";
import type { CampaignRow } from "@/lib/visit-reports";

const row = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  source: "meta", medium: "paid_social", campaign: "AJ Sept Push", adset: "LAL Buyers", ad: "Testimonial Reel",
  visits: 140, checkouts: 21, orders: 7, revenueCents: 34300, ...over,
});

const html = (rows: CampaignRow[]) =>
  renderToStaticMarkup(<CampaignTable rows={rows} sort="visits" dir="desc" hrefFor={() => "#"} />);

describe("the campaigns table", () => {
  it("names the campaign, its ad set and its ad", () => {
    const out = html([row()]);
    expect(out).toContain("AJ Sept Push");
    expect(out).toContain("LAL Buyers");
    expect(out).toContain("Testimonial Reel");
  });

  it("shows the money as money, not as cents", () => {
    // 34300 is a whole-dollar amount, and money() drops the trailing .00 on
    // those (lib/money.test.ts) — a non-whole amount is the only fixture that
    // can tell "money()" apart from "raw cents" here.
    expect(html([row({ revenueCents: 34355 })])).toContain("$343.55");
  });

  it("shows direct traffic as its own row rather than dropping it", () => {
    const out = html([row({ source: "direct", medium: "—", campaign: "—", adset: "—", ad: "—", orders: 2 })]);
    expect(out).toContain("direct");
  });

  it("says so plainly when there is nothing yet, rather than drawing an empty table", () => {
    const out = html([]);
    expect(out).toContain("No visits in this range");
    expect(out).not.toContain("<tbody");
  });
});
