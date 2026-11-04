import { describe, it, expect, vi } from "vitest";

/**
 * listSubscriptions reads every row. PostgREST stops at 1000 without saying
 * so, and newest-first ordering means the oldest subscriptions, with their
 * renewals and endings, would vanish from the Subscriptions page (review,
 * 4 Nov 2026).
 */
const TOTAL = 1003;
const pages = vi.hoisted(() => ({ asked: [] as [number, number][] }));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "store-1" }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      let window: [number, number] = [0, 999];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "or", "order"]) q[m] = () => q;
      q.range = (from: number, to: number) => {
        window = [from, to];
        pages.asked.push(window);
        return q;
      };
      q.then = (ok: (r: unknown) => unknown) => {
        // Like PostgREST: a page is at most 1000 rows, whatever was asked.
        const [from, to] = window;
        const rows = Array.from({ length: Math.max(0, Math.min(to, TOTAL - 1, from + 999) - from + 1) }, (_, i) => ({
          id: `r${from + i}`,
          stripe_subscription_id: `sub_${from + i}`,
          status: "active",
          started_at: "2026-01-01T00:00:00Z",
        }));
        return Promise.resolve({ data: rows, error: null }).then(ok);
      };
      return q;
    },
  }),
}));

const { listSubscriptions } = await import("@/lib/subscriptions");

describe("listSubscriptions", () => {
  it("reads past PostgREST's 1000 rows", async () => {
    expect(await listSubscriptions()).toHaveLength(TOTAL);
  });
});
