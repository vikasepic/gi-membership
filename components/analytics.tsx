"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";
import { GA4_NAME, META_BOTH_SIDES, META_CUSTOM, type EventName } from "@/lib/analytics/events";
import type { PixelMatch } from "@/lib/pixel-match";

// The browser half of tracking.
//
// Nothing loads until consent is granted — not the script, not a request to
// either vendor. A pixel that loads first and "respects consent" afterwards has
// already told Facebook the page was opened, which is the thing consent was
// asked about.
//
// Advanced matching rides on the init call: `fbq('init', id, {em, fn, ln,
// external_id})` attaches those to EVERY browser event from then on, which is
// why a PageView can carry an email at all. All four arrive already hashed —
// see lib/pixel-match — so no address is ever an argument to a third-party
// script, and `external_id` is the same value the server sends so the two
// sides describe one person rather than two.
//
// The server half sends the same money events again with the same event_id.
// Meta deduplicates on that, so both sides raise match quality without
// double counting. GA4 does NOT deduplicate, so its commerce events come from
// the server only and this file never sends one.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export type Ids = {
  metaPixelId?: string | null;
  ga4MeasurementId?: string | null;
  googleAdsId?: string | null;
};

/** Fire an event at whichever browser pixels are loaded. */
/**
 * Events fired before the pixel existed.
 *
 * `TrackView` reports on mount — a React effect, at hydration. The pixel is a
 * `next/script` with `afterInteractive`, which by definition runs after that.
 * So `window.fbq` was undefined at the moment the event fired, the optional
 * call no-opped, and TrackView's `sent` ref meant it was never tried again.
 *
 * Found on production 22 Aug 2026 with consent already granted and the pixel
 * warm: the product page reported a PageView and nothing else, and its
 * ViewContent — the only upper-funnel signal an ad campaign gets from a
 * landing page — had never fired once. The checkout's events were fine only
 * because they fire later, once a form is ready.
 *
 * Holding them here rather than loading the pixel earlier: nothing may reach
 * Meta before someone has agreed to it, so the buffer is the half that can
 * wait. It is dropped, not delivered, if they decline.
 */
type PixelCall = () => void;
const pending: PixelCall[] = [];
/** Enough for any real page. A cap, so a refusal cannot grow a list forever. */
const PENDING_LIMIT = 50;

function whenPixelReady(send: PixelCall): void {
  if (window.fbq) send();
  else if (pending.length < PENDING_LIMIT) pending.push(send);
}

/** Called when the pixel script has defined `fbq`, and on consent granted. */
export function flushPendingPixelCalls(): void {
  if (typeof window === "undefined" || !window.fbq) return;
  while (pending.length) pending.shift()?.();
}

/** Called when consent is refused: what was held is discarded, never sent. */
export function dropPendingPixelCalls(): void {
  pending.length = 0;
}

/** Test seam — how many events are waiting on the pixel. */
export function pendingPixelCallCount(): number {
  return pending.length;
}

export function track(
  name: EventName,
  params: Record<string, unknown> = {},
  eventId?: string,
  /**
   * Sent to OUR server and to nobody else.
   *
   * The buyer's address raises Meta's match rate a great deal, and it must
   * reach Meta hashed. Putting it in `params` would hand it to the pixel in
   * the clear — advanced matching sends whatever it is given — so it travels
   * on the relay instead, where the server hashes it before it leaves.
   */
  serverOnly?: { email?: string | null },
): void {
  if (typeof window === "undefined") return;
  // Meta: the event id is what pairs this with the server's copy. A course
  // event is not in Meta's vocabulary, so it has to be sent as a custom one.
  const verb = META_CUSTOM.includes(name) ? "trackCustom" : "track";
  whenPixelReady(() =>
    window.fbq?.(verb, name, params, eventId ? { eventID: eventId } : undefined),
  );
  // GA4: only the events that carry no money. Revenue is the server's job, and
  // a purchase reported from here as well would be counted twice.
  if (!isCommerce(name)) window.gtag?.("event", GA4_NAME[name], params);
  // And the server's copy of the same event, through our own domain.
  if (eventId && META_BOTH_SIDES.includes(name) && !isCommerce(name))
    relay(name, params, eventId, serverOnly?.email ?? undefined);
}

/**
 * A named custom event, for one funnel only.
 *
 * The ad account runs several funnels through one pixel, so a single Purchase
 * cannot tell them apart in reporting. The ads team names an event per funnel
 * and reads that instead. The NAME is theirs to choose and lives on the
 * product row, never in this file — a name compiled into the code is a deploy
 * every time somebody in an ad account changes their mind.
 *
 * Separate from `track` on purpose: `track` takes an `EventName` from a fixed
 * union, which is what stops a typo becoming a silent second event. This one
 * takes a free string because it has to, so it is the only door that is open
 * and it is deliberately narrow — always trackCustom, browser only, no GA4,
 * no relay, and never a substitute for Purchase.
 */
export function trackNamedCustom(name: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const clean = name.trim();
  if (!clean) return;
  whenPixelReady(() => window.fbq?.("trackCustom", clean, params));
}

/**
 * Ask the server to report this event too.
 *
 * The line above sends it to Meta from the browser; this sends the same
 * event_id from the server, so Meta collapses the pair. The point is the
 * traffic where the line above never runs — a blocked pixel, a tracking
 * protection list, an iOS setting — where this is the only copy that arrives.
 *
 * A request to our own origin, which is what makes it survive: connect.
 * facebook.net is on every blocklist there is and /api/track/event is on none
 * of them.
 *
 * keepalive, because two of these fire on a page the buyer is about to leave —
 * a checkout that redirects to Stripe, a buy button that navigates. Without it
 * the browser cancels the request on unload and the event is lost exactly when
 * it matters. Failures are swallowed: nothing here may interrupt a purchase.
 */
function relay(
  name: EventName,
  params: Record<string, unknown>,
  eventId: string,
  email?: string,
): void {
  try {
    void fetch("/api/track/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event: name,
        eventId,
        valueCents: typeof params.value === "number" ? Math.round(params.value * 100) : 0,
        currency: typeof params.currency === "string" ? params.currency : undefined,
        contentIds: Array.isArray(params.content_ids) ? params.content_ids : undefined,
        contentName: typeof params.content_name === "string" ? params.content_name : undefined,
        email: email || undefined,
      }),
    }).catch(() => {});
  } catch {
    // Never let a measurement call throw into a checkout.
  }
}

const isCommerce = (name: EventName) =>
  name === "Purchase" || name === "StartTrial" || name === "Subscribe";

/**
 * A Google Ads conversion, with the buyer's address attached.
 *
 * Enhanced conversions raise match rates a lot and cost nothing extra here —
 * Google hashes the address in the browser before it leaves, so this passes it
 * in the clear to gtag and never over the wire.
 */
export function adsConversion(
  sendTo: string,
  args: { valueCents: number; currency: string; orderId: string; email?: string | null },
): void {
  if (typeof window === "undefined" || !window.gtag) return;
  if (args.email) window.gtag("set", "user_data", { email: args.email });
  window.gtag("event", "conversion", {
    send_to: sendTo,
    value: Math.round(args.valueCents) / 100,
    currency: args.currency.toUpperCase(),
    transaction_id: args.orderId,
  });
}

export function Analytics({ ids, match }: { ids: Ids; match?: PixelMatch | null }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const read = () =>
      setAllowed(
        mayTrack(
          parseConsent(
            document.cookie
              .split("; ")
              .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
              ?.split("=")[1],
          ),
        ),
      );
    read();
    // The banner dispatches this the moment someone accepts, so the pixels
    // load on that click rather than on the next navigation — otherwise the
    // page they consented on is the one page never measured.
    window.addEventListener("gi:consent-granted", read);
    // And a refusal throws away whatever was waiting on a pixel. Buffering an
    // event is not permission to send it later.
    window.addEventListener("gi:consent-denied", dropPendingPixelCalls);
    return () => {
      window.removeEventListener("gi:consent-granted", read);
      window.removeEventListener("gi:consent-denied", dropPendingPixelCalls);
    };
  }, []);

  if (!allowed) return null;

  return (
    <>
      {ids.metaPixelId && (
        // onReady rather than onLoad: for an inline script Next fires onReady
        // after it has executed, which is the instant `fbq` starts existing.
        // Anything reported during hydration is waiting for exactly this.
        <Script id="meta-pixel" strategy="afterInteractive" onReady={flushPendingPixelCalls}>
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${ids.metaPixelId}'${match ? `,${JSON.stringify(match)}` : ""});fbq('track','PageView');`}
        </Script>
      )}

      {(ids.ga4MeasurementId || ids.googleAdsId) && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ids.ga4MeasurementId || ids.googleAdsId}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());
${ids.ga4MeasurementId ? `gtag('config','${ids.ga4MeasurementId}');` : ""}
${ids.googleAdsId ? `gtag('config','${ids.googleAdsId}',{allow_enhanced_conversions:true});` : ""}`}
          </Script>
        </>
      )}
    </>
  );
}
