import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A member who asks not to be named in the recent buyers popup. One switch on
 * the person: it hides every purchase of theirs, past and future.
 */

const calls = vi.hoisted(() => ({ update: [] as unknown[], filters: [] as [string, unknown][] }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {}, isAdminEmail: () => false }));
vi.mock("@/lib/members", () => ({}));
vi.mock("@/lib/view-as", () => ({ setViewAsCookie: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const b = {
        update: (v: unknown) => (calls.update.push(v), b),
        eq: (c: string, v: unknown) => (calls.filters.push([c, v]), Promise.resolve({ error: null })),
      };
      return b;
    },
  }),
}));

const { toggleRecentBuyersHiddenAction } = await import("@/app/admin/members/actions");
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  calls.update = [];
  calls.filters = [];
});

describe("hiding a member from recent buyers", () => {
  it("hides one member and only that member", async () => {
    await toggleRecentBuyersHiddenAction(form({ userId: "u1", hidden: "true" }));
    expect(calls.update).toEqual([{ hide_from_recent_buyers: true }]);
    expect(calls.filters).toEqual([["id", "u1"]]);
  });

  it("shows them again", async () => {
    await toggleRecentBuyersHiddenAction(form({ userId: "u1", hidden: "false" }));
    expect(calls.update).toEqual([{ hide_from_recent_buyers: false }]);
  });

  it("does nothing without a user id", async () => {
    await toggleRecentBuyersHiddenAction(form({ hidden: "true" }));
    expect(calls.update).toHaveLength(0);
  });
});
