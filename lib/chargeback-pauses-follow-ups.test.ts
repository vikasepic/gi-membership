import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/**
 * A chargeback pauses the buyer's post-purchase follow-ups, the same as
 * clicking "Stop these emails" (owner's decision, 30 Sep 2026). The handler
 * is driven with a fake order; the pausing itself is tested in
 * lib/post-purchase-stop.test.ts and against the database in
 * lib/post-purchase-sequences.integration.test.ts.
 */

vi.mock("server-only", () => ({}));
const order = { id: "order-1", email: "Priya@Example.com", currency: "usd", store_id: "store-1", livemode: false };
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: order, error: null });
      return q;
    },
  }),
}));
const recordError = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => {}));
vi.mock("@/lib/errors", async (orig) => ({ ...(await orig<typeof import("@/lib/errors")>()), recordError }));
const pause = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ ok: true })));
vi.mock("@/lib/post-purchase-stop", () => ({ pauseFlowsForBuyer: pause }));

const { handleDispute } = await import("@/lib/reversals");
const dispute = { id: "dp_1", payment_intent: "pi_1", amount: 2900, currency: "usd", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_900_000_000 } } as unknown as Stripe.Dispute;
const revoke = async () => ({ revoked: 1 });

beforeEach(() => {
  pause.mockClear();
  recordError.mockClear();
});

describe("a chargeback", () => {
  it("pauses every follow-up for that buyer, as 'charged back'", async () => {
    await handleDispute(dispute, revoke);
    expect(pause).toHaveBeenCalledWith("store-1", "Priya@Example.com", "charged back");
  });

  it("still finishes, and says so on the Errors page, when the pause fails", async () => {
    pause.mockResolvedValueOnce({ ok: false });
    await expect(handleDispute(dispute, revoke)).resolves.toBeUndefined();
    expect(recordError.mock.calls.some((a) => String((a[0] as { message: string }).message).includes("could not pause"))).toBe(true);
  });
});
