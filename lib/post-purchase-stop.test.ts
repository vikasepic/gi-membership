import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  otoSigningSecret: () => "test-signing-secret-aaaaaaaaaaaa",
  siteUrl: () => "https://grow.greaterinside.com",
}));
const stopped: string[] = [];
/** Every update issued, successful or not: a GET must issue none. */
let writes = 0;
let updateError: { error: { message: string } } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.mode = null as string | null;
      q.eqValue = null as string | null;
      q.update = () => { q.mode = "update"; writes++; return q; };
      q.eq = (_c: string, v: string) => { if (q.mode === "update") q.eqValue = v; return q; };
      q.is = () => q;
      q.select = () => q;
      q.maybeSingle = async () => ({ data: { description: "Funnel App" } });
      q.then = (res: ((v: unknown) => unknown) | null | undefined) => {
        if (q.mode === "update") {
          if (updateError) {
            if (res) return Promise.resolve(updateError).then(res);
            return Promise.resolve(updateError);
          }
          // Only push to stopped if update succeeded (no error)
          if (q.eqValue) stopped.push(q.eqValue as string);
          if (res) return Promise.resolve({ data: null }).then(res);
          return Promise.resolve({ data: null });
        }
        if (res) return Promise.resolve({ data: null }).then(res);
        return Promise.resolve({ data: null });
      };
      return q;
    },
  }),
}));

const { stopToken, verifyStopToken, stopUrl } = await import("@/lib/post-purchase-stop");
const { GET, POST } = await import("@/app/email/stop/route");

const ITEM = "3f1e2d4c-5b6a-4789-8abc-def012345678";
beforeEach(() => {
  stopped.length = 0;
  writes = 0;
  updateError = null;
});

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

  it("opening the link only asks, so a mail scanner fetching it stops nothing", async () => {
    const t = stopToken(ITEM);
    const res = await GET(req(t));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Stop the emails about Funnel App?");
    expect(html).toContain(`<form method="post" action="/email/stop?t=${encodeURIComponent(t)}"><button type="submit"`);
    expect(html).toContain(">Stop these emails</button>");
    expect(html).not.toContain("Done");
    expect(writes).toBe(0);
    expect(stopped).toHaveLength(0);
  });

  it("the button's POST says it is done, names what they bought, and stops that line", async () => {
    const res = await POST(req(stopToken(ITEM), "POST"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Done. You won't get any more of these emails about Funnel App.");
    expect(stopped).toContain(ITEM);
  });

  it("returns 500 when the update fails, tells the buyer to reply, and stops nothing", async () => {
    updateError = { error: { message: "boom" } };
    const res = await POST(req(stopToken(ITEM), "POST"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("Done");
    expect(text).toContain("were not stopped");
    expect(stopped).toHaveLength(0);
  });

  it("says the same the second time, rather than an error", async () => {
    await POST(req(stopToken(ITEM), "POST"));
    const again = await POST(req(stopToken(ITEM), "POST"));
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("Done.");
  });

  it("refuses a bad link politely and stops nothing", async () => {
    const res = await GET(req("forged.token"));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("This link is not valid");
    expect(writes).toBe(0);
  });
});
