import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NavCounts } from "@/lib/admin-nav";

const counts = (over: Partial<NavCounts> = {}): NavCounts => ({
  products: 3, courses: 3, offers: 3, orders: 9, members: 7, media: 14,
  apps: { active: 2, total: 2 }, errors: 0, ...over,
});

// Every line here is a fact the admin already held and said nowhere anyone
// looks. The panel only earns its space if all of it is actionable — put
// anything soft in it and the real ones go unread with it.

describe("what needs you", () => {
  beforeEach(() => vi.resetModules());

  it("says nothing when nothing is wrong", async () => {
    vi.doMock("@/lib/legal", () => ({ LEGAL_PLACEHOLDERS: [] }));
    vi.doMock("@/lib/tracking", () => ({ trackingProblems: () => [] }));
    const { needsYou } = await import("@/lib/needs-you");
    expect(needsYou(counts())).toEqual([]);
  });

  it("names the legal fields rather than counting them", async () => {
    // "2 legal fields" says there is work; the names say what the work is.
    vi.doMock("@/lib/legal", () => ({ LEGAL_PLACEHOLDERS: ["registered address", "governing law"] }));
    vi.doMock("@/lib/tracking", () => ({ trackingProblems: () => [] }));
    const { needsYou } = await import("@/lib/needs-you");
    const out = needsYou(counts());
    expect(out[0].label).toContain("registered address");
    expect(out[0].href).toBe("/admin/settings");
  });

  it("carries a tracking misconfiguration", async () => {
    vi.doMock("@/lib/legal", () => ({ LEGAL_PLACEHOLDERS: [] }));
    vi.doMock("@/lib/tracking", () => ({
      trackingProblems: () => ['GA4_MEASUREMENT_ID is "GTM-X" — the Measurement Protocol needs the G- id, not a container id.'],
    }));
    const { needsYou } = await import("@/lib/needs-you");
    const out = needsYou(counts());
    // Trimmed: the full explanation belongs on the page it links to.
    expect(out[0].label).toBe('GA4_MEASUREMENT_ID is "GTM-X"');
  });

  it("counts unresolved errors", async () => {
    vi.doMock("@/lib/legal", () => ({ LEGAL_PLACEHOLDERS: [] }));
    vi.doMock("@/lib/tracking", () => ({ trackingProblems: () => [] }));
    const { needsYou } = await import("@/lib/needs-you");
    expect(needsYou(counts({ errors: 1 }))[0].label).toBe("1 unresolved error");
    expect(needsYou(counts({ errors: 4 }))[0].label).toBe("4 unresolved errors");
  });

  it("notices an app that is registered and switched off", async () => {
    // The failure is silent: purchases succeed and access never arrives.
    vi.doMock("@/lib/legal", () => ({ LEGAL_PLACEHOLDERS: [] }));
    vi.doMock("@/lib/tracking", () => ({ trackingProblems: () => [] }));
    const { needsYou } = await import("@/lib/needs-you");
    const out = needsYou(counts({ apps: { active: 1, total: 2 } }));
    expect(out[0].label).toContain("switched off");
    expect(out[0].href).toBe("/admin/apps");
  });

  it("says nothing about apps when they are all on", async () => {
    vi.doMock("@/lib/legal", () => ({ LEGAL_PLACEHOLDERS: [] }));
    vi.doMock("@/lib/tracking", () => ({ trackingProblems: () => [] }));
    const { needsYou } = await import("@/lib/needs-you");
    expect(needsYou(counts({ apps: { active: 2, total: 2 } }))).toEqual([]);
  });

  it("every entry goes somewhere you can act", async () => {
    vi.doMock("@/lib/legal", () => ({ LEGAL_PLACEHOLDERS: ["governing law"] }));
    vi.doMock("@/lib/tracking", () => ({ trackingProblems: () => ["META_PIXEL_ID is not set"] }));
    const { needsYou } = await import("@/lib/needs-you");
    const out = needsYou(counts({ errors: 2, apps: { active: 0, total: 2 } }));
    expect(out.length).toBe(4);
    for (const n of out) expect(n.href.startsWith("/admin/")).toBe(true);
  });
});
