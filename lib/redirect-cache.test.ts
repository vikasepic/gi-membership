import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The redirect rules, kept in the process so the proxy pays nothing on a
 * normal page. Spec: docs/superpowers/specs/2026-11-17-redirect-manager-design.md.
 */

const db = vi.hoisted(() => ({ settings: null as unknown, error: null as unknown, slug: "" }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: (_k: string, v: string) => ((db.slug = v), q),
        maybeSingle: async () => ({ data: db.error ? null : { redirects: db.settings }, error: db.error }),
      };
      return q;
    },
  }),
}));

const { cachedRedirectRules, clearRedirectCache, loadRedirectRules } = await import("@/lib/redirect-cache");
const { STORE_SLUG } = await import("@/lib/store-slug");

const rule = { name: "", from: "/a", to: "/b", match: "exact", permanent: true, query: "keep", enabled: true } as const;

beforeEach(() => {
  clearRedirectCache();
  db.settings = null;
  db.error = null;
});

describe("cachedRedirectRules", () => {
  it("loads once and serves from memory for 30 seconds", async () => {
    const load = vi.fn(async () => [rule]);
    await cachedRedirectRules(load, 0);
    await cachedRedirectRules(load, 29_999);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cachedRedirectRules(load, 30_000)).toEqual([rule]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("serves no rules for 5 seconds when the read fails, and never throws", async () => {
    const load = vi.fn(async () => {
      throw new Error("db down");
    });
    expect(await cachedRedirectRules(load, 0)).toEqual([]);
    await cachedRedirectRules(load, 4_999);
    expect(load).toHaveBeenCalledTimes(1);
    await cachedRedirectRules(load, 5_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("loads afresh after clearRedirectCache", async () => {
    const load = vi.fn(async () => [rule]);
    await cachedRedirectRules(load, 0);
    clearRedirectCache();
    await cachedRedirectRules(load, 1);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("two copies of this module in one process (final review, 17 Nov)", () => {
  it("clearing one clears the other, because the proxy and the save action each load their own", async () => {
    const load = vi.fn(async () => [rule]);
    await cachedRedirectRules(load, 0);
    vi.resetModules();
    const other = await import("@/lib/redirect-cache");
    other.clearRedirectCache();
    await cachedRedirectRules(load, 1);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("loadRedirectRules", () => {
  it("reads this store's rules and fills the new fields on an old one", async () => {
    db.settings = [{ from: "/o/foundation-weekend", to: "https://greaterinside.com", permanent: false }];
    expect(await loadRedirectRules()).toEqual([
      { name: "", from: "/o/foundation-weekend", to: "https://greaterinside.com", match: "exact", permanent: false, query: "keep", enabled: true },
    ]);
    expect(db.slug).toBe(STORE_SLUG);
  });

  it("is an empty list when the store has none", async () => {
    expect(await loadRedirectRules()).toEqual([]);
  });

  it("throws when the read fails, so the cache can back off", async () => {
    db.error = { message: "down" };
    await expect(loadRedirectRules()).rejects.toThrow();
  });
});
