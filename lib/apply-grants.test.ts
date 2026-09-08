import { describe, it, expect } from "vitest";
import { applyGrants } from "@/lib/members";

const ok = async () => ({ ok: true as const });
const fails = (error: string) => async () => ({ ok: false as const, error });

describe("granting several things at once", () => {
  it("grants every id it is given, products and offers alike", async () => {
    const seen: string[] = [];
    const res = await applyGrants(
      { userId: "u1", ids: ["product:p1", "offer:o1", "product:p2"], grantedBy: "admin" },
      {
        grantProduct: async (a) => { seen.push(`product:${a.productId}`); return { ok: true }; },
        grantOfferAccess: async (a) => { seen.push(`offer:${a.offerId}`); return { ok: true }; },
      },
    );
    expect(seen).toEqual(["product:p1", "offer:o1", "product:p2"]);
    expect(res).toEqual({ granted: 3, failed: [] });
  });

  it("reports what failed WITHOUT losing what worked", async () => {
    // The whole point. One bad grant used to return a bare error, so two
    // successful ones went unmentioned and read as though nothing happened.
    const res = await applyGrants(
      { userId: "u1", ids: ["product:p1", "offer:o1", "product:p2"], grantedBy: "admin" },
      { grantProduct: ok, grantOfferAccess: fails("app said no") },
    );
    expect(res.granted).toBe(2);
    expect(res.failed).toEqual([{ id: "offer:o1", error: "app said no" }]);
  });

  it("keeps going after a failure rather than stopping at the first", async () => {
    const res = await applyGrants(
      { userId: "u1", ids: ["offer:o1", "product:p1"], grantedBy: "admin" },
      { grantProduct: ok, grantOfferAccess: fails("nope") },
    );
    expect(res.granted).toBe(1);
    expect(res.failed).toHaveLength(1);
  });

  it("refuses a malformed id instead of granting something arbitrary", async () => {
    const res = await applyGrants(
      { userId: "u1", ids: ["", "banana", "product:"], grantedBy: "admin" },
      { grantProduct: ok, grantOfferAccess: ok },
    );
    expect(res.granted).toBe(0);
    expect(res.failed).toHaveLength(3);
  });

  it("grants nothing when nothing was ticked", async () => {
    expect(await applyGrants({ userId: "u1", ids: [], grantedBy: "admin" }, { grantProduct: ok, grantOfferAccess: ok }))
      .toEqual({ granted: 0, failed: [] });
  });
});
