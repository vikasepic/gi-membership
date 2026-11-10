import { describe, it, expect, vi, beforeEach } from "vitest";

/** The affiliate tracker contract (docs/affiliate-tracker.md), against a mocked store and tracker. */
const s = vi.hoisted(() => ({
  order: { email: "buyer@x.test", livemode: true } as { email: string; livemode: boolean } | null,
  items: [] as { offer_id: string; amount_cents: number; offers: { key: string } | null }[],
}));
const recordError = vi.hoisted(() => vi.fn(async (_e: { message: string; jobKind?: string; jobPayload?: unknown }) => {}));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === "orders" ? s.order : null }),
        not: async () => ({ data: table === "order_items" ? s.items : [] }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/errors", () => ({ recordError, messageOf: (e: unknown) => (e instanceof Error ? e.message : String(e)) }));
vi.stubGlobal("fetch", fetchMock);

const { reportAffiliateSale, reportAffiliateRefund, TRACKER_URL } = await import("@/lib/affiliate-tracker");

const fw = { offer_id: "o-fw", amount_cents: 19700, offers: { key: "foundation-weekend" } };
const mv = { offer_id: "o-mv", amount_cents: 19700, offers: { key: "foundations-weekend-mindvalley" } };
const other = { offer_id: "o-bump", amount_cents: 2700, offers: { key: "150-product-ideas" } };
const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AFFILIATE_WEBHOOK_SECRET = "sec";
  s.order = { email: "buyer@x.test", livemode: true };
  s.items = [fw];
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ outcome: "no_match" }), { status: 200 }));
});

describe("reportAffiliateSale", () => {
  it("posts the tracker's product, the buyer, the line's charged amount and a fixed event id", async () => {
    await reportAffiliateSale("ord1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TRACKER_URL);
    expect(init.headers["x-webhook-secret"]).toBe("sec");
    expect(sent()).toEqual([
      { product_id: "prod_VTqGCl1V1x69ff", email: "buyer@x.test", amount_cents: 19700, event: "sale", event_id: "grow_ord1_o-fw" },
    ]);
  });

  it("reports the Mindvalley page as the same tracker product", async () => {
    s.items = [mv];
    await reportAffiliateSale("ord2");
    expect(sent()[0].product_id).toBe("prod_VTqGCl1V1x69ff");
  });

  it("never sends another offer's line, even one bought alongside", async () => {
    s.items = [fw, other];
    await reportAffiliateSale("ord3");
    expect(sent()).toHaveLength(1);
    s.items = [other];
    fetchMock.mockClear();
    await reportAffiliateSale("ord4");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a test-mode order and a store without the secret", async () => {
    s.order = { email: "buyer@x.test", livemode: false };
    await reportAffiliateSale("ord5");
    s.order = { email: "buyer@x.test", livemode: true };
    delete process.env.AFFILIATE_WEBHOOK_SECRET;
    await reportAffiliateSale("ord6");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues a retry with the same body on a 5xx or network error, and only logs a 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 502 }));
    await reportAffiliateSale("ord7");
    expect(recordError.mock.calls[0][0]).toMatchObject({ jobKind: "affiliate_event", jobPayload: { event_id: "grow_ord7_o-fw" } });

    recordError.mockClear();
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await reportAffiliateSale("ord8");
    expect(recordError.mock.calls[0][0].jobKind).toBe("affiliate_event");

    recordError.mockClear();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    await reportAffiliateSale("ord9");
    expect(recordError.mock.calls[0][0].jobKind).toBeUndefined();
  });
});

describe("reportAffiliateRefund", () => {
  it("sends a full refund with no amount, naming the sale it reverses", async () => {
    await reportAffiliateRefund({ orderId: "ord1", eventId: "evt_1", refundedCents: 19700 });
    expect(sent()).toEqual([
      { product_id: "prod_VTqGCl1V1x69ff", email: "buyer@x.test", event: "refund", event_id: "evt_1_o-fw", original_event_id: "grow_ord1_o-fw" },
    ]);
  });

  it("sends a partial refund with its own amount", async () => {
    await reportAffiliateRefund({ orderId: "ord1", eventId: "evt_2", refundedCents: 5000 });
    expect(sent()[0].amount_cents).toBe(5000);
  });
});
