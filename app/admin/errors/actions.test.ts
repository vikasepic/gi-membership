import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A log-only row has nothing to retry, so before 23 Oct 2026 nothing could
 * ever close it: a fixed bug and an answered chargeback sat in "Unresolved"
 * and in the sidebar badge forever, beside the ones still needing someone.
 */

const calls = vi.hoisted(() => ({ update: [] as unknown[], filters: [] as [string, string, unknown][] }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/retry", () => ({ runDueJobs: async () => {} }));
vi.mock("@/lib/subscription-reconcile", () => ({ repairSubscriptionDrift: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const b = {
        update: (v: unknown) => (calls.update.push(v), b),
        eq: (c: string, v: unknown) => (calls.filters.push(["eq", c, v]), b),
        is: (c: string, v: unknown) => (calls.filters.push(["is", c, v]), Promise.resolve({ error: null })),
      };
      return b;
    },
  }),
}));

const { markHandledAction } = await import("@/app/admin/errors/actions");
const form = (id: string) => {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
};

beforeEach(() => {
  calls.update = [];
  calls.filters = [];
});

describe("marking an error handled", () => {
  it("closes that one row, and only while it is still open", async () => {
    await markHandledAction(form("e1"));
    expect(calls.update).toHaveLength(1);
    expect(typeof (calls.update[0] as { resolved_at: unknown }).resolved_at).toBe("string");
    expect(calls.filters).toEqual([
      ["eq", "id", "e1"],
      ["is", "resolved_at", null],
    ]);
  });

  it("does nothing without an id", async () => {
    await markHandledAction(form(""));
    expect(calls.update).toHaveLength(0);
  });
});
