import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The library card's link. It used to charge the saved card on one tap; now
 * it only records the click and sends the member to the offer's own page,
 * where the checkout is the same as anyone else's. No charge can start here.
 */

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  viewingAs: false,
  offer: { id: "o1", key: "funnel-app" } as { id: string; key: string } | null,
}));
const record = vi.hoisted(() => vi.fn(async (_c: Record<string, unknown>) => {}));

vi.mock("@/lib/view-as", () => ({ viewer: async () => state.user, isViewingAs: async () => state.viewingAs }));
vi.mock("@/lib/store", () => ({ getOffer: async (id: string) => (state.offer?.id === id ? state.offer : null) }));
vi.mock("@/lib/offer-link", () => ({ offerHref: async (o: { key: string }) => `/o/${o.key}` }));
vi.mock("@/lib/member-activity", () => ({ recordOfferClick: record }));

const { GET } = await import("@/app/(store)/library/offer/[id]/route");

const get = (id: string) =>
  GET(new Request(`https://grow.test/library/offer/${id}`, { headers: { "user-agent": "UA test" } }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  state.user = { id: "u1" };
  state.viewingAs = false;
  state.offer = { id: "o1", key: "funnel-app" };
  record.mockClear();
});

describe("clicking the library offer", () => {
  it("records the click and sends the member to the offer's page", async () => {
    const res = await get("o1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://grow.test/o/funnel-app");
    expect(record).toHaveBeenCalledWith({ userId: "u1", offerId: "o1", userAgent: "UA test" });
  });

  it("asks a signed-out visitor to sign in, and records nothing", async () => {
    state.user = null;
    const res = await get("o1");
    expect(res.headers.get("location")).toBe("https://grow.test/login");
    expect(record).not.toHaveBeenCalled();
  });

  it("goes back to the library for an offer that no longer exists", async () => {
    const res = await get("gone");
    expect(res.headers.get("location")).toBe("https://grow.test/library");
    expect(record).not.toHaveBeenCalled();
  });

  it("lets an admin viewing as the member through, but not in the member's name", async () => {
    state.viewingAs = true;
    const res = await get("o1");
    expect(res.headers.get("location")).toBe("https://grow.test/o/funnel-app");
    expect(record).not.toHaveBeenCalled();
  });
});
