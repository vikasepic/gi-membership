import { describe, it, expect, vi } from "vitest";

/**
 * The offer checkout hands the visitor and the request to the order.
 *
 * Seen 17 and 18 Sep 2026: two Micro-Product Builder sales from a Meta
 * campaign, each with fbc and fbp on file from the visit, reported to Meta
 * with an email hash alone — because this action passed no visitor cookie,
 * no IP and no user agent, unlike the product checkout beside it. Ads
 * Manager could attribute neither.
 */
const captured: Record<string, unknown>[] = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (k === "gi_anon" ? { value: "anon-1" } : k === "gi_utm" ? undefined : undefined),
  }),
  headers: async () => ({
    get: (k: string) =>
      ({ "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "UA/1", referer: "https://grow.test/o/x" })[k] ?? null,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
vi.mock("@/lib/checkout", () => ({ resolveBuyer: async () => ({ ok: true, userId: "u1", email: "b@e.com", isNew: true }) }));
vi.mock("@/lib/visits", () => ({ currentVisitId: async () => "visit-1" }));
vi.mock("@/lib/offer-checkout", () => ({
  startOfferCheckout: async (input: Record<string, unknown>) => {
    captured.push(input);
    return { ok: true, clientSecret: "cs", mode: "payment" };
  },
  previewOfferCoupon: async () => ({ ok: false }),
}));

const { startOffer } = await import("@/app/(store)/checkout/offer/actions");

describe("starting an offer checkout", () => {
  it("passes the visitor cookie and the buyer's own request through", async () => {
    const res = await startOffer("offer-1", { kind: "default" } as never, null, { email: "b@e.com", fullName: "B" }, "none");
    expect(res.ok).toBe(true);
    expect(captured[0]).toMatchObject({
      anonId: "anon-1",
      visitId: "visit-1",
      clientIp: "203.0.113.9",
      userAgent: "UA/1",
      sourceUrl: "https://grow.test/o/x",
      trackingConsent: true,
    });
  });
});
