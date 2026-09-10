import { describe, it, expect } from "vitest";
import {
  overviewFilterFrom,
  overviewRows,
  applyOverview,
  sourcesIn,
} from "@/lib/traffic-overview";
import type { FunnelView } from "@/lib/traffic-funnel";

const step = (label: string, count: number) => ({ label, count });
const VIEW: FunnelView = {
  funnels: [
    {
      key: "book-writer",
      title: "Book Writer",
      kind: "offer",
      steps: [step("Saw the sales page", 100), step("Reached the checkout", 20), step("Saw the upsell", 5), step("Bought", 4)],
      sources: [{ source: "meta", hits: 60 }, { source: "direct", hits: 40 }],
      daily: [{ day: "2026-09-09", hits: 100 }],
      salesViews: 100,
    },
    {
      key: "digital-product-validator",
      title: "Digital Product Validator",
      kind: "product",
      steps: [step("Saw the sales page", 40), step("Reached the checkout", 30), step("Saw the upsell", 20), step("Bought", 10)],
      sources: [{ source: "direct", hits: 40 }],
      daily: [{ day: "2026-09-09", hits: 40 }],
      salesViews: 40,
    },
  ],
  others: [{ path: "/", hits: 70, sources: [{ source: "direct", hits: 70 }] }],
  counted: 210,
};

const base = overviewFilterFrom({});

describe("every page is in one list", () => {
  it("puts funnels and other pages in the same rows", () => {
    const rows = overviewRows(VIEW);
    expect(rows.map((r) => r.title)).toEqual(["Book Writer", "Digital Product Validator", "/"]);
    expect(rows.map((r) => r.kind)).toEqual(["offer", "product", "other"]);
  });

  it("gives a funnel-less page views and no steps", () => {
    const home = overviewRows(VIEW).find((r) => r.path === "/")!;
    expect(home.steps).toEqual([70]);
    expect(home.key, "nothing to drill into").toBeNull();
    expect(home.drop).toBeNull();
  });

  it("links a funnel by its key", () => {
    expect(overviewRows(VIEW)[0]).toMatchObject({ key: "book-writer", path: "/o/book-writer" });
    expect(overviewRows(VIEW)[1].path).toBe("/p/digital-product-validator");
  });

  it("names the busiest source", () => {
    expect(overviewRows(VIEW)[0].topSource).toEqual({ source: "meta", hits: 60 });
  });
});

describe("when the order count isn't known (a source filter)", () => {
  // Same shape as VIEW's funnels, but the caller decides the steps by hand
  // so each case can put the forced 0 exactly where a source filter puts it:
  // in `Bought`, never in a real count.
  const funnel = (steps: [number, number, number, number]): FunnelView => ({
    funnels: [
      {
        key: "k",
        title: "K",
        kind: "offer",
        steps: [
          step("Saw the sales page", steps[0]),
          step("Reached the checkout", steps[1]),
          step("Saw the upsell", steps[2]),
          step("Bought", steps[3]),
        ],
        sources: [],
        daily: [],
        salesViews: steps[0],
      },
    ],
    others: [],
    counted: 0,
  });

  it("reports the real drop among the known steps, not the forced zero", () => {
    // Steps[3] is forced to 0 by the caller, same as a source-filtered
    // funnel with real upsell traffic. Unknown orders must not let that
    // absence outrank the actual 60% drop at the checkout.
    const [row] = overviewRows(funnel([500, 200, 150, 0]), false);
    expect(row.drop).toEqual({ from: 0, percent: 60 });
  });

  it("reports no drop at all when the known steps never fall", () => {
    // The only fall across all four steps is into the sale step — the one
    // step this call says it cannot see. With that step excluded, nothing
    // here actually falls, so the honest answer is no drop, not a 100% one.
    const [row] = overviewRows(funnel([300, 300, 300, 0]), false);
    expect(row.drop).toBeNull();
  });

  it("still reports a genuine 100% fall to zero sales when orders ARE known", () => {
    // Same steps as above, but this time the 0 is a real order count, not a
    // forced one — the default `ordersKnown = true` must keep reporting it.
    const [row] = overviewRows(funnel([300, 300, 300, 0]));
    expect(row.drop).toEqual({ from: 2, percent: 100 });
  });
});

describe("sorting", () => {
  const rows = overviewRows(VIEW);

  it("defaults to views, busiest first", () => {
    // "/" has 70 hits — more than the second funnel's 40 — so a genuine sort
    // must land it between them. Funnels-then-others concatenation order is
    // not a substitute for actually sorting; that gap is what let a busy
    // page with no funnel hide under fourteen cards.
    expect(applyOverview(rows, base).map((r) => r.title)).toEqual([
      "Book Writer",
      "/",
      "Digital Product Validator",
    ]);
  });

  it("puts the worst leak first, which is what the screen is for", () => {
    const sorted = applyOverview(rows, { ...base, sort: "drop", dir: "desc" });
    // Book Writer loses 80% at the checkout; the Validator's worst is 50%
    // (20 -> 10 from the upsell to the sale).
    expect(sorted[0].title).toBe("Book Writer");
  });

  it("sorts a page with no drop last, whichever direction", () => {
    // A page with no traffic is not the page that is leaking.
    for (const dir of ["asc", "desc"] as const) {
      const sorted = applyOverview(rows, { ...base, sort: "drop", dir });
      expect(sorted.at(-1)!.title).toBe("/");
    }
  });

  it("sorts by each numeric column", () => {
    expect(applyOverview(rows, { ...base, sort: "bought", dir: "desc" })[0].title).toBe(
      "Digital Product Validator",
    );
    expect(applyOverview(rows, { ...base, sort: "checkout", dir: "desc" })[0].title).toBe(
      "Digital Product Validator",
    );
  });

  it("sorts by name", () => {
    expect(applyOverview(rows, { ...base, sort: "page", dir: "asc" })[0].title).toBe("/");
  });
});

describe("filters", () => {
  const rows = overviewRows(VIEW);

  it("narrows to a kind", () => {
    expect(applyOverview(rows, { ...base, kind: "offer" }).map((r) => r.key)).toEqual(["book-writer"]);
    expect(applyOverview(rows, { ...base, kind: "other" })).toHaveLength(1);
  });

  it("matches a search on title or path, case-insensitively", () => {
    expect(applyOverview(rows, { ...base, q: "BOOK" })).toHaveLength(1);
    expect(applyOverview(rows, { ...base, q: "/p/" })).toHaveLength(1);
    expect(applyOverview(rows, { ...base, q: "nothing here" })).toHaveLength(0);
  });

  it("lists the sources present, busiest first, for the select", () => {
    expect(sourcesIn(rows)).toEqual(["direct", "meta"]);
  });
});

describe("reading the filter off the URL", () => {
  it("defaults to everything, by views, descending", () => {
    expect(overviewFilterFrom({})).toEqual({
      kind: "all",
      source: "",
      q: "",
      sort: "views",
      dir: "desc",
    });
  });

  it("takes what it knows", () => {
    expect(overviewFilterFrom({ sort: "drop", dir: "asc", kind: "offer", q: " book ", source: "meta" })).toEqual({
      kind: "offer",
      source: "meta",
      q: "book",
      sort: "drop",
      dir: "asc",
    });
  });

  it("falls back on a sort or direction it does not know", () => {
    // It selects a comparator. An unrecognised one must pick one rather than
    // render nothing.
    expect(overviewFilterFrom({ sort: "revenue" }).sort).toBe("views");
    expect(overviewFilterFrom({ dir: "sideways" }).dir).toBe("desc");
    expect(overviewFilterFrom({ kind: "app" }).kind).toBe("all");
    expect(overviewFilterFrom({ sort: ["drop", "views"] }).sort).toBe("drop");
  });
});
