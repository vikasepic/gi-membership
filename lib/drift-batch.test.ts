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
  if (id === "sub_3") throw stripeError("resource_missing", 404, "No such subscription: 'sub_3'");
  // Stripe turning the burst away, the first time only (23 Oct 2026).
  if (id === "sub_9" && !limited.has(id)) {
    limited.add(id);
    throw stripeError("rate_limit", 429, "Request rate limit exceeded");
  }
  // Never answers at all.
  if (id === "sub_11") throw stripeError(undefined, 500, "An error occurred with our connection to Stripe");
  return { status: id === "sub_7" ? "canceled" : "active" };
});
const limited = new Set<string>();
function stripeError(code: string | undefined, statusCode: number, message: string) {
  return Object.assign(new Error(message), { code, statusCode });
}
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
    const { drift } = await findSubscriptionDrift();
    expect(retrieve.mock.calls.length).toBeGreaterThanOrEqual(45);
    expect(new Set(retrieve.mock.calls.map((c) => c[0])).size).toBe(45);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(20);
    // Same answers as before: one Stripe cancelled, one Stripe cannot find.
    expect(drift.map((d) => [d.subscriptionId, d.theirs]).sort()).toEqual([
      ["sub_3", "missing"],
      ["sub_7", "canceled"],
    ]);
  });

  it("calls a subscription missing only when Stripe says it has no such thing", async () => {
    // Every error used to read "missing". A rate limit turned live, paying
    // subscriptions into a page of "Stripe missing" (23 Oct 2026), and the
    // answer to a burst being refused is to ask again, not to report it.
    retrieve.mockClear();
    limited.clear();
    const { drift } = await findSubscriptionDrift();
    expect(drift.find((d) => d.subscriptionId === "sub_9")).toBeUndefined();
    expect(retrieve.mock.calls.filter((c) => c[0] === "sub_9")).toHaveLength(2);
    expect(drift.find((d) => d.subscriptionId === "sub_3")?.theirs).toBe("missing");
  });

  it("reports what Stripe would not answer as unchecked, never as drift", async () => {
    const { drift, unchecked } = await findSubscriptionDrift();
    expect(drift.find((d) => d.subscriptionId === "sub_11")).toBeUndefined();
    expect(unchecked).toEqual([
      { subscriptionId: "sub_11", error: "An error occurred with our connection to Stripe" },
    ]);
  });
});
