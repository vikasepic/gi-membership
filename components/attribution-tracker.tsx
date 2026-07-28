"use client";

import { useEffect } from "react";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const CLICK_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "wbraid", "gbraid"];

function capture() {
  if (sessionStorage.getItem("gi_tracked")) return;
  const params = new URLSearchParams(window.location.search);
  const pick = (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, params.get(k)]).filter(([, v]) => v)) as Record<
      string,
      string
    >;

  fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      landingUrl: window.location.href,
      referrer: document.referrer,
      utm: pick(UTM_KEYS),
      clickIds: pick(CLICK_KEYS),
    }),
  })
    .then(() => sessionStorage.setItem("gi_tracked", "1"))
    .catch(() => {});
}

// Captures UTMs, click ids and referrer on landing — but only once the visitor
// has opted in, since those are personal data under GDPR and this store takes
// EU/UK traffic. The server re-checks the consent cookie and refuses to store
// anything without it, so this is defence in depth rather than the only gate.
export function AttributionTracker() {
  useEffect(() => {
    capture(); // no-ops server-side when consent is absent
    const onGrant = () => capture();
    window.addEventListener("gi:consent-granted", onGrant);
    return () => window.removeEventListener("gi:consent-granted", onGrant);
  }, []);

  return null;
}
