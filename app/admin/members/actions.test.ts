// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The read-only switch on a member's page (18 Nov 2026).
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

const setMemberViewer = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: async () => ({ id: "admin", email: "owner@example.test" }),
  isAdminEmail: (e: string) => e === "owner@example.test",
}));
vi.mock("@/lib/members", async (actual) => ({ ...(await actual<typeof import("@/lib/members")>()), setMemberViewer }));

const { toggleViewerAction } = await import("@/app/admin/members/actions");
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

beforeEach(() => setMemberViewer.mockClear());

describe("the read-only switch", () => {
  it("gives read-only access", async () => {
    await toggleViewerAction(form({ userId: "u1", email: "ads@example.test", makeViewer: "true" }));
    expect(setMemberViewer).toHaveBeenCalledWith("u1", true);
  });

  it("takes it away", async () => {
    await toggleViewerAction(form({ userId: "u1", email: "ads@example.test", makeViewer: "false" }));
    expect(setMemberViewer).toHaveBeenCalledWith("u1", false);
  });

  it("leaves an environment admin alone: the flag would say something the guard ignores", async () => {
    await toggleViewerAction(form({ userId: "o1", email: "owner@example.test", makeViewer: "true" }));
    expect(setMemberViewer).not.toHaveBeenCalled();
  });

  it("writes nothing without a member", async () => {
    await toggleViewerAction(form({ email: "ads@example.test", makeViewer: "true" }));
    expect(setMemberViewer).not.toHaveBeenCalled();
  });
});
