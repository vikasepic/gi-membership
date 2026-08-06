import { describe, it, expect } from "vitest";
import {
  hashEmail,
  trackingMisconfigured,
  enabledProviders,
  buildMetaEvent,
  buildGa4Event,
  type PurchaseEvent,
} from "@/lib/tracking";

const event: PurchaseEvent = {
  eventId: "evt_abc123",
  eventName: "Purchase",
  email: "  Buyer@Example.COM ",
  valueCents: 2700,
  currency: "usd",
  orderId: "order-1",
  clickIds: { fbclid: "fb123", gclid: "g456" },
  clientIp: "203.0.113.9",
  userAgent: "Mozilla/5.0",
  sourceUrl: "https://grow.greaterinside.com/checkout",
  occurredAt: 1700000000,
};

describe("hashEmail", () => {
  it("normalises case and whitespace before hashing, as the ad platforms require", () => {
    // Meta/Google match on sha256 of the normalised email; "A@B.com " and
    // "a@b.com" must produce the same hash or the match rate silently drops.
    expect(hashEmail("  A@B.com ")).toBe(hashEmail("a@b.com"));
  });

  it("produces a 64-char sha256 hex digest", () => {
    expect(hashEmail("a@b.com")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never returns the raw address", () => {
    expect(hashEmail("a@b.com")).not.toContain("a@b.com");
  });
});

describe("enabledProviders", () => {
  it("reports nothing enabled when no credentials are configured", () => {
    expect(enabledProviders({})).toEqual([]);
  });

  it("enables meta only when BOTH pixel id and token are present", () => {
    expect(enabledProviders({ META_PIXEL_ID: "1" })).toEqual([]);
    expect(enabledProviders({ META_PIXEL_ID: "1", META_CAPI_TOKEN: "t" })).toEqual(["meta"]);
  });

  it("enables ga4 only when BOTH measurement id and api secret are present", () => {
    expect(enabledProviders({ GA4_MEASUREMENT_ID: "G-1" })).toEqual([]);
    expect(enabledProviders({ GA4_MEASUREMENT_ID: "G-1", GA4_API_SECRET: "s" })).toEqual(["ga4"]);
  });

  it("enables several providers at once", () => {
    expect(
      enabledProviders({
        META_PIXEL_ID: "1",
        META_CAPI_TOKEN: "t",
        GA4_MEASUREMENT_ID: "G-1",
        GA4_API_SECRET: "s",
      }),
    ).toEqual(["meta", "ga4"]);
  });
});

describe("buildMetaEvent", () => {
  const payload = buildMetaEvent(event);

  it("carries the shared event_id so browser and server events deduplicate", () => {
    expect(payload.data[0].event_id).toBe("evt_abc123");
  });

  it("sends a hashed email, never the plain address", () => {
    const um = payload.data[0].user_data;
    expect(um.em).toEqual([hashEmail("buyer@example.com")]);
    expect(JSON.stringify(payload)).not.toContain("Buyer@Example.COM");
  });

  it("passes the click id through for attribution", () => {
    expect(payload.data[0].user_data.fbc).toBe("fb123");
  });

  it("reports value in major units, not cents", () => {
    expect(payload.data[0].custom_data.value).toBe(27);
    expect(payload.data[0].custom_data.currency).toBe("USD");
  });
});

describe("buildGa4Event", () => {
  const payload = buildGa4Event(event);

  it("uses the order id as transaction_id so GA4 dedupes replays", () => {
    expect(payload.events[0].params.transaction_id).toBe("order-1");
  });

  it("reports value in major units", () => {
    expect(payload.events[0].params.value).toBe(27);
  });
});

describe("configuration that looks set but cannot work", () => {
  it("names a CAPI token with no pixel id", () => {
    // Exactly what happened: the public pixel id was set and the server one
    // was not, so the browser reported and the server silently did not.
    const issues = trackingMisconfigured({ META_CAPI_TOKEN: "tok" });
    expect(issues[0]).toContain("META_PIXEL_ID");
  });

  it("catches a GTM container id where a Measurement ID belongs", () => {
    // The Measurement Protocol answers a bad id with 204 — the same empty
    // success it gives a good event — so nothing else would ever surface it.
    const issues = trackingMisconfigured({ GA4_MEASUREMENT_ID: "GTM-NB1234", GA4_API_SECRET: "s" });
    expect(issues[0]).toContain("GTM-NB1234");
    expect(issues[0]).toContain("Data Streams");
  });

  it("refuses to send GA4 events on a container id", () => {
    expect(enabledProviders({ GA4_MEASUREMENT_ID: "GTM-NB1234", GA4_API_SECRET: "s" })).not.toContain("ga4");
    expect(enabledProviders({ GA4_MEASUREMENT_ID: "G-ABC123", GA4_API_SECRET: "s" })).toContain("ga4");
  });

  it("says nothing when nothing is configured", () => {
    // A store with no ad accounts is not misconfigured.
    expect(trackingMisconfigured({})).toEqual([]);
  });

  it("says nothing when it is all correct", () => {
    expect(
      trackingMisconfigured({
        META_PIXEL_ID: "1",
        META_CAPI_TOKEN: "t",
        GA4_MEASUREMENT_ID: "G-ABC",
        GA4_API_SECRET: "s",
      }),
    ).toEqual([]);
  });
});
