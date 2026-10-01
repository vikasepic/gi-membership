import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A page view from a signed-in member, posted by components/member-view-tracker.tsx
 * on every navigation. Keyed on the session, never the body: an open endpoint
 * is one somebody else can fill, so the only thing the body may choose is the path.
 */

const state = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, viewingAs: false }));
const record = vi.hoisted(() => vi.fn(async (_c: Record<string, unknown>) => {}));
vi.mock("@/lib/view-as", () => ({ viewer: async () => state.user, isViewingAs: async () => state.viewingAs }));
vi.mock("@/lib/member-activity", () => ({ recordMemberPageView: record }));

const { POST } = await import("@/app/api/track/view/route");
const post = (body: unknown) =>
  POST(new Request("https://grow.test/api/track/view", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  state.user = { id: "u1" };
  state.viewingAs = false;
  record.mockClear();
});

describe("a member's page view", () => {
  it("is written against the member, without the query string", async () => {
    const res = await post({ path: "/o/funnel-app?utm_source=x" });
    expect(await res.json()).toEqual({ ok: true, stored: true });
    expect(record).toHaveBeenCalledWith({ userId: "u1", path: "/o/funnel-app" });
  });

  it("is refused when the path is not a path", async () => {
    for (const body of [{}, { path: "https://evil.example" }, { path: "/" + "x".repeat(300) }, null]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(record).not.toHaveBeenCalled();
  });

  it("is not written for a visitor who is not signed in", async () => {
    state.user = null;
    expect(await (await post({ path: "/library" })).json()).toEqual({ ok: true, stored: false });
    expect(record).not.toHaveBeenCalled();
  });

  it("is not written in the member's name when an admin is viewing as them", async () => {
    state.viewingAs = true;
    expect(await (await post({ path: "/library" })).json()).toEqual({ ok: true, stored: false });
    expect(record).not.toHaveBeenCalled();
  });
});
