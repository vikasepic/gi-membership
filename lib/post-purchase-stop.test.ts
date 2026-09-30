import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  otoSigningSecret: () => "test-signing-secret-aaaaaaaaaaaa",
  siteUrl: () => "https://grow.greaterinside.com",
}));

type Write = { table: string; patch: unknown; filters: Record<string, unknown> };
const writes: Write[] = [];
const fail = vi.hoisted(() => ({ read: false }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let patch: unknown = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (p: unknown) => { patch = p; return q; };
      q.eq = (c: string, v: unknown) => { filters[c] = v; return q; };
      q.in = (c: string, v: unknown) => { filters[c] = v; return q; };
      q.maybeSingle = async () =>
        fail.read ? { data: null, error: { message: "boom" } } : { data: { store_id: "store-1", email: "priya@example.com" }, error: null };
      q.then = (res: (v: unknown) => unknown) => {
        writes.push({ table, patch, filters: { ...filters } });
        const data = table === "post_purchase_flows" ? [{ id: "flow-1" }, { id: "flow-2" }] : null;
        return Promise.resolve({ data, error: null }).then(res);
      };
      return q;
    },
  }),
}));

const { stopToken, verifyStopToken, stopUrl } = await import("@/lib/post-purchase-stop");
const { GET, POST } = await import("@/app/email/stop/route");

const FLOW = "3f1e2d4c-5b6a-4789-8abc-def012345678";
beforeEach(() => {
  writes.length = 0;
  fail.read = false;
});

describe("the stop token", () => {
  it("round-trips the flow it was made for", () => {
    expect(verifyStopToken(stopToken(FLOW))).toBe(FLOW);
  });

  it("refuses an edited, truncated or missing token", () => {
    const t = stopToken(FLOW);
    const other = Buffer.from("00000000-0000-0000-0000-000000000000").toString("base64url");
    expect(verifyStopToken(`${other}.${t.split(".")[1]}`)).toBeNull();
    expect(verifyStopToken(t.slice(0, -2))).toBeNull();
    expect(verifyStopToken(null)).toBeNull();
    expect(verifyStopToken("nodot")).toBeNull();
  });

  it("builds an absolute link on the store's own address", () => {
    expect(stopUrl(FLOW)).toMatch(/^https:\/\/grow\.greaterinside\.com\/email\/stop\?t=/);
  });
});

describe("the stop page", () => {
  const req = (t: string, method = "GET") => new Request(`https://grow.greaterinside.com/email/stop?t=${t}`, { method });

  it("opening the link only asks, and writes nothing", async () => {
    const t = stopToken(FLOW);
    const res = await GET(req(t));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Stop these emails? You won't get any more follow-up emails from us until you buy again.");
    expect(html).toContain(`action="/email/stop?t=${encodeURIComponent(t)}"`);
    expect(writes).toHaveLength(0);
  });

  it("the button pauses every running flow for the buyer and skips what is queued", async () => {
    const res = await POST(req(stopToken(FLOW), "POST"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Done. You won't get any more of these emails.");
    expect(writes[0]).toMatchObject({
      table: "post_purchase_flows",
      patch: expect.objectContaining({ status: "paused" }),
      filters: { store_id: "store-1", email: "priya@example.com", status: "running" },
    });
    expect(writes[1]).toMatchObject({
      table: "post_purchase_sends",
      patch: { status: "skipped", reason: "buyer stopped these emails" },
      filters: { flow_id: ["flow-1", "flow-2"], status: "pending" },
    });
  });

  it("says the same on a second click", async () => {
    await POST(req(stopToken(FLOW), "POST"));
    const again = await POST(req(stopToken(FLOW), "POST"));
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("Done.");
  });

  it("says so when the stop could not be saved", async () => {
    fail.read = true;
    const res = await POST(req(stopToken(FLOW), "POST"));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("were not stopped");
    expect(writes).toHaveLength(0);
  });

  it("refuses a bad link and stops nothing", async () => {
    for (const method of ["GET", "POST"]) {
      const res = await (method === "GET" ? GET : POST)(req("forged.token", method));
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("This link is not valid");
    }
    expect(writes).toHaveLength(0);
  });
});
