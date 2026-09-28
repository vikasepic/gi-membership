import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Two things found on the Errors page, 28 Sep 2026.
 *
 * A buyer who paid with Link was refused the one-click upsell ("no saved card
 * on customer"): the lookup only ever asked Stripe for cards. And the sidebar
 * badge counted every error ever logged, so it said 4 with one left open.
 */
vi.mock("server-only", () => ({}));
const list = vi.fn();
const retrieveCustomer = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({ paymentMethods: { list }, customers: { retrieve: retrieveCustomer } }),
}));

// A query builder that remembers every filter applied to it.
const filters: string[][] = [];
function builder(table: string) {
  const seen = [table];
  filters.push(seen);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "in", "order", "limit"]) {
    b[m] = (...a: unknown[]) => {
      seen.push(`${m}:${a.map(String).join(",")}`);
      return b;
    };
  }
  b.then = (res: (v: { count: number; data: unknown[] }) => unknown) => Promise.resolve({ count: 1, data: [] }).then(res);
  return b;
}
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: builder }) }));
vi.mock("@/lib/store", async (orig) => ({ ...(await orig<object>()), getStoreId: async () => "store-1" }));

const { savedPaymentMethodFor } = await import("@/lib/checkout");
const { navCounts } = await import("@/lib/admin-nav");

beforeEach(() => {
  list.mockReset();
  retrieveCustomer.mockReset();
  retrieveCustomer.mockResolvedValue({ deleted: false, invoice_settings: { default_payment_method: null } });
});

describe("the method a one-click upsell charges", () => {
  it("finds a saved Link method when there is no card", async () => {
    list.mockImplementation(async ({ type }: { type: string }) => ({ data: type === "link" ? [{ id: "pm_link" }] : [] }));
    expect(await savedPaymentMethodFor("cus_1")).toBe("pm_link");
  });

  it("still prefers a card, and does not ask for Link when one is there", async () => {
    list.mockImplementation(async ({ type }: { type: string }) => ({ data: [{ id: `pm_${type}` }] }));
    expect(await savedPaymentMethodFor("cus_1")).toBe("pm_card");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("uses the customer's default before either", async () => {
    retrieveCustomer.mockResolvedValue({ deleted: false, invoice_settings: { default_payment_method: "pm_default" } });
    expect(await savedPaymentMethodFor("cus_1")).toBe("pm_default");
    expect(list).not.toHaveBeenCalled();
  });

  it("is null when nothing chargeable is saved", async () => {
    list.mockResolvedValue({ data: [] });
    expect(await savedPaymentMethodFor("cus_1")).toBeNull();
  });
});

describe("the Errors badge", () => {
  it("counts only errors nobody has resolved", async () => {
    filters.length = 0;
    await navCounts();
    const errorQueries = filters.filter((f) => f[0] === "error_events");
    expect(errorQueries).toHaveLength(1);
    expect(errorQueries[0]).toContain("is:resolved_at,null");
  });
});
