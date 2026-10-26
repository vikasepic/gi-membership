import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PurchaseRow } from "@/lib/recent-buyers";

/**
 * The public end of the recent buyers popup. Anyone can call it, so what it
 * accepts is a whitelist and what it returns is exactly what a card prints.
 */

const OFFER = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  rows: [] as PurchaseRow[],
  loads: 0,
  throws: false,
  viewer: null as string | null,
  home: "on" as "on" | "off",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/recent-buyers-data", () => ({
  loadPurchaseRows: async () => {
    state.loads += 1;
    if (state.throws) throw new Error("db down");
    return state.rows;
  },
}));
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({ recentBuyersGapSeconds: 12, recentBuyersShowSeconds: 6, recentBuyersHome: state.home }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.viewer ? { id: state.viewer } : null } }) } }),
}));

const route = await import("@/app/api/recent-buyers/route");
const { clearRecentBuyersCache } = await import("@/lib/recent-buyers-api");
const get = async (query: string) => (await route.GET(new Request(`https://x.test/api/recent-buyers${query}`))).json();

const row = (over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  orderId: "o1",
  userId: "u1",
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  username: "Priya Sharma",
  country: "IN",
  itemKind: "oto",
  offerId: OFFER,
  productId: null,
  grantProductId: null,
  itemName: "Book to Bestseller",
  imageUrl: null,
  verb: "enrolled in",
  grantProductName: null,
  grantProductImage: null,
  ...over,
});

beforeEach(() => {
  clearRecentBuyersCache();
  state.rows = [row()];
  state.loads = 0;
  state.throws = false;
  state.viewer = null;
  state.home = "on";
});

describe("GET /api/recent-buyers", () => {
  it("returns the page's cards and the timings in milliseconds", async () => {
    const body = await get(`?offer=${OFFER}`);
    expect(body.gapMs).toBe(12_000);
    expect(body.showMs).toBe(6_000);
    expect(body.cards.map((c: { firstName: string }) => c.firstName)).toEqual(["Priya"]);
  });

  it("refuses anything but one known parameter with a UUID, without reading a row", async () => {
    for (const q of ["?offer=not-a-uuid", `?offer=${OFFER}&product=${OFFER}`, "", "?everything=1"]) {
      expect((await get(q)).cards).toEqual([]);
    }
    expect(state.loads).toBe(0);
  });

  it("shows nothing on the home page when the home setting is off", async () => {
    state.home = "off";
    expect((await get("?home=1")).cards).toEqual([]);
  });

  it("reads the rows once a minute, not once a visitor", async () => {
    await get(`?offer=${OFFER}`);
    await get("?home=1");
    expect(state.loads).toBe(1);
  });

  it("leaves out the viewer's own purchase, for them only", async () => {
    state.viewer = "u1";
    expect((await get(`?offer=${OFFER}`)).cards).toEqual([]);
    state.viewer = "someone-else";
    expect((await get(`?offer=${OFFER}`)).cards).toHaveLength(1);
  });

  it("draws the flag as an SVG, and none for a code it does not know", async () => {
    state.rows = [row({ userId: "a", country: "IN" }), row({ userId: "b", orderId: "o2", country: "XX", username: "Ben Hall" })];
    const cards = (await get(`?offer=${OFFER}`)).cards as { firstName: string; flagSvg: string | null }[];
    expect(cards.find((c) => c.firstName === "Priya")?.flagSvg?.startsWith("<svg")).toBe(true);
    expect(cards.find((c) => c.firstName === "Ben")?.flagSvg).toBeNull();
  });

  it("answers with no cards, not an error, when the read fails", async () => {
    state.throws = true;
    const res = await route.GET(new Request(`https://x.test/api/recent-buyers?offer=${OFFER}`));
    expect(res.status).toBe(200);
    expect((await res.json()).cards).toEqual([]);
  });

  it("never sends an email, a user id or an order id", async () => {
    const text = JSON.stringify(await get(`?offer=${OFFER}`));
    expect(text).not.toMatch(/userId|orderId|email|u1|"o1"/);
  });
});
