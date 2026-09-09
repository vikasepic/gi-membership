import { describe, it, expect } from "vitest";
import {
  buildFunnels,
  daysInRange,
  sparklinePath,
  presetFrom,
  type CountRow,
} from "@/lib/traffic-funnel";

const NAMES = [
  { slug: "validator", title: "Product Validator" },
  { slug: "carousels", title: "Viral Carousels" },
];
const DAYS = ["2026-09-03", "2026-09-04", "2026-09-05"];

function row(p: Partial<CountRow>): CountRow {
  return { day: "2026-09-05", path: "/p/validator", source: "direct", product: "validator", hits: 1, ...p };
}

describe("building the funnel", () => {
  it("walks a product through all four steps", () => {
    const view = buildFunnels(
      [
        row({ path: "/p/validator", hits: 100 }),
        row({ path: "/checkout", hits: 30 }),
        row({ path: "/checkout/oto", hits: 12 }),
      ],
      [{ product: "validator", orders: 9 }],
      NAMES,
      DAYS,
    );
    expect(view.products).toHaveLength(1);
    expect(view.products[0].steps.map((s) => s.count)).toEqual([100, 30, 12, 9]);
    expect(view.products[0].title).toBe("Product Validator");
  });

  it("renders a gap in the middle as a zero, not a missing step", () => {
    // Somebody linking straight to the checkout produces exactly this. A step
    // that disappears would make the funnel look like it has three stages.
    const view = buildFunnels(
      [row({ path: "/p/validator", hits: 40 }), row({ path: "/checkout/oto", hits: 3 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products[0].steps.map((s) => s.count)).toEqual([40, 0, 3, 0]);
  });

  it("keeps a product that sold without a single counted view", () => {
    // A direct link, or a sale that predates the counter. Dropping it would
    // hide revenue.
    const view = buildFunnels([], [{ product: "carousels", orders: 2 }], NAMES, DAYS);
    expect(view.products.map((p) => p.slug)).toEqual(["carousels"]);
    expect(view.products[0].steps[3].count).toBe(2);
  });

  it("shows nothing for a product with neither views nor orders", () => {
    expect(buildFunnels([], [], NAMES, DAYS).products).toEqual([]);
  });

  it("sorts products by sales-page views, busiest first", () => {
    const view = buildFunnels(
      [
        row({ path: "/p/validator", product: "validator", hits: 10 }),
        row({ path: "/p/carousels", product: "carousels", hits: 90 }),
      ],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products.map((p) => p.slug)).toEqual(["carousels", "validator"]);
  });

  it("keeps an offer page out of the funnel and in the other-pages list", () => {
    // /o/<key> writes its key as the product, but an offer key is not a
    // product slug and has no row in products. It must not invent a card.
    const view = buildFunnels(
      [row({ path: "/o/funnel-app", product: "funnel-app", hits: 7 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products).toEqual([]);
    expect(view.others).toEqual([
      { path: "/o/funnel-app", hits: 7, sources: [{ source: "direct", hits: 7 }] },
    ]);
  });

  it("keeps the checkout rows counted before the product column existed", () => {
    // They carry product "" and belong to no funnel. They are still real
    // views; dropping them would make the page's total disagree with itself.
    const view = buildFunnels([row({ path: "/checkout", product: "", hits: 4 })], [], NAMES, DAYS);
    expect(view.products).toEqual([]);
    expect(view.others[0]).toMatchObject({ path: "/checkout", hits: 4 });
  });

  it("splits the sales page by source, busiest first", () => {
    const view = buildFunnels(
      [
        row({ source: "direct", hits: 20 }),
        row({ source: "meta", hits: 80 }),
      ],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products[0].sources).toEqual([
      { source: "meta", hits: 80 },
      { source: "direct", hits: 20 },
    ]);
  });

  it("gives a dense daily series with the quiet days as zeros", () => {
    const view = buildFunnels(
      [row({ day: "2026-09-03", hits: 5 }), row({ day: "2026-09-05", hits: 7 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.products[0].daily).toEqual([
      { day: "2026-09-03", hits: 5 },
      { day: "2026-09-04", hits: 0 },
      { day: "2026-09-05", hits: 7 },
    ]);
  });

  it("totals every counted view, funnel or not", () => {
    const view = buildFunnels(
      [row({ hits: 10 }), row({ path: "/o/thing", product: "thing", hits: 3 })],
      [],
      NAMES,
      DAYS,
    );
    expect(view.counted).toBe(13);
  });
});

describe("the days in a range", () => {
  it("ends on today and runs back the requested number of days", () => {
    const days = daysInRange({ start: "2026-09-03", end: "2026-09-05" });
    expect(days).toEqual(["2026-09-03", "2026-09-04", "2026-09-05"]);
  });

  it("crosses a month boundary", () => {
    expect(daysInRange({ start: "2026-08-31", end: "2026-09-01" })).toEqual([
      "2026-08-31",
      "2026-09-01",
    ]);
  });
});

describe("the sparkline", () => {
  it("draws nothing from a single day of data", () => {
    // One point is not a trend, and a line drawn through it says one anyway.
    expect(sparklinePath([{ day: "a", hits: 5 }, { day: "b", hits: 0 }], 100, 20)).toBeNull();
  });

  it("draws nothing from no data at all", () => {
    expect(sparklinePath([], 100, 20)).toBeNull();
  });

  it("spans the full width and puts the peak on the top edge", () => {
    const d = sparklinePath(
      [{ day: "a", hits: 0 }, { day: "b", hits: 10 }, { day: "c", hits: 5 }],
      100,
      20,
    );
    expect(d).toBe("0,20 50,0 100,10");
  });

  it("draws an unchanging week as a flat line along its own peak", () => {
    // Normalised against the peak, as every sparkline is: the shape is what
    // it says, never the magnitude. Two flat weeks at 4 and at 400 a day draw
    // the same line, which is why the number beside it is not optional.
    const d = sparklinePath(
      [{ day: "a", hits: 4 }, { day: "b", hits: 4 }],
      100,
      20,
    );
    expect(d).toBe("0,0 100,0");
  });
});

describe("the range on the url", () => {
  it("defaults to thirty days", () => {
    expect(presetFrom({})).toBe("30");
  });

  it("takes one it recognises", () => {
    expect(presetFrom({ preset: "7" })).toBe("7");
    expect(presetFrom({ preset: "90" })).toBe("90");
  });

  it("refuses anything else", () => {
    // The value reaches a query. Anything not on the list is not a range.
    expect(presetFrom({ preset: "3650" })).toBe("30");
    expect(presetFrom({ preset: ["7", "90"] })).toBe("7");
    expect(presetFrom({ preset: "; drop table" })).toBe("30");
  });
});
