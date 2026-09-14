import { describe, it, expect, vi, beforeEach } from "vitest";

const admin = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-guard", () => ({ getAdminUser: () => admin() }));
vi.mock("@/lib/preview-token", () => ({
  verifyPreviewToken: (t: string | undefined, kind: string) => t === `ok-${kind}`,
}));

const { isDraftPreview } = await import("@/lib/draft-preview");

describe("isDraftPreview", () => {
  beforeEach(() => admin.mockReset());

  it("is off without the flag, whoever is asking", async () => {
    admin.mockResolvedValue({ id: "a" });
    expect(await isDraftPreview({})).toBe(false);
    expect(await isDraftPreview({ preview: "yes" })).toBe(false);
  });

  it("is off for a visitor who typed the flag", async () => {
    admin.mockResolvedValue(null);
    expect(await isDraftPreview({ preview: "1" })).toBe(false);
  });

  it("is on for an admin session", async () => {
    admin.mockResolvedValue({ id: "a" });
    expect(await isDraftPreview({ preview: "1" })).toBe(true);
  });

  it("is on for a valid token of the right kind, with no session", async () => {
    admin.mockResolvedValue(null);
    expect(await isDraftPreview({ preview: "1", t: "ok-oto" }, "oto")).toBe(true);
    expect(await isDraftPreview({ preview: "1", t: "ok-checkout" }, "oto")).toBe(false);
  });
});
