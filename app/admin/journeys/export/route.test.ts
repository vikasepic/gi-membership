// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MoneyData } from "@/lib/money-data";

/**
 * The Journeys download: one row per line, so it pivots in a spreadsheet.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

const state = vi.hoisted(() => ({ data: null as unknown, productName: "Digital Product Validator", userName: null as string | null }));
vi.mock("@/lib/admin-guard", () => ({
  requireViewer: async () => ({ user: { id: "v", email: "ads@example.test" }, role: "viewer" }),
  adminEmails: () => [],
}));
vi.mock("@/lib/money-data", () => ({ loadMoneyData: async () => state.data }));

const { GET } = await import("@/app/admin/journeys/export/route");
const get = (qs = "") => GET(new Request(`https://grow.greaterinside.com/admin/journeys/export${qs}`));

const order = (id: string, at: string, over: Record<string, unknown> = {}) => ({
  id, userId: "a", email: "a@x.test", status: "paid", totalCents: 0, currency: "usd", livemode: true, createdAt: at, updatedAt: at,
  stripeInvoiceId: null, stripePaymentIntentId: "pi", hostOfferId: null, couponCode: null,
  utmFirst: { utm_source: "meta", utm_campaign: "dpv" }, utmLast: { utm_source: "email" }, referrer: null, ...over,
});

beforeEach(() => {
  state.productName = "Digital Product Validator";
  state.userName = null;
  const build = (): MoneyData =>
    ({
      users: [{ id: "a", email: "a@x.test", name: state.userName, isAdmin: false, isViewer: false, createdAt: "2026-08-20T00:00:00Z" }],
      orders: [order("o1", "2026-10-09T10:00:00Z"), order("o2", "2026-11-13T10:00:00Z", { hostOfferId: "fw" })],
      items: [
        { orderId: "o1", kind: "product", description: "x", amountCents: 2700, offerId: null, productId: "dpv", stripeSubscriptionId: null },
        { orderId: "o2", kind: "oto", description: "x", amountCents: 19700, offerId: "fw", productId: null, stripeSubscriptionId: null },
      ],
      subscriptions: [],
      ownership: [],
      courseGrants: [],
      names: {
        offers: new Map([["fw", { name: "Foundations Weekend", contentName: null, billingType: "one_time", priceCents: 19700 }]]),
        products: new Map([["dpv", { name: state.productName, priceCents: 2700 }]]),
        apps: new Map(),
      },
      now: new Date("2026-11-18T00:00:00Z"),
    }) as unknown as MoneyData;
  Object.defineProperty(state, "data", { get: build, configurable: true });
});

describe("the Journeys download", () => {
  it("is a CSV file named for the day", async () => {
    const res = await get("?range=all");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="journeys-2026-11-18.csv"');
  });

  it("has one row per line under a fixed header", async () => {
    const rows = (await (await get()).text()).split("\n");
    expect(rows[0]).toBe("email,name,purchase_no,date,product,how,amount,currency,source_first,source_last");
    expect(rows.slice(1)).toEqual([
      '"a@x.test","","1","2026-10-09T10:00:00Z","Digital Product Validator","first","27.00","usd","meta / dpv","email"',
      '"a@x.test","","2","2026-11-13T10:00:00Z","Foundations Weekend","later","197.00","usd","meta / dpv","email"',
    ]);
  });

  it("follows the range on the page", async () => {
    // The first purchase is 40 days back.
    expect((await (await get("?range=30")).text()).split("\n")).toHaveLength(1);
    expect((await (await get("?range=90")).text()).split("\n")).toHaveLength(3);
  });

  it("treats a range it does not know as all time", async () => {
    expect(await (await get("?range=nonsense")).text()).toBe(await (await get("?range=all")).text());
  });

  it("quotes a name with a comma or a quote in it", async () => {
    state.productName = 'The "Big", Bold Validator';
    expect(await (await get()).text()).toContain('"The ""Big"", Bold Validator"');
  });

  it("will not let a cell run as a formula in a spreadsheet", async () => {
    // A member's name is whatever they typed at signup.
    state.userName = "=HYPERLINK(\"http://evil.test\")";
    state.productName = "+1 Validator";
    const text = await (await get()).text();
    expect(text).toContain('"\'=HYPERLINK(""http://evil.test"")"');
    expect(text).toContain('"\'+1 Validator"');
    expect(text).not.toMatch(/,"[=+\-@]/);
  });
});
