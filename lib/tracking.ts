import "server-only";
import { createHash } from "node:crypto";

// Server-side ad tracking. Events are sent from the server (not the browser) so
// ad blockers and ITP cannot silence conversions, and so the day-7 trial
// conversion — which happens with no browser present — can still be reported.
//
// Every provider is OPTIONAL: with no credentials configured this module is a
// no-op. That is deliberate, so the store runs correctly before ad accounts
// exist, and so a tracking outage can never break a purchase.

export type PurchaseEvent = {
  eventId: string; // shared with the browser pixel for deduplication
  eventName: "Purchase" | "StartTrial" | "Subscribe";
  email: string;
  valueCents: number;
  currency: string;
  orderId: string;
  clickIds: Record<string, string>;
  clientIp?: string;
  userAgent?: string;
  sourceUrl?: string;
  occurredAt: number; // unix seconds
};

export type TrackingEnv = {
  META_PIXEL_ID?: string;
  META_CAPI_TOKEN?: string;
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
};

// Ad platforms match on sha256 of the trimmed, lowercased address. Skipping
// normalisation silently destroys match rates rather than erroring.
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function enabledProviders(env: TrackingEnv): ("meta" | "ga4")[] {
  const out: ("meta" | "ga4")[] = [];
  if (env.META_PIXEL_ID && env.META_CAPI_TOKEN) out.push("meta");
  if (env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET) out.push("ga4");
  return out;
}

const major = (cents: number) => Math.round(cents) / 100;

export function buildMetaEvent(e: PurchaseEvent) {
  return {
    data: [
      {
        event_name: e.eventName,
        event_time: e.occurredAt,
        event_id: e.eventId, // dedupes against the browser pixel
        action_source: "website" as const,
        event_source_url: e.sourceUrl,
        user_data: {
          em: [hashEmail(e.email)],
          fbc: e.clickIds.fbclid,
          client_ip_address: e.clientIp,
          client_user_agent: e.userAgent,
        },
        custom_data: {
          value: major(e.valueCents),
          currency: e.currency.toUpperCase(),
          order_id: e.orderId,
        },
      },
    ],
  };
}

export function buildGa4Event(e: PurchaseEvent) {
  return {
    client_id: e.orderId, // no browser client id server-side; order id is stable
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: e.orderId, // GA4 dedupes replays on this
          value: major(e.valueCents),
          currency: e.currency.toUpperCase(),
        },
      },
    ],
  };
}

function trackingEnv(): TrackingEnv {
  return {
    META_PIXEL_ID: process.env.META_PIXEL_ID,
    META_CAPI_TOKEN: process.env.META_CAPI_TOKEN,
    GA4_MEASUREMENT_ID: process.env.GA4_MEASUREMENT_ID,
    GA4_API_SECRET: process.env.GA4_API_SECRET,
  };
}

// Fire-and-forget. A tracking failure must NEVER surface to the buyer or roll
// back a purchase, so every error is swallowed after being logged server-side.
export async function trackPurchase(e: PurchaseEvent): Promise<void> {
  const env = trackingEnv();
  const providers = enabledProviders(env);
  if (providers.length === 0) return;

  const sends: Promise<unknown>[] = [];

  if (providers.includes("meta")) {
    sends.push(
      fetch(`https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...buildMetaEvent(e), access_token: env.META_CAPI_TOKEN }),
        signal: AbortSignal.timeout(5000),
      }),
    );
  }

  if (providers.includes("ga4")) {
    const url =
      `https://www.google-analytics.com/mp/collect` +
      `?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`;
    sends.push(
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildGa4Event(e)),
        signal: AbortSignal.timeout(5000),
      }),
    );
  }

  const results = await Promise.allSettled(sends);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[tracking] send failed:", r.reason);
    }
  }
}
