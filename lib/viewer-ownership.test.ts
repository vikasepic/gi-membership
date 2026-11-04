import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * While an admin views the store as a member, the store shows what that member
 * owns (owner, 4 Nov 2026). viewerOwnership read the signed-in admin instead,
 * so the home page and product pages showed the admin's purchases under the
 * member's "Viewing as" banner: hardy92 looked like he had not bought the
 * Digital Product Validator and did own the Micro-Product Builder, which were
 * the admin's own holdings.
 */
const who = vi.hoisted(() => ({ viewer: null as null | { id: string; email: string | null; viewingAs: boolean } }));
const ownershipFor = vi.hoisted(() =>
  vi.fn(async (id: string) => ({ productIds: new Set([`owned-by-${id}`]), appIds: new Set<string>(), appChannels: new Map() })),
);

vi.mock("@/lib/view-as", () => ({
  viewer: async () => (who.viewer ? { ...who.viewer, actingAdminId: who.viewer.viewingAs ? "admin-1" : null, name: null } : null),
}));
vi.mock("@/lib/checkout", () => ({ ownershipFor }));
// The admin who is actually signed in. The old code read this directly.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "admin-1", email: "admin@x.test" } } }) } }),
  createServiceClient: () => ({}),
}));

const { viewerOwnership } = await import("@/lib/library");

beforeEach(() => ownershipFor.mockClear());

describe("viewerOwnership", () => {
  it("is the member's ownership while an admin views as them", async () => {
    who.viewer = { id: "member-1", email: "hardy@x.test", viewingAs: true };
    const o = await viewerOwnership();
    expect(ownershipFor).toHaveBeenCalledWith("member-1");
    expect([...o.productIds]).toEqual(["owned-by-member-1"]);
  });

  it("is the signed-in person's own ownership otherwise", async () => {
    who.viewer = { id: "admin-1", email: "admin@x.test", viewingAs: false };
    expect([...(await viewerOwnership()).productIds]).toEqual(["owned-by-admin-1"]);
  });

  it("is empty, with no query, for someone not signed in", async () => {
    who.viewer = null;
    const o = await viewerOwnership();
    expect(o.productIds.size).toBe(0);
    expect(ownershipFor).not.toHaveBeenCalled();
  });
});
