import "server-only";
import { createHash } from "node:crypto";
import { GA4_NAME, NO_VALUE, type EventName } from "@/lib/analytics/events";
import { compact, countryHash, fbcFrom, fbpFrom, hashed, nameParts } from "@/lib/tracking-fields";
import { recordError } from "@/lib/errors";

// Server-side ad tracking. Events are sent from the server (not the browser) so
// ad blockers and ITP cannot silence conversions, and so the day-7 trial
// conversion — which happens with no browser present — can still be reported.
//
// Every provider is OPTIONAL: with no credentials configured this module is a
// no-op. That is deliberate, so the store runs correctly before ad accounts
// exist, and so a tracking outage can never break a purchase.

export type PurchaseEvent = {
  eventId: string; // shared with the browser pixel for deduplication
  eventName: EventName;
  email: string;
  valueCents: number;
  currency: string;
  orderId: string;
  clickIds: Record<string, string>;
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
  occurredAt: number; // unix seconds

  /**
   * Who they are, for the fields Meta matches on beyond the address.
   *
   * All optional and all dropped when absent. Every one of them raises match
   * quality on its own, and none of them is worth inventing: a guessed last
   * name matches nobody, which is worse than sending no last name at all.
   */
  userId?: string | null; // -> external_id
  fullName?: string | null; // -> fn / ln
  country?: string | null; // ISO-2 -> country
  /** When the ad click happened, for building fbc where no cookie survived. */
  clickTimeMs?: number | null;

  /** What was bought, so a deduped event still carries a product. */
  contentIds?: string[];
  contentName?: string | null;
  contentType?: string;
  numItems?: number;
};

export type TrackingEnv = {
  META_PIXEL_ID?: string;
  META_CAPI_TOKEN?: string;
  /**
   * Meta's Test Events code.
   *
   * Without it a server event cannot be seen in Events Manager's Test Events
   * tab at all — browser events show up there on their own, server events only
   * when the payload names the code. So "check the two sides line up" was not a
   * thing anybody could do, which is why the fields below went years unnoticed.
   *
   * Meant to be set temporarily and removed. Left set, every event is flagged
   * as a test and is NOT counted for optimisation or reporting.
   */
  META_TEST_EVENT_CODE?: string;
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
  // A Measurement ID begins with G-. A GTM- value is a Tag Manager CONTAINER,
  // which the Measurement Protocol rejects — and it rejects it with a 204, the
  // same empty success it returns for a good event. Checking the shape here is
  // the only way that mistake ever surfaces.
  if (env.GA4_MEASUREMENT_ID?.startsWith("G-") && env.GA4_API_SECRET) out.push("ga4");
  return out;
}

/**
 * Configuration that looks set but cannot work.
 *
 * Surfaced on the admin errors page rather than thrown: tracking must never
 * break a purchase, and silence is exactly how "we have had no conversions for
 * three weeks" happens.
 */
export function trackingMisconfigured(env: TrackingEnv): string[] {
  const out: string[] = [];
  if (env.META_CAPI_TOKEN && !env.META_PIXEL_ID) {
    out.push("META_CAPI_TOKEN is set but META_PIXEL_ID is not, so no server-side Meta event is sent.");
  }
  if (env.GA4_MEASUREMENT_ID && !env.GA4_MEASUREMENT_ID.startsWith("G-")) {
    out.push(
      `GA4_MEASUREMENT_ID is "${env.GA4_MEASUREMENT_ID}" — the Measurement Protocol needs the G- Measurement ID from Admin → Data Streams, not a GTM- container id.`,
    );
  }
  if (env.GA4_MEASUREMENT_ID?.startsWith("G-") && !env.GA4_API_SECRET) {
    out.push("GA4_MEASUREMENT_ID is set but GA4_API_SECRET is not, so no server-side GA4 event is sent.");
  }
  return out;
}

/** The same check, against the process this store is running in. */
export const trackingProblems = () => trackingMisconfigured(trackingEnv());

const major = (cents: number) => Math.round(cents) / 100;

export function buildMetaEvent(e: PurchaseEvent, testEventCode?: string) {
  const { fn, ln } = nameParts(e.fullName);

  // Hashed where Meta hashes, in the clear where Meta issued the value itself.
  // An `fbp` or an IP that has been hashed is an identifier Meta cannot match
  // against anything, which looks identical to sending it correctly.
  const user_data = compact({
    em: e.email ? [hashEmail(e.email)] : undefined,
    fn: fn ? [fn] : undefined,
    ln: ln ? [ln] : undefined,
    country: countryHash(e.country) ? [countryHash(e.country)!] : undefined,
    external_id: hashed(e.userId) ? [hashed(e.userId)!] : undefined,
    fbc: fbcFrom(e.clickIds, e.clickTimeMs ?? undefined),
    fbp: fbpFrom(e.clickIds),
    client_ip_address: e.clientIp ?? undefined,
    client_user_agent: e.userAgent ?? undefined,
  });

  // What was bought. The browser copy has carried this all along and the
  // server copy did not — so on the traffic where the browser is blocked, the
  // surviving event named no product and could drive nothing that needs one.
  const content = compact({
    content_ids: e.contentIds?.length ? e.contentIds : undefined,
    content_type: e.contentIds?.length ? (e.contentType ?? "product") : undefined,
    content_name: e.contentName ?? undefined,
    num_items: e.numItems ?? undefined,
  });

  return {
    data: [
      {
        event_name: e.eventName,
        event_time: e.occurredAt,
        event_id: e.eventId, // dedupes against the browser pixel
        action_source: "website" as const,
        ...compact({ event_source_url: e.sourceUrl ?? undefined }),
        user_data,
        // A value on an event that has none invents revenue, and invented
        // revenue is what an algorithm then optimises towards.
        // One shape, with the money dropped rather than a second shape without
        // it: a union here means every reader has to narrow before it can look
        // at `value`, for a field that is simply absent on some events.
        custom_data: compact({
          order_id: e.orderId,
          value: NO_VALUE.includes(e.eventName) ? undefined : major(e.valueCents),
          currency: NO_VALUE.includes(e.eventName) ? undefined : e.currency.toUpperCase(),
          ...content,
        }),
      },
    ],
    // Only present while somebody is watching Test Events.
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };
}

export function buildGa4Event(e: PurchaseEvent) {
  const money = NO_VALUE.includes(e.eventName)
    ? {}
    : { value: major(e.valueCents), currency: e.currency.toUpperCase() };
  return {
    client_id: e.orderId, // no browser client id server-side; order id is stable
    events: [
      {
        // GA4's own vocabulary. A custom event named after Meta's would sit in
        // its reports as a stranger none of the built-in funnels understand.
        name: GA4_NAME[e.eventName],
        params: {
          transaction_id: e.orderId, // GA4 dedupes replays on this
          ...money,
        },
      },
    ],
  };
}

function trackingEnv(): TrackingEnv {
  return {
    META_PIXEL_ID: process.env.META_PIXEL_ID,
    META_CAPI_TOKEN: process.env.META_CAPI_TOKEN,
    META_TEST_EVENT_CODE: process.env.META_TEST_EVENT_CODE,
    GA4_MEASUREMENT_ID: process.env.GA4_MEASUREMENT_ID,
    GA4_API_SECRET: process.env.GA4_API_SECRET,
  };
}

// Fire-and-forget. A tracking failure must NEVER surface to the buyer or roll
// back a purchase, so every error is swallowed after being logged server-side.
/**
 * Any event, from the server.
 *
 * trackPurchase was this function under a narrower name. Everything it does —
 * hashing, click ids, dedup — applies to every event, and having a second
 * function for the rest is how half of them end up not sending click ids.
 */
export async function trackServerEvent(
  e: PurchaseEvent,
  opts?: { only?: ("meta" | "ga4")[]; rethrow?: boolean },
): Promise<void> {
  return trackPurchase(e, opts);
}

export async function trackPurchase(
  e: PurchaseEvent,
  /**
   * Which platforms to send to.
   *
   * Meta deduplicates on event_id and GA4 does not. So an event the browser
   * already reports to GA4 — every upper-funnel one — must go to Meta ALONE
   * from the server, or the same InitiateCheckout is counted twice and every
   * funnel rate built on it is wrong by however much traffic runs a blocker.
   *
   * Unset means both, which is right for the money events: those are sent to
   * GA4 from the server only, and the browser never reports them.
   */
  opts?: {
    only?: ("meta" | "ga4")[];
    /**
     * Report failure by throwing instead of by queueing.
     *
     * For the retry runner. Without it a replay that failed again would record
     * a SECOND job carrying the same event, and the queue would grow a new row
     * every sweep instead of counting attempts against the one already there.
     */
    rethrow?: boolean;
  },
): Promise<void> {
  const env = trackingEnv();
  const allowed = opts?.only;
  const providers = enabledProviders(env).filter((p) => !allowed || allowed.includes(p));
  if (providers.length === 0) return;

  const sends: Promise<unknown>[] = [];

  if (providers.includes("meta")) {
    sends.push(
      (async () => {
        const res = await fetch(`https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...buildMetaEvent(e, env.META_TEST_EVENT_CODE),
            access_token: env.META_CAPI_TOKEN,
          }),
          signal: AbortSignal.timeout(5000),
        });
        // Read the refusal.
        //
        // A 400 from Meta was being thrown away: fetch resolves for any status,
        // so a rejected payload counted as a successful send. A malformed field
        // could be discarded for months and the only evidence would be a
        // conversion count that felt low. Now it lands on the errors page.
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`meta ${res.status}: ${body.slice(0, 500)}`);
        }
      })(),
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
    if (r.status !== "rejected") continue;
    const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
    // Logged AND recorded. The console line is the fastest place to look
    // during an incident; the errors page is the only place anybody would
    // notice weeks later.
    console.error("[tracking] send failed:", r.reason);
    // Retried only when the MOMENT was the problem.
    //
    // A refusal is almost always the payload, and replaying a malformed event
    // on a schedule just refuses it again on a schedule. A timeout or a 5xx is
    // the opposite: the same payload would have been accepted a minute later,
    // and this was the one and only attempt at reporting a completed sale. So
    // it goes back in the queue — Meta accepts an event up to seven days after
    // it happened, and the event id is the order's, so a replay that overlaps
    // a copy the browser already sent is deduplicated rather than doubled.
    // The sweep owns the bookkeeping for a replay: throwing is how a runner
    // reports failure, and recording here as well would fork the job.
    if (opts?.rethrow) throw r.reason instanceof Error ? r.reason : new Error(message);
    const retryable = transient(message);
    await recordError({
      source: "tracking",
      message: `Could not report ${e.eventName}: ${message}`,
      context: { eventName: e.eventName, eventId: e.eventId, orderId: e.orderId },
      ...(retryable
        ? {
            jobKind: "tracking_event" as const,
            // The event verbatim, plus which platform was being sent to — a
            // replay of both when only Meta timed out would double-count in
            // GA4, which does not deduplicate.
            jobPayload: { event: e as unknown as Record<string, unknown>, only: allowed ?? null },
          }
        : {}),
    }).catch(() => {});
  }
}

/**
 * Was it the moment rather than the payload?
 *
 * A timeout aborts before any status exists. A 5xx is the platform having a
 * bad minute. Everything else — a 400 naming a bad field, a 401 on a rotated
 * token — will fail identically on every replay.
 */
function transient(message: string): boolean {
  if (/timeout|aborted|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(message)) {
    return true;
  }
  return /\b(?:meta |ga4 )?5\d\d\b/.test(message);
}
