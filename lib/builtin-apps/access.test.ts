import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Where a signed-in member who does NOT own an internal app is sent.
 *
 * It used to be `/o/<app key>`, on the assumption that the offer selling an
 * app shares the app's key. In production it does not — the Micro-Product
 * Builder is sold at /o/the-micro-product-builder — so every non-owner was
 * redirected onto the 404 page. The offer is a row to look up, not a name to
 * guess; and when no offer sells the app yet, the library is a page that
 * exists and a 404 is not.
 */
const APP = {
  id: "app-mpb",
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

class Redirected extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}

function arrange(opts: { user: { id: string; email: string } | null; owned: boolean; offerKey: string | null }) {
  vi.resetModules();
  vi.doMock("next/navigation", () => ({
    redirect: (to: string) => {
      throw new Redirected(to);
    },
    notFound: () => {
      throw new Error("notFound");
    },
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: opts.user } }) } }),
    createServiceClient: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: APP }) }) }) }) }),
      }),
    }),
  }));
  vi.doMock("@/lib/library", () => ({ subscribedToApp: async () => opts.owned }));
  vi.doMock("@/lib/store", () => ({
    getStoreId: async () => "store-1",
    offerSellingApp: async (appId: string) =>
      appId === APP.id && opts.offerKey ? { key: opts.offerKey } : null,
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("next/navigation");
  vi.doUnmock("@/lib/supabase/server");
  vi.doUnmock("@/lib/library");
  vi.doUnmock("@/lib/store");
});

const me = { id: "u1", email: "m@example.com" };

describe("requireInternalApp for someone who does not own the app", () => {
  it("sends them to the offer that actually sells it, whatever its key", async () => {
    arrange({ user: me, owned: false, offerKey: "the-micro-product-builder" });
    const { requireInternalApp } = await import("@/lib/builtin-apps/access");
    await expect(requireInternalApp("micro-product-builder")).rejects.toMatchObject({
      to: "/o/the-micro-product-builder",
    });
  });

  it("sends them to the library when nothing sells it yet, never to a guessed URL", async () => {
    arrange({ user: me, owned: false, offerKey: null });
    const { requireInternalApp } = await import("@/lib/builtin-apps/access");
    await expect(requireInternalApp("micro-product-builder")).rejects.toMatchObject({ to: "/library" });
  });

  it("lets an owner straight in", async () => {
    arrange({ user: me, owned: true, offerKey: "the-micro-product-builder" });
    const { requireInternalApp } = await import("@/lib/builtin-apps/access");
    const viewer = await requireInternalApp("micro-product-builder");
    expect(viewer.user.id).toBe("u1");
    expect(viewer.app.key).toBe("micro-product-builder");
  });

  it("still sends a signed-out visitor to login with a way back", async () => {
    arrange({ user: null, owned: false, offerKey: "the-micro-product-builder" });
    const { requireInternalApp } = await import("@/lib/builtin-apps/access");
    await expect(requireInternalApp("micro-product-builder")).rejects.toMatchObject({
      to: "/login?next=%2Fapps%2Fmicro-product-builder",
    });
  });
});
