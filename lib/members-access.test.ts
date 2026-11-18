// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * "Granted" on a member's page means an admin gave it by hand.
 *
 * The offer checkout writes ownership.source = 'grant' for every offer it
 * sells (lib/offer-checkout.ts), so the source alone marked 309 bought rows
 * as granted on 18 Nov 2026, against 25 real hand grants. A hand grant is the
 * one with granted_by set.
 */
const rows = vi.hoisted(() => ({ ownership: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const result = { data: table === "ownership" ? rows.ownership : [{ id: "p1", title: "Validator" }], error: null };
      const q: Record<string, unknown> = { select: () => q, eq: () => q, in: () => q, then: (ok: (v: unknown) => void) => ok(result) };
      return q;
    },
  }),
}));

const { accessForMember } = await import("@/lib/members");
const own = (over: Record<string, unknown>) => ({ id: "o1", product_id: "p1", app_id: null, offer_id: null, status: "active", source: "grant", granted_by: null, ...over });

describe("accessForMember: granted", () => {
  it("is false for access the offer checkout wrote, which has no granter", async () => {
    rows.ownership = [own({ source: "grant", granted_by: null })];
    expect((await accessForMember("u1"))[0].granted).toBe(false);
  });

  it("is true for access an admin gave by hand", async () => {
    rows.ownership = [own({ source: "grant", granted_by: "owner@example.test" })];
    expect((await accessForMember("u1"))[0].granted).toBe(true);
  });

  it("is false once a hand grant has been bought: the purchase overwrote the source", async () => {
    rows.ownership = [own({ source: "purchase", granted_by: "owner@example.test" })];
    expect((await accessForMember("u1"))[0].granted).toBe(false);
  });
});
