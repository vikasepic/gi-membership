import { describe, it, expect, vi, afterEach } from "vitest";

// A missed grant self-heals — the handoff re-provisions when they open the app.
// A missed REVOKE does not: nothing brings that person back to trigger a
// correction, so they keep a product they stopped paying for and the only
// evidence is a support email that never comes.

const queued: { jobKind?: string; jobPayload?: Record<string, unknown> }[] = [];

const load = async (fetchImpl: () => Promise<Response>, active = true) => {
  queued.length = 0;
  vi.resetModules();
  vi.doMock("@/lib/errors", () => ({
    recordError: async (a: { jobKind?: string; jobPayload?: Record<string, unknown> }) => {
      queued.push(a);
    },
    messageOf: (e: unknown) => String(e),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createServiceClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "a1",
                base_url: "https://app.example",
                provision_endpoint: "/api/store/provision",
                shared_secret: "s",
                active,
                entitlement_mapping: {},
              },
            }),
          }),
        }),
      }),
    }),
  }));
  vi.stubGlobal("fetch", fetchImpl);
  const { notifyAppEntitlement } = await import("@/lib/apps");
  return notifyAppEntitlement({
    appId: "a1",
    email: "buyer@example.com",
    entitlementKey: "funnel",
    status: "canceled",
    stripeCustomerId: null,
    stripeSubscriptionId: "sub_1",
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/lib/errors");
  vi.doUnmock("@/lib/supabase/server");
});

describe("a push the app did not accept", () => {
  it("is queued for another go", async () => {
    const res = await load(async () => new Response("no", { status: 500 }));
    expect(res.ok).toBe(false);
    expect(queued).toHaveLength(1);
    expect(queued[0].jobKind).toBe("app_entitlement");
  });

  it("is queued when the app cannot be reached at all", async () => {
    await load(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(queued).toHaveLength(1);
  });

  it("carries the whole call, so the retry is a replay and not a reconstruction", async () => {
    await load(async () => new Response("no", { status: 500 }));
    expect(queued[0].jobPayload).toMatchObject({
      appId: "a1",
      email: "buyer@example.com",
      status: "canceled",
      stripeSubscriptionId: "sub_1",
    });
  });

  it("queues a redirect too — a bounce is not a delivery", async () => {
    await load(async () => new Response(null, { status: 307, headers: { location: "/login" } }));
    expect(queued).toHaveLength(1);
  });
});

describe("what is deliberately not queued", () => {
  it("a push that worked", async () => {
    const res = await load(async () => new Response("{}", { status: 200 }));
    expect(res.ok).toBe(true);
    expect(queued).toHaveLength(0);
  });

  it("an app that is switched off", async () => {
    // A decision someone made, not a delivery that failed. Retrying it forever
    // fills the queue with work that is meant not to happen.
    const res = await load(async () => new Response("{}", { status: 200 }), false);
    expect(res.error).toBe("app_inactive");
    expect(queued).toHaveLength(0);
  });
});

describe("a retry does not queue itself", () => {
  it("stays one job however many times it fails", async () => {
    // Without this, a permanently-down app adds a job every sweep: the runner
    // calls notifyAppEntitlement, that fails, that queues another one, and the
    // queue multiplies instead of backing off a single row.
    queued.length = 0;
    vi.resetModules();
    vi.doMock("@/lib/errors", () => ({
      recordError: async (a: { jobKind?: string }) => {
        queued.push(a);
      },
      messageOf: (e: unknown) => String(e),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "a1", base_url: "https://x", provision_endpoint: "/p", shared_secret: "s", active: true, entitlement_mapping: {} },
              }),
            }),
          }),
        }),
      }),
    }));
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));
    const { notifyAppEntitlement } = await import("@/lib/apps");
    const args = {
      appId: "a1",
      email: "b@example.com",
      entitlementKey: null,
      status: "canceled" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
    await notifyAppEntitlement(args, { queueOnFailure: false });
    await notifyAppEntitlement(args, { queueOnFailure: false });
    expect(queued).toHaveLength(0);
  });
});
