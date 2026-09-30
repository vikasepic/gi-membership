import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isAppBilledOrder } from "@/lib/app-billed";

/**
 * Decided 30 Sep 2026: what a connected app billed itself stays with that app.
 * The renewal recorder had booked two of the Funnel App's own $29 charges as
 * Grow orders for one member (12 Aug, 12 Sep).
 */
describe("an order that is a connected app's own charge", () => {
  it("is every line a renewal with no Grow offer or product", () => {
    expect(isAppBilledOrder([{ kind: "renewal", offerId: null, productId: null }])).toBe(true);
  });

  it("is not a Grow renewal, a Grow sale, or an empty order", () => {
    expect(isAppBilledOrder([{ kind: "renewal", offerId: "ce", productId: null }])).toBe(false);
    expect(isAppBilledOrder([{ kind: "product", offerId: null, productId: "dpv" }])).toBe(false);
    expect(isAppBilledOrder([{ kind: "renewal", offerId: null, productId: null }, { kind: "oto", offerId: "fa", productId: null }])).toBe(false);
    expect(isAppBilledOrder([])).toBe(false);
  });
});

describe("where it is left out", () => {
  it("the money screens, the dashboard total and the member's own purchases", () => {
    for (const f of ["lib/money-data.ts", "lib/admin-nav.ts", "lib/receipts.ts"]) {
      expect(readFileSync(f, "utf8")).toContain("isAppBilledOrder(");
    }
  });

  it("the renewal recorder no longer books one", () => {
    const src = readFileSync("lib/renewals.ts", "utf8");
    expect(src).toContain("if (!own.offer_id && !own.product_id) return null;");
  });
});
