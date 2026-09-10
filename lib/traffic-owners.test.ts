import { describe, it, expect } from "vitest";
import { buildFunnels, biggestDrop, type CountRow, type FunnelOwner } from "@/lib/traffic-funnel";

const DAYS = ["2026-09-08", "2026-09-09"];
const OWNERS: FunnelOwner[] = [
  { key: "digital-product-validator", title: "Digital Product Validator", kind: "product", hasUpsell: true },
  { key: "book-writer", title: "Book Writer", kind: "offer", hasUpsell: true },
];
const hit = (over: Partial<CountRow>): CountRow => ({
  day: "2026-09-09",
  path: "/",
  source: "direct",
  product: "",
  hits: 1,
  ...over,
});

describe("an offer is a funnel like a product is", () => {
  it("builds all four steps for an offer", () => {
    const view = buildFunnels(
      [
        hit({ path: "/o/book-writer", product: "book-writer", hits: 100 }),
        hit({ path: "/checkout/offer", product: "book-writer", hits: 40 }),
        hit({ path: "/checkout/oto", product: "book-writer", hits: 10 }),
      ],
      [{ product: "book-writer", orders: 6 }],
      OWNERS,
      DAYS,
    );
    const bw = view.funnels.find((f) => f.key === "book-writer");
    expect(bw?.kind).toBe("offer");
    expect(bw?.steps.map((s) => s.count)).toEqual([100, 40, 10, 6]);
  });

  it("keeps a product's steps on its own paths", () => {
    const view = buildFunnels(
      [
        hit({ path: "/p/digital-product-validator", hits: 50 }),
        hit({ path: "/checkout", product: "digital-product-validator", hits: 20 }),
        hit({ path: "/checkout/oto", product: "digital-product-validator", hits: 5 }),
      ],
      [{ product: "digital-product-validator", orders: 3 }],
      OWNERS,
      DAYS,
    );
    const p = view.funnels.find((f) => f.key === "digital-product-validator");
    expect(p?.kind).toBe("product");
    expect(p?.steps.map((s) => s.count)).toEqual([50, 20, 5, 3]);
  });

  it("does not let an offer's checkout land on a product's funnel", () => {
    // /checkout and /checkout/offer are different steps of different funnels
    // and both carry a key in the same column.
    const view = buildFunnels(
      [hit({ path: "/checkout/offer", product: "digital-product-validator", hits: 9 })],
      [],
      OWNERS,
      DAYS,
    );
    const p = view.funnels.find((f) => f.key === "digital-product-validator");
    expect(p?.steps[1].count ?? 0).toBe(0);
  });

  it("leaves a key nothing owns in the other-pages list", () => {
    // A deleted offer's key — content-engine-monthly, 7 hits in production —
    // must not invent a funnel with three empty steps.
    const view = buildFunnels(
      [hit({ path: "/o/content-engine-monthly", product: "content-engine-monthly", hits: 7 })],
      [],
      OWNERS,
      DAYS,
    );
    expect(view.funnels.map((f) => f.key)).not.toContain("content-engine-monthly");
    expect(view.others.map((o) => o.path)).toContain("/o/content-engine-monthly");
  });

  it("counts every view towards the total, funnel or not", () => {
    const view = buildFunnels(
      [hit({ path: "/o/book-writer", product: "book-writer", hits: 3 }), hit({ path: "/", hits: 4 })],
      [],
      OWNERS,
      DAYS,
    );
    expect(view.counted).toBe(7);
  });
});

describe("when a product slug and an offer key collide", () => {
  it("lets the first owner win the key, not the last", () => {
    // A `Map` built from `[...products, ...offers]` keeps the LAST entry for
    // a duplicate key — the opposite of what page.tsx's "products first"
    // comment promises. This pins the product as the winner no matter which
    // list buildFunnels is handed last.
    const owners: FunnelOwner[] = [
      { key: "collide", title: "Collide Product", kind: "product", hasUpsell: true },
      { key: "collide", title: "Collide Offer", kind: "offer", hasUpsell: true },
    ];
    const view = buildFunnels(
      [hit({ path: "/checkout", product: "collide", hits: 12 })],
      [],
      owners,
      DAYS,
    );
    const funnel = view.funnels.find((f) => f.key === "collide");
    expect(funnel?.kind).toBe("product");
    // If the offer had won instead, this funnel would look for its checkout
    // step at `/checkout/offer`; this `/checkout` hit would match nothing,
    // and the whole funnel — not just this step — would vanish into others.
    expect(funnel?.steps[1].count).toBe(12);
  });
});

describe("the biggest drop, which the table sorts on", () => {
  const steps = (...counts: number[]) =>
    counts.map((count, i) => ({ label: ["a", "b", "c", "d"][i], count }));

  it("names the step the fall happened AT and its size", () => {
    expect(biggestDrop(steps(100, 21, 20, 19))).toEqual({ to: 1, percent: 79 });
  });

  it("picks the largest fall, not the first", () => {
    expect(biggestDrop(steps(100, 90, 9, 9))).toEqual({ to: 2, percent: 90 });
  });

  it("ignores a step that follows a zero, which is not a drop", () => {
    // 0 -> 0 is not a 100% fall; there was nobody to lose.
    expect(biggestDrop(steps(10, 0, 0, 0))).toEqual({ to: 1, percent: 100 });
  });

  it("is nothing at all when the funnel had no traffic", () => {
    // A page with no traffic is not the page that is leaking, and must sort
    // last rather than first.
    expect(biggestDrop(steps(0, 0, 0, 0))).toBeNull();
  });

  it("is nothing when no step falls", () => {
    expect(biggestDrop(steps(5, 5, 5, 5))).toBeNull();
  });
});

describe("an owner with no upsell configured", () => {
  // Reported 10 Sep 2026: every offer row read "100% at the upsell". Not one
  // of the nine active offers had an upsell configured, and no offer buyer is
  // ever sent to /checkout/oto — so the step was a structural absence being
  // read as a total loss, and 100% is the ceiling, so it won the leak sort
  // over every real problem on the screen.
  const OWNERS_NO_UPSELL: FunnelOwner[] = [
    { key: "book-writer", title: "Book Writer", kind: "offer", hasUpsell: false },
  ];
  const view = (bought: number) =>
    buildFunnels(
      [
        hit({ path: "/o/book-writer", product: "book-writer", hits: 354 }),
        hit({ path: "/checkout/offer", product: "book-writer", hits: 7 }),
      ],
      bought ? [{ product: "book-writer", orders: bought }] : [],
      OWNERS_NO_UPSELL,
      DAYS,
    );

  it("reports the upsell step as absent, not as zero", () => {
    expect(view(2).funnels[0].steps[2].count).toBeNull();
    expect(view(2).funnels[0].hasUpsell).toBe(false);
  });

  it("does not call the missing step a 100% drop", () => {
    const drop = biggestDrop(view(2).funnels[0].steps);
    expect(drop).not.toEqual({ to: 2, percent: 100 });
  });

  it("measures the fall across the gap, from checkout to the sale", () => {
    // 354 -> 7 is 98%; 7 -> 2 is 71%. The sales page is still the worst, and
    // that is the honest answer for this funnel.
    expect(biggestDrop(view(2).funnels[0].steps)).toEqual({ to: 1, percent: 98 });
  });

  it("still finds the fall to the sale when the sales page is not the worst", () => {
    const flat = buildFunnels(
      [
        hit({ path: "/o/book-writer", product: "book-writer", hits: 10 }),
        hit({ path: "/checkout/offer", product: "book-writer", hits: 10 }),
      ],
      [{ product: "book-writer", orders: 1 }],
      OWNERS_NO_UPSELL,
      DAYS,
    );
    // Nothing falls at the checkout; the only fall is checkout -> sale, and
    // the null between them must not hide it.
    expect(biggestDrop(flat.funnels[0].steps)).toEqual({ to: 3, percent: 90 });
  });

  it("leaves an owner that HAS an upsell measuring it as before", () => {
    const withUpsell = buildFunnels(
      [
        hit({ path: "/p/digital-product-validator", hits: 100 }),
        hit({ path: "/checkout", product: "digital-product-validator", hits: 50 }),
        hit({ path: "/checkout/oto", product: "digital-product-validator", hits: 40 }),
      ],
      [{ product: "digital-product-validator", orders: 10 }],
      [{ key: "digital-product-validator", title: "Validator", kind: "product", hasUpsell: true }],
      DAYS,
    );
    expect(withUpsell.funnels[0].steps.map((s) => s.count)).toEqual([100, 50, 40, 10]);
  });
});
