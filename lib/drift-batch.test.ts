import { describe, it, expect, vi } from "vitest";

/**
 * The Errors page runs the drift check before it renders. One Stripe call at a
 * time, 123 of them, kept it blank for close to a minute (28 Sep 2026).
 */
vi.mock("server-only", () => ({}));

const ROWS = Array.from({ length: 45 }, (_, i) => ({
  id: `own-${i}`,
  user_id: "u1",
  offer_id: null,
  product_id: null,
  status: "active",
  stripe_subscription_id: `sub_${i}`,
}));
let inFlight = 0;
let peak = 0;
const retrieve = vi.fn(async (id: string) => {
  inFlight += 1;
  peak = Math.max(peak, inFlight);
  await new Promise((r) => setTimeout(r, 5));
  inFlight -= 1;
  if (id === "sub_3") throw new Error("No such subscription");
  return { status: id === "sub_7" ? "canceled" : "active" };
});
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ subscriptions: { retrieve } }) }));

function table(name: string) {
  const data = name === "ownership" ? ROWS : name === "users" ? [{ id: "u1", email: "a@b.c" }] : [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "not", "in", "eq", "is"]) b[m] = () => b;
  b.then = (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data }).then(res);
  return b;
}
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: table }) }));

const { findSubscriptionDrift } = await import("@/lib/subscription-reconcile");

describe("the drift check", () => {
  it("asks Stripe in batches, not one at a time, and still asks about every row", async () => {
    const drift = await findSubscriptionDrift();
    expect(retrieve).toHaveBeenCalledTimes(45);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(20);
    // Same answers as before: one Stripe cancelled, one Stripe cannot find.
    expect(drift.map((d) => [d.subscriptionId, d.theirs]).sort()).toEqual([
      ["sub_3", "missing"],
      ["sub_7", "canceled"],
    ]);
  });
});
