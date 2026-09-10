// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FunnelCard, Sparkline, PresetTabs } from "@/components/admin/traffic-funnel";
import type { Funnel } from "@/lib/traffic-funnel";

const PRODUCT: Funnel = {
  key: "validator",
  title: "Product Validator",
  kind: "product",
  hasUpsell: true,
  steps: [
    { label: "Saw the sales page", count: 412 },
    { label: "Reached the checkout", count: 88 },
    { label: "Saw the upsell", count: 21 },
    { label: "Bought", count: 19 },
  ],
  sources: [
    { source: "meta", hits: 300, orders: 15 },
    { source: "direct", hits: 112, orders: 4 },
  ],
  daily: [
    { day: "2026-09-03", hits: 100 },
    { day: "2026-09-04", hits: 200 },
    { day: "2026-09-05", hits: 112 },
  ],
  salesViews: 412,
};

describe("a product's funnel card", () => {
  it("names the product and every step", () => {
    const html = renderToStaticMarkup(<FunnelCard funnel={PRODUCT} />);
    expect(html).toContain("Product Validator");
    expect(html).toContain("412");
    expect(html).toContain("88");
    expect(html).toContain("21");
    expect(html).toContain("19");
  });

  it("shows a zero step rather than hiding it", () => {
    // A product with views and no sales is a real answer. A card that drops
    // the step reads as three stages and hides the thing worth knowing.
    const html = renderToStaticMarkup(
      <FunnelCard
        funnel={{ ...PRODUCT, steps: PRODUCT.steps.map((s, i) => (i === 3 ? { ...s, count: 0 } : s)) }}
      />,
    );
    expect(html).toContain("Bought");
    expect(html).toMatch(/>0</);
  });

  it("prints no percentage on the views-to-people step", () => {
    // 21 views to 19 buyers is not a 10% drop — it is two different units,
    // and the percentage is the bit somebody would quote. The two
    // views-to-views transitions above it keep theirs (79%, 76%).
    const html = renderToStaticMarkup(<FunnelCard funnel={PRODUCT} />);
    expect(html).toContain("2 fewer");
    expect(html).not.toContain("10%");
    expect(html).toContain("%");
  });

  it("shows where the traffic came from, and how many of it bought", () => {
    const html = renderToStaticMarkup(<FunnelCard funnel={PRODUCT} />);
    expect(html).toContain("meta");
    expect(html).toContain("direct");
    expect(html).toContain("15");
    expect(html).toContain("bought");
    expect(html).toContain("sales-page views · bought");
  });

  it("shows an offer's own path, not a product's", () => {
    // A later task renders this same card on a page whose own heading reads
    // /o/…; a hardcoded /p/ here would contradict the heading right above it.
    const html = renderToStaticMarkup(
      <FunnelCard funnel={{ ...PRODUCT, key: "book-writer", kind: "offer" }} />,
    );
    expect(html).toContain("/o/book-writer");
    expect(html).not.toContain("/p/");
  });
});

describe("the sparkline", () => {
  it("draws a polyline when there is a trend", () => {
    const html = renderToStaticMarkup(<Sparkline daily={PRODUCT.daily} />);
    expect(html).toContain("<svg");
    expect(html).toContain("<polyline");
  });

  it("draws nothing at all from a single day", () => {
    // Not an empty box, not a flat line — nothing. Either would assert a
    // shape the data does not have.
    const html = renderToStaticMarkup(
      <Sparkline daily={[{ day: "2026-09-05", hits: 9 }, { day: "2026-09-04", hits: 0 }]} />,
    );
    expect(html).toBe("");
  });
});

describe("the range control", () => {
  const FILTER = { kind: "all" as const, source: "", q: "", sort: "views" as const, dir: "desc" as const, preset: "30" };

  it("offers each preset as a link so a view can be sent to somebody", () => {
    const html = renderToStaticMarkup(<PresetTabs filter={FILTER} />);
    expect(html).toContain("/admin/traffic?preset=7");
    expect(html).toContain("/admin/traffic?preset=90");
    expect(html).toContain("href");
  });

  it("keeps the rest of the filter when switching windows", () => {
    // I3: PresetTabs used to build its href from the preset alone, so
    // switching 30 days -> 7 days silently cleared the sort, the type chip,
    // the source filter and the search box — on the page's most-used
    // control, resetting the rest of the screen's state on every click.
    const html = renderToStaticMarkup(
      <PresetTabs filter={{ ...FILTER, kind: "offer", sort: "drop", dir: "asc" }} />,
    );
    expect(html).toContain("preset=7");
    expect(html).toContain("kind=offer");
    expect(html).toContain("sort=drop");
    expect(html).toContain("dir=asc");
  });
});
