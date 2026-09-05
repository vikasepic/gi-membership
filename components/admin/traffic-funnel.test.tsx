// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FunnelCard, Sparkline, RangeTabs, OtherPages } from "@/components/admin/traffic-funnel";
import type { ProductFunnel } from "@/lib/traffic-funnel";

const PRODUCT: ProductFunnel = {
  slug: "validator",
  title: "Product Validator",
  steps: [
    { label: "Saw the sales page", count: 412 },
    { label: "Reached the checkout", count: 88 },
    { label: "Saw the upsell", count: 21 },
    { label: "Bought", count: 19 },
  ],
  sources: [
    { source: "meta", hits: 300 },
    { source: "direct", hits: 112 },
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
    const html = renderToStaticMarkup(<FunnelCard product={PRODUCT} />);
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
        product={{ ...PRODUCT, steps: PRODUCT.steps.map((s, i) => (i === 3 ? { ...s, count: 0 } : s)) }}
      />,
    );
    expect(html).toContain("Bought");
    expect(html).toMatch(/>0</);
  });

  it("shows where the traffic came from", () => {
    const html = renderToStaticMarkup(<FunnelCard product={PRODUCT} />);
    expect(html).toContain("meta");
    expect(html).toContain("direct");
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
  it("offers all three as links so a view can be sent to somebody", () => {
    const html = renderToStaticMarkup(<RangeTabs range={30} />);
    expect(html).toContain("/admin/traffic?range=7");
    expect(html).toContain("/admin/traffic?range=90");
    expect(html).toContain("href");
  });
});

describe("the pages outside the funnel", () => {
  it("lists them with their totals", () => {
    const html = renderToStaticMarkup(
      // Two sources summing to the total, so 7 appears only as the total —
      // one source carrying the whole 7 would let the split satisfy an
      // assertion meant for the figure at the end of the row.
      <OtherPages
        pages={[
          {
            path: "/o/funnel-app",
            hits: 7,
            sources: [
              { source: "direct", hits: 5 },
              { source: "email", hits: 2 },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain("/o/funnel-app");
    // Its own element's text, not a substring of the markup: `toContain("7")`
    // passed against a card that never rendered the total at all, because
    // `text-[0.7rem]` is in the class list.
    expect(html).toMatch(/>7</);
  });

  it("renders nothing when there are none", () => {
    expect(renderToStaticMarkup(<OtherPages pages={[]} />)).toBe("");
  });
});
