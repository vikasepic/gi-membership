import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * What the admin is told after pressing Refund. It said "Refunded" whatever
 * Stripe had done; it now says what Stripe did, with the refund's id, so the
 * screen can be checked against the Stripe dashboard.
 */

const result = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/orders", () => ({ refundOrder: async () => result.value }));

const { refundOrderAction } = await import("@/app/admin/orders/actions");
const form = () => {
  const fd = new FormData();
  fd.set("orderId", "o1");
  fd.set("confirm", "REFUND");
  return fd;
};

beforeEach(() => {
  result.value = {};
});

describe("the refund message", () => {
  it("names the amount and Stripe's refund id", async () => {
    result.value = { ok: true, refundId: "re_123", refundedCents: 39800, refundStatus: "succeeded", currency: "usd" };
    expect((await refundOrderAction({}, form())).ok).toBe("Refunded $398 in Stripe (re_123). Access has been withdrawn.");
  });

  it("says pending when Stripe has not finished", async () => {
    result.value = { ok: true, refundId: "re_123", refundedCents: 2900, refundStatus: "pending", currency: "usd" };
    expect((await refundOrderAction({}, form())).ok).toBe("Refund of $29 is pending in Stripe (re_123). Access has been withdrawn.");
  });

  it("a $0 order had nothing to give back, and says so", async () => {
    result.value = { ok: true };
    expect((await refundOrderAction({}, form())).ok).toBe("Nothing was charged, so nothing to refund. Access has been withdrawn.");
  });
});
