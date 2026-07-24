"use client";

import { useEffect } from "react";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const CLICK_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "wbraid", "gbraid"];

// Fires once per session on landing: captures UTMs, click ids, and referrer.
// Events don't send to ad platforms until phase 6 — this just makes sure the
// attribution data is stored the moment a visitor arrives.
export function AttributionTracker() {
  useEffect(() => {
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
  }, []);

  return null;
}
