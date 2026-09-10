import { describe, it, expect } from "vitest";
import {
  buildFunnels,
  biggestDrop,
  daysInRange,
  sparklinePath,
  presetFrom,
  type CountRow,
} from "@/lib/traffic-funnel";

const NAMES = [
  { key: "validator", title: "Product Validator", kind: "product" as const, hasUpsell: true },
  { key: "carousels", title: "Viral Carousels", kind: "product" as const, hasUpsell: true },
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
    expect(view.funnels).toHaveLength(1);
    expect(view.funnels[0].steps.map((s) => s.count)).toEqual([100, 30, 12, 9]);
    expect(view.funnels[0].title).toBe("Product Validator");
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
    expect(view.funnels[0].steps.map((s) => s.count)).toEqual([40, 0, 3, 0]);
  });

  it("keeps a product that sold without a single counted view", () => {
    // A direct link, or a sale that predates the counter. Dropping it would
    // hide revenue.
    const view = buildFunnels([], [{ product: "carousels", orders: 2 }], NAMES, DAYS);
    expect(view.funnels.map((f) => f.key)).toEqual(["carousels"]);
    expect(view.funnels[0].steps[3].count).toBe(2);
  });

  it("shows nothing for a product with neither views nor orders", () => {
    expect(buildFunnels([], [], NAMES, DAYS).funnels).toEqual([]);
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
    expect(view.funnels.map((f) => f.key)).toEqual(["carousels", "validator"]);
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
    expect(view.funnels).toEqual([]);
    expect(view.others).toEqual([
      { path: "/o/funnel-app", hits: 7, sources: [{ source: "direct", hits: 7 }] },
    ]);
  });

  it("keeps the checkout rows counted before the product column existed", () => {
    // They carry product "" and belong to no funnel. They are still real
    // views; dropping them would make the page's total disagree with itself.
    const view = buildFunnels([row({ path: "/checkout", product: "", hits: 4 })], [], NAMES, DAYS);
    expect(view.funnels).toEqual([]);
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
    expect(view.funnels[0].sources).toEqual([
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
    expect(view.funnels[0].daily).toEqual([
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

describe("a source filter recomputes the funnel rather than hiding rows", () => {
  // app/admin/traffic/page.tsx answers a source filter by restricting the
  // raw counts to that source BEFORE calling buildFunnels, rather than
  // shaping every source and filtering the shaped rows afterward. These
  // fixtures are what that restricted array looks like; the tests below
  // prove buildFunnels shapes it honestly from that alone.
  const COUNTS: CountRow[] = [
    row({ path: "/p/validator", source: "meta", hits: 60 }),
    row({ path: "/p/validator", source: "direct", hits: 40 }),
    row({ path: "/checkout", product: "validator", source: "meta", hits: 15 }),
    row({ path: "/checkout", product: "validator", source: "direct", hits: 20 }),
    // meta drives carousels SECOND, behind direct — its busiest source is
    // direct, so a filter that only kept rows whose busiest source matched
    // would drop this page from a "meta" filter entirely, despite meta
    // sending it ten real views.
    row({ path: "/p/carousels", product: "carousels", source: "direct", hits: 90 }),
    row({ path: "/p/carousels", product: "carousels", source: "meta", hits: 10 }),
  ];

  it("gives a funnel step counts from one source's rows alone", () => {
    const meta = buildFunnels(COUNTS.filter((c) => c.source === "meta"), [], NAMES, DAYS);
    const validator = meta.funnels.find((f) => f.key === "validator");
    // All-source this funnel is 100/35; meta alone is 60/15 — proving the
    // steps are recomputed from meta's rows, not merely selected because
    // meta happens to be this funnel's busiest source.
    expect(validator?.steps.map((s) => s.count)).toEqual([60, 15, 0, 0]);
  });

  it("keeps a page the source drove but did not dominate", () => {
    const meta = buildFunnels(COUNTS.filter((c) => c.source === "meta"), [], NAMES, DAYS);
    const carousels = meta.funnels.find((f) => f.key === "carousels");
    expect(carousels).toBeDefined();
    expect(carousels?.steps[0].count).toBe(10);
  });

  it("has no fourth step, and none of the old cross-scope drop, once bought is []", () => {
    // C2: app/admin/traffic/page.tsx passes `[]` for bought here, not the
    // unfiltered boughtRows. A meta-only funnel with 100/90/80 views and 5
    // orders from EVERY source combined used to render "94% at the sale" by
    // dividing a meta-scoped upsell count by an all-source order count — a
    // fall that never happened in meta's own numbers, sorted to the top of
    // the column whose only job is finding the page that actually leaks.
    const views: CountRow[] = [
      row({ path: "/p/validator", hits: 100 }),
      row({ path: "/checkout", hits: 90 }),
      row({ path: "/checkout/oto", hits: 80 }),
    ];
    const buggy = buildFunnels(views, [{ product: "validator", orders: 5 }], NAMES, DAYS);
    const fixed = buildFunnels(views, [], NAMES, DAYS);
    expect(biggestDrop(buggy.funnels[0].steps)).toEqual({ to: 3, percent: 94 });

    expect(fixed.funnels[0].steps[3].count).toBe(0);
    // Whatever the fixed drop reports, it is never the old cross-scope 94% —
    // a source filter cannot produce that number honestly, so it must not
    // appear here either.
    expect(biggestDrop(fixed.funnels[0].steps)).not.toEqual({ to: 3, percent: 94 });
  });

  it("drops an owner entirely once its only reason to appear was an unfiltered order", () => {
    // The related Minor: an owner with a bought entry but no counted view
    // under this source used to still get a funnel — "0 | 0 | 0 | 2" beneath
    // a banner claiming to show this source's traffic, which the owner never
    // actually sent any of. With bought `[]`, nothing puts its key in the
    // funnel set, so it disappears instead of rendering a filtered funnel it
    // does not have. Mirrors "keeps a product that sold without a single
    // counted view" above, for the source-filtered call.
    const buggy = buildFunnels([], [{ product: "carousels", orders: 2 }], NAMES, DAYS);
    const fixed = buildFunnels([], [], NAMES, DAYS);
    expect(buggy.funnels.map((f) => f.key)).toEqual(["carousels"]);
    expect(fixed.funnels).toEqual([]);
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
