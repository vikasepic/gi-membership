"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, parseConsent, mayTrack } from "@/lib/consent";
import { GA4_NAME, META_CUSTOM, type EventName } from "@/lib/analytics/events";

// The browser half of tracking.
//
// Nothing loads until consent is granted — not the script, not a request to
// either vendor. A pixel that loads first and "respects consent" afterwards has
// already told Facebook the page was opened, which is the thing consent was
// asked about.
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
export function track(
  name: EventName,
  params: Record<string, unknown> = {},
  eventId?: string,
): void {
  if (typeof window === "undefined") return;
  // Meta: the event id is what pairs this with the server's copy. A course
  // event is not in Meta's vocabulary, so it has to be sent as a custom one.
  const verb = META_CUSTOM.includes(name) ? "trackCustom" : "track";
  window.fbq?.(verb, name, params, eventId ? { eventID: eventId } : undefined);
  // GA4: only the events that carry no money. Revenue is the server's job, and
  // a purchase reported from here as well would be counted twice.
  if (!isCommerce(name)) window.gtag?.("event", GA4_NAME[name], params);
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

export function Analytics({ ids }: { ids: Ids }) {
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
    return () => window.removeEventListener("gi:consent-granted", read);
  }, []);

  if (!allowed) return null;

  return (
    <>
      {ids.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${ids.metaPixelId}');fbq('track','PageView');`}
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
