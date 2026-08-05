import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { buildHandoffUrl, signHandoffToken } from "@/lib/apps";

// Locks the handoff-token format documented in docs/app-bridge-contract.md.
// If this changes, the Content Machine repo's verification breaks.
describe("signHandoffToken (app bridge contract)", () => {
  const secret = "shared-secret";
  const payload = { email: "a@b.com", userId: "u1", appId: "app1", exp: 9_999_999_999 };

  it("is verifiable by recomputing HMAC-SHA256 over the base64url body", () => {
    const token = signHandoffToken(payload, secret);
    const [body, sig] = token.split(".");
    const expected = createHmac("sha256", secret).update(body).digest("base64url");
    expect(sig).toBe(expected);
    expect(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))).toEqual(payload);
  });

  it("produces a different signature under a different shared secret", () => {
    expect(signHandoffToken(payload, "s1")).not.toBe(signHandoffToken(payload, "s2"));
  });
});

describe("notifyAppEntitlement", () => {
  const ROW = {
    id: "app-1",
    key: "funnel",
    name: "Funnel App",
    base_url: "https://funnel.example",
    provision_endpoint: "/api/store/provision",
    handoff_endpoint: "/auth/store-handoff",
    shared_secret: "s3cret",
    entitlement_mapping: { funnel: "funnel" },
    active: true,
  };

  // Reset first: the module was already loaded by this file's static import,
  // so without it the dynamic import returns the cached copy still bound to the
  // real client — and the fetch the test then observes is supabase's, not ours.
  const stub = (row: Record<string, unknown> | null) => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
        }),
      }),
    }));
  };

  const call = async () => {
    const { notifyAppEntitlement } = await import("@/lib/apps");
    return notifyAppEntitlement({
      appId: "app-1",
      email: "buyer@example.com",
      entitlementKey: "funnel",
      status: "canceled",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
  });

  // An app whose provision route sits behind session middleware answers 307 to
  // a login page. Following that redirect would let the login page's 200 read
  // as a delivered entitlement — a revoke that silently never happened. Funnel
  // App did exactly this before its middleware was fixed.
  it("does not follow a redirect, and does not call it a success", async () => {
    stub(ROW);
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      seen.push(init);
      return new Response(null, { status: 307, headers: { location: "/login" } });
    });
    const res = await call();
    expect(seen[0].redirect).toBe("manual");
    expect(res).toEqual({ ok: false, status: 307 });
  });

  it("still reports a real success", async () => {
    stub(ROW);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    expect(await call()).toEqual({ ok: true, status: 200 });
  });

  it("never calls an inactive app", async () => {
    stub({ ...ROW, active: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await call()).toEqual({ ok: false, error: "app_inactive" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the name goes with the person", () => {
  // An app that only ever receives an email address creates nameless accounts.
  // That is what happened to every trial bought by someone already signed in:
  // the store knew who they were and never said.
  it("rides in the handoff token, which is what creates the session", () => {
    const app = {
      id: "a1",
      baseUrl: "https://app.example",
      handoffEndpoint: "/auth/store-handoff",
      sharedSecret: "s3cret",
    } as never;
    const url = buildHandoffUrl(app, { id: "u1", email: "buyer@example.com", fullName: "Ronit Surana" });
    const token = decodeURIComponent(url.split("token=")[1]);
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(payload.fullName).toBe("Ronit Surana");
    expect(payload.email).toBe("buyer@example.com");
  });

  it("is null rather than absent when the store does not know it", () => {
    // An explicit null is a fact the app can act on; a missing key is a
    // question about whether the field exists at all.
    const app = { id: "a1", baseUrl: "https://x", handoffEndpoint: "/h", sharedSecret: "s" } as never;
    const url = buildHandoffUrl(app, { id: "u1", email: "b@example.com" });
    const token = decodeURIComponent(url.split("token=")[1]);
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(payload).toHaveProperty("fullName", null);
  });

  it("still signs the token over everything it carries", () => {
    // The name is inside the signed body, so it cannot be edited in transit.
    const secret = "s3cret";
    const app = { id: "a1", baseUrl: "https://x", handoffEndpoint: "/h", sharedSecret: secret } as never;
    const url = buildHandoffUrl(app, { id: "u1", email: "b@example.com", fullName: "Real Name" });
    const [body, sig] = decodeURIComponent(url.split("token=")[1]).split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), fullName: "Someone Else" }),
    ).toString("base64url");
    expect(createHmac("sha256", secret).update(forged).digest("base64url")).not.toBe(sig);
  });
});
