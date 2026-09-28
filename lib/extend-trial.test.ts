import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Extending a trial from the admin.
 *
 * Asked for 28 Sep 2026: a Content Engine customer's trial needed a week
 * more, on the day it ended, and there was no way to do it but by hand.
 */
vi.mock("server-only", () => ({}));
const retrieve = vi.fn();
const update = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ subscriptions: { retrieve, update } }) }));
const syncSubscription = vi.fn();
vi.mock("@/lib/subscriptions", () => ({ syncSubscription: (...a: unknown[]) => syncSubscription(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/payment-plans-stripe", () => ({ releaseSchedule: async () => {} }));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "s", getOffer: async () => null }));
vi.mock("@/lib/app-sync", () => ({ applyPendingEntitlements: async () => {}, pushAppEntitlement: async () => {} }));
vi.mock("@/lib/ac-tags", () => ({ tagAccessGranted: async () => {} }));

const { extendTrial, MAX_TRIAL_EXTENSION_DAYS } = await import("@/lib/members");

const END = Date.parse("2026-09-28T17:52:59Z") / 1000;
beforeEach(() => {
  retrieve.mockReset();
  update.mockReset();
  syncSubscription.mockReset();
});

describe("extendTrial", () => {
  it("moves the trial end by whole days in Stripe, without proration, then re-syncs our row", async () => {
    retrieve.mockResolvedValue({ status: "trialing", trial_end: END });
    const res = await extendTrial("sub_1", 7);
    expect(res).toEqual({ ok: true, trialEnd: "2026-10-05T17:52:59.000Z" });
    expect(update).toHaveBeenCalledWith("sub_1", { trial_end: END + 7 * 86_400, proration_behavior: "none" });
    expect(syncSubscription).toHaveBeenCalledWith("sub_1");
  });

  it("refuses anything not on trial, and touches nothing", async () => {
    retrieve.mockResolvedValue({ status: "active", trial_end: END });
    const res = await extendTrial("sub_1", 7);
    expect(res).toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("refuses zero, fractions, negatives and anything past the cap before calling Stripe", async () => {
    for (const d of [0, -3, 2.5, NaN, MAX_TRIAL_EXTENSION_DAYS + 1]) {
      expect(await extendTrial("sub_1", d)).toMatchObject({ ok: false });
    }
    expect(retrieve).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
