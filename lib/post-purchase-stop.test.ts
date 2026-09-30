import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  otoSigningSecret: () => "test-signing-secret-aaaaaaaaaaaa",
  siteUrl: () => "https://grow.greaterinside.com",
}));
const stopped: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.update = () => q;
      q.eq = (_c: string, v: string) => { stopped.push(v); return q; };
      q.is = () => q;
      q.select = () => q;
      q.maybeSingle = async () => ({ data: { description: "Funnel App" } });
      q.then = (res: (v: { data: unknown }) => unknown) => Promise.resolve({ data: null }).then(res);
      return q;
    },
  }),
}));

const { stopToken, verifyStopToken, stopUrl } = await import("@/lib/post-purchase-stop");
const { GET, POST } = await import("@/app/email/stop/route");

const ITEM = "3f1e2d4c-5b6a-4789-8abc-def012345678";
beforeEach(() => (stopped.length = 0));

describe("the stop token", () => {
  it("round-trips the order line it was made for", () => {
    expect(verifyStopToken(stopToken(ITEM))).toBe(ITEM);
  });

  it("refuses an edited, truncated or missing token", () => {
    const t = stopToken(ITEM);
    const other = Buffer.from("00000000-0000-0000-0000-000000000000").toString("base64url");
    expect(verifyStopToken(`${other}.${t.split(".")[1]}`)).toBeNull();
    expect(verifyStopToken(t.slice(0, -2))).toBeNull();
    expect(verifyStopToken(null)).toBeNull();
    expect(verifyStopToken("nodot")).toBeNull();
  });

  it("builds an absolute link on the store's own address", () => {
    expect(stopUrl(ITEM)).toMatch(/^https:\/\/grow\.greaterinside\.com\/email\/stop\?t=/);
  });
});

describe("the stop page", () => {
  const req = (t: string, method = "GET") => new Request(`https://grow.greaterinside.com/email/stop?t=${t}`, { method });

  it("says it is done, names what they bought, and stops that line", async () => {
    const res = await GET(req(stopToken(ITEM)));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You won't get any more of these emails about Funnel App.");
    expect(stopped).toContain(ITEM);
  });

  it("says the same the second time, rather than an error", async () => {
    await GET(req(stopToken(ITEM)));
    const again = await GET(req(stopToken(ITEM)));
    expect(again.status).toBe(200);
  });

  it("refuses a bad link politely and stops nothing", async () => {
    const res = await GET(req("forged.token"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("This link is not valid");
    expect(stopped).toHaveLength(0);
  });

  it("accepts the one-click POST inboxes send", async () => {
    const res = await POST(req(stopToken(ITEM), "POST"));
    expect(res.status).toBe(200);
    expect(stopped).toContain(ITEM);
  });
});
