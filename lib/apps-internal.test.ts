import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * An internal app is never called.
 *
 * Every outbound push in the store — purchase, refund, subscription sync, the
 * retry runner, a manual grant, the name backfill — goes through
 * notifyAppEntitlement. An internal app has no host to call: it reads the
 * ownership row itself on its next request. So the one early return in that
 * function is the whole guarantee, and this is what holds it in place.
 */
describe("notifyAppEntitlement for an internal app", () => {
  const INTERNAL = {
    id: "app-int",
    key: "micro-product-builder",
    name: "Micro-Product Builder",
    kind: "internal",
    base_url: null,
    provision_endpoint: "/api/store/provision",
    handoff_endpoint: "/auth/store-handoff",
    shared_secret: null,
    entitlement_mapping: {},
    channels: [],
    active: true,
  };

  const stub = (row: Record<string, unknown> | null) => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
        }),
      }),
    }));
    // The retry queue must stay empty too: a queued push to an app with no
    // endpoint would fail five times and then sit in Admin → Errors forever.
    vi.doMock("@/lib/errors", () => ({
      recordError: vi.fn(async () => {
        throw new Error("recordError must not be called for an internal app");
      }),
    }));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
    vi.doUnmock("@/lib/errors");
  });

  it("reports success, fetches nothing and queues nothing", async () => {
    stub(INTERNAL);
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(String(url));
      return new Response("{}", { status: 200 });
    });
    const { notifyAppEntitlement } = await import("@/lib/apps");
    const res = await notifyAppEntitlement({
      appId: "app-int",
      email: "buyer@example.com",
      entitlementKey: "micro-product-builder",
      status: "canceled",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    expect(res).toEqual({ ok: true });
    expect(fetched).toEqual([]);
  });

  it("refuses to mint a handoff for it", async () => {
    stub(INTERNAL);
    const { buildHandoffUrl } = await import("@/lib/apps");
    expect(() =>
      buildHandoffUrl(
        {
          id: "app-int",
          key: "micro-product-builder",
          name: "Micro-Product Builder",
          kind: "internal",
          baseUrl: null,
          provisionEndpoint: "/api/store/provision",
          handoffEndpoint: "/auth/store-handoff",
          sharedSecret: null,
          entitlementMapping: {},
          channels: [],
          active: true,
        },
        { id: "u1", email: "buyer@example.com" },
      ),
    ).toThrow(/internal app/);
  });
});

describe("appForSecret", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
    vi.doUnmock("@/lib/store");
  });

  // An internal row carries a null secret. A presented header must never match
  // it, and the cheapest way to be sure is to never read the row at all.
  it("only ever reads external apps", async () => {
    const filters: [string, unknown][] = [];
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return chain;
      },
      then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: [] }),
    };
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({ from: () => chain }),
    }));
    vi.doMock("@/lib/store", () => ({ getStoreId: async () => "store-1" }));
    const { appForSecret } = await import("@/lib/app-sync");
    expect(await appForSecret("anything")).toBeNull();
    expect(filters).toContainEqual(["kind", "external"]);
    expect(filters).toContainEqual(["active", true]);
  });
});
