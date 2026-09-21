import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The Transactions page (the route is still /admin/orders).
 *
 * Source-level pins for the things that must not quietly regress: the tiles
 * are computed from the rows on screen, the filter lives in the URL, every
 * kind of movement is offered as a chip, and an empty screen says why.
 * Behaviour — kinds, totals, ranges — is covered in lib/member-money.test.ts.
 */
const src = readFileSync("app/admin/orders/page.tsx", "utf8");

describe("the page", () => {
  it("computes its figures from what is on screen", () => {
    expect(src).toContain("ledgerTotals(shown)");
    expect(src).toContain("breakdown(shown");
  });
  it("keeps the filter in the URL", () => {
    expect(src).toContain("ledgerFilterFrom(await searchParams)");
    expect(src).toContain("ledgerHref(filter");
  });
  it("offers every kind as a chip, and a live-only switch", () => {
    expect(src).toContain("LEDGER_KINDS.map(");
    expect(src).toContain("Live only");
  });
  it("tells you why the screen is empty, and offers a way out", () => {
    expect(src).toContain("Nothing in this range.");
    expect(src).toMatch(/>\s*Clear\s*</);
  });
  it("can be exported as it is filtered", () => {
    expect(src).toContain("/admin/orders/export");
  });
});
