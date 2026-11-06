import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * An admin changes a member's email (owner, 6 Nov 2026). In place everywhere,
 * and nothing moves if any app says the new address is already someone else's.
 */
const s = vi.hoisted(() => ({
  user: { id: "u1", email: "old@x.test" } as { id: string; email: string } | null,
  taken: null as null | { id: string },
  rpcError: null as null | { message: string },
  authError: null as null | { message: string },
  customers: { orders: [{ stripe_customer_id: "cus_A" }], subscriptions: [{ stripe_customer_id: "cus_A" }, { stripe_customer_id: "cus_B" }] },
}));
const auth = vi.hoisted(() => vi.fn(async (_id: string, _attrs: Record<string, unknown>) => ({ error: s.authError })));
const rpc = vi.hoisted(() => vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ error: s.rpcError })));
const recordError = vi.hoisted(() => vi.fn(async (_e: { message: string; jobKind?: string; jobPayload?: unknown }) => {}));
const sendEmail = vi.hoisted(() => vi.fn(async (_to: string, _mail: unknown) => "sent"));
const customersUpdate = vi.hoisted(() => vi.fn(async (_id: string, _p: unknown) => ({})));
const changeContactEmail = vi.hoisted(() => vi.fn(async (_o: string, _n: string) => "changed"));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    auth: { admin: { updateUserById: auth } },
    rpc,
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        // Only this member's customers, in this key's mode (test here).
        not: () => Promise.resolve({ data: filters.user_id === "u1" && filters.livemode === false ? ((s.customers as Record<string, unknown>)[table] ?? []) : [] }),
        eq: (k: string, v: unknown) => ((filters[k] = v), q),
        maybeSingle: async () => ({ data: "id" in filters ? s.user : s.taken }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "store-1" }));
vi.mock("@/lib/admin-guard", () => ({ isAdminEmail: (e: string) => e === "owner@x.test" || e === "owner2@x.test" }));
vi.mock("@/lib/errors", () => ({ recordError }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ customers: { update: customersUpdate } }), stripeMode: () => "test" }));
vi.mock("@/lib/activecampaign", () => ({ changeContactEmail }));
vi.mock("@/lib/email", () => ({ sendEmail, buildEmailChangedEmail: () => ({ subject: "s", html: "h", text: "t" }) }));
vi.mock("@/lib/env", () => ({ siteUrl: () => "https://grow.test" }));
const app = (name: string, base: string) => ({ id: `id-${name}`, name, kind: "external", active: true, baseUrl: base, sharedSecret: "sec" });
vi.mock("@/lib/apps", () => ({
  listApps: async () => [app("CE", "https://ce"), app("Book", "https://book"), app("Funnel", "https://funnel"), { ...app("Builtin", ""), kind: "internal" }],
}));
vi.stubGlobal("fetch", fetchMock);

const { changeMemberEmail, tellApp, describeEmailChange } = await import("@/lib/email-change");

/** Per app host: [check answer, real answer] as HTTP status + result. */
let replies: Record<string, { check: [number, string?]; real?: [number, string?] }>;
const respond = (status: number, result?: string) =>
  new Response(result ? JSON.stringify({ result }) : "nope", { status });

beforeEach(() => {
  vi.clearAllMocks();
  s.user = { id: "u1", email: "old@x.test" };
  s.taken = null;
  s.rpcError = null;
  s.authError = null;
  replies = {
    "https://ce": { check: [200, "would_change"], real: [200, "changed"] },
    "https://book": { check: [404] },
    "https://funnel": { check: [200, "would_change"], real: [500] },
  };
  fetchMock.mockImplementation(async (url: string, init: { body: string }) => {
    const r = replies[url.replace("/api/store/email-change", "")];
    const { check } = JSON.parse(init.body);
    const [status, result] = check ? r.check : r.real!;
    return respond(status, result);
  });
});

describe("changeMemberEmail", () => {
  it("refuses an address another member already has, and touches nothing", async () => {
    s.taken = { id: "u2" };
    const r = await changeMemberEmail("u1", "New@X.test");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("already belongs to another member") });
    expect(auth).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an owner from ADMIN_EMAILS", async () => {
    s.user = { id: "u1", email: "owner@x.test" };
    expect((await changeMemberEmail("u1", "new@x.test")).ok).toBe(false);
    expect(auth).not.toHaveBeenCalled();
  });

  it("refuses to move anyone onto an ADMIN_EMAILS address", async () => {
    expect(await changeMemberEmail("u1", "owner2@x.test")).toEqual({ ok: false, error: expect.stringContaining("owner address") });
    expect(auth).not.toHaveBeenCalled();
  });

  it.each([
    ["already_changed", 200, "already has a different account"],
    ["no answer", 500, "did not answer"],
  ])("stops before anything moves when an app's check says %s", async (result, status, said) => {
    replies["https://ce"].check = [status as number, result === "no answer" ? undefined : (result as string)];
    expect(await changeMemberEmail("u1", "new@x.test")).toEqual({ ok: false, error: expect.stringContaining(said as string) });
    expect(auth).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops before anything moves when an app says the new address is someone else's", async () => {
    replies["https://ce"].check = [409, "email_taken"];
    const r = await changeMemberEmail("u1", "new@x.test");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("CE already has a different account") });
    expect(auth).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("changes the login, the store rows, the apps, Stripe and AC, and emails both addresses", async () => {
    const r = await changeMemberEmail("u1", " New@X.test ");
    expect(auth).toHaveBeenCalledWith("u1", { email: "new@x.test", email_confirm: true });
    expect(rpc).toHaveBeenCalledWith("change_member_email", { p_user_id: "u1", p_new: "new@x.test" });
    // The real call goes only to apps that can take it; the built-in app is never called.
    const real = fetchMock.mock.calls.filter(([, i]) => !JSON.parse(i.body).check).map(([u]) => u);
    expect(real.sort()).toEqual(["https://ce/api/store/email-change", "https://funnel/api/store/email-change"]);
    expect(customersUpdate.mock.calls.map((c) => c[0]).sort()).toEqual(["cus_A", "cus_B"]);
    expect(changeContactEmail).toHaveBeenCalledWith("old@x.test", "new@x.test");
    expect(sendEmail.mock.calls.map((c) => c[0]).sort()).toEqual(["new@x.test", "old@x.test"]);
    expect(r.ok && r.apps).toEqual([
      { name: "CE", answer: "changed" },
      { name: "Book", answer: "not_built" },
      { name: "Funnel", answer: "failed" },
    ]);
  });

  it("queues a retry for an app that failed, and logs one that has no endpoint", async () => {
    await changeMemberEmail("u1", "new@x.test");
    const funnel = recordError.mock.calls.find(([a]) => a.message.startsWith("Funnel"))![0];
    expect(funnel).toMatchObject({ jobKind: "app_email_change", jobPayload: { appId: "id-Funnel", userId: "u1", oldEmail: "old@x.test", newEmail: "new@x.test" } });
    const book = recordError.mock.calls.find(([a]) => a.message.startsWith("Book"))![0];
    expect(book.jobKind).toBeUndefined();
  });

  it("puts the login back when the store rows cannot move", async () => {
    s.rpcError = { message: "boom" };
    const r = await changeMemberEmail("u1", "new@x.test");
    expect(r.ok).toBe(false);
    expect(auth).toHaveBeenLastCalledWith("u1", { email: "old@x.test", email_confirm: true });
    const real = fetchMock.mock.calls.filter(([, i]) => !JSON.parse(i.body).check);
    expect(real).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("changes nothing when the login refuses the address", async () => {
    s.authError = { message: "email exists" };
    expect(await changeMemberEmail("u1", "new@x.test")).toEqual({ ok: false, error: expect.stringContaining("email exists") });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("tellApp", () => {
  const a = { baseUrl: "https://ce", sharedSecret: "sec" };
  it.each([
    [404, undefined, "not_built"],
    [307, undefined, "not_built"],
    [409, "email_taken", "email_taken"],
    [200, "already_changed", "already_changed"],
    [200, "something new", "failed"],
    [500, undefined, "failed"],
  ])("reads %s %s as %s", async (status, result, want) => {
    fetchMock.mockResolvedValueOnce(respond(status as number, result as string | undefined));
    expect(await tellApp(a, "o@x", "n@x", false)).toBe(want);
  });

  it("sends the secret and the contract's body", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, "would_change"));
    await tellApp(a, "o@x", "n@x", true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ce/api/store/email-change");
    expect(init.headers["x-store-secret"]).toBe("sec");
    expect(JSON.parse(init.body)).toMatchObject({ oldEmail: "o@x", newEmail: "n@x", check: true });
  });
});

describe("describeEmailChange", () => {
  it("names every app's answer, and points at Errors for what needs a person", () => {
    const line = describeEmailChange({
      ok: true,
      oldEmail: "o@x",
      newEmail: "n@x",
      apps: [{ name: "CE", answer: "changed" }, { name: "Book", answer: "not_built" }],
      stripe: { updated: 1, failed: 0 },
      activeCampaign: "both",
      mailed: "sent",
    });
    expect(line).toContain("CE: changed.");
    expect(line).toContain("Book: not updated");
    expect(line).toContain("Stripe: 1 customer updated.");
    expect(line).toContain("merge them by hand");
    expect(line).toContain("Both addresses were emailed.");
    expect(describeEmailChange({ ok: true, oldEmail: "o", newEmail: "n", apps: [], stripe: { updated: 0, failed: 0 }, activeCampaign: "none", mailed: "disabled" })).toContain("Email is not set up here");
  });
});
