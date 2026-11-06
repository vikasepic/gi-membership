import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A queued app email change always moves the app to where the member is NOW.
 * Replaying the queued address after a later change (or a revert) would move
 * the app somewhere Grow no longer is.
 */
const current = vi.hoisted(() => ({ email: "b@x" as string | null }));
const tellApp = vi.hoisted(() => vi.fn(async (_a: unknown, _o: string, _n: string, _c: boolean) => "changed"));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: current.email ? { email: current.email } : null }) };
    return { from: () => q };
  },
}));
vi.mock("@/lib/apps", () => ({ getAppById: async () => ({ name: "X", active: true }), notifyAppEntitlement: vi.fn() }));
vi.mock("@/lib/email-change", () => ({ tellApp, SETTLED: new Set(["changed", "already_changed", "not_found"]) }));
vi.mock("@/lib/activecampaign", () => ({ tagContact: vi.fn() }));
vi.mock("@/lib/crm", () => ({ sendCrmEvent: vi.fn() }));
vi.mock("@/lib/checkout", () => ({ fulfilBump: vi.fn() }));
vi.mock("@/lib/tracking", () => ({ trackPurchase: vi.fn() }));

const { RUNNERS } = await import("@/lib/retry");
const run = () => RUNNERS.app_email_change({ appId: "app", userId: "u1", oldEmail: "a@x", newEmail: "b@x" });

beforeEach(() => tellApp.mockClear());

describe("the app_email_change retry", () => {
  it("replays the change when the member is still on the queued address", async () => {
    current.email = "b@x";
    await run();
    expect(tellApp).toHaveBeenCalledWith(expect.anything(), "a@x", "b@x", false);
  });

  it("moves the app to the member's newer address after a second change", async () => {
    current.email = "c@x";
    await run();
    expect(tellApp).toHaveBeenCalledWith(expect.anything(), "a@x", "c@x", false);
  });

  it("does nothing once the change was reverted", async () => {
    current.email = "a@x";
    await run();
    expect(tellApp).not.toHaveBeenCalled();
  });

  it("throws while the app still refuses, so the sweep backs off", async () => {
    current.email = "b@x";
    tellApp.mockResolvedValueOnce("failed");
    await expect(run()).rejects.toThrow("X answered failed");
  });
});
