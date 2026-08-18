"use client";

import { useEffect } from "react";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const CLICK_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "wbraid", "gbraid"];

/** A cookie by name, or undefined. */
function cookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function capture() {
  if (sessionStorage.getItem("gi_tracked")) return;
  const params = new URLSearchParams(window.location.search);
  const pick = (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, params.get(k)]).filter(([, v]) => v)) as Record<
      string,
      string
    >;

  // Meta's own two cookies, alongside the query-string click ids.
  //
  // `_fbc` is the click id in the format Meta actually accepts —
  // fb.1.<click-time>.<fbclid> — written by the pixel itself, so it carries the
  // real click time rather than a guess. `_fbp` is the browser id, and it is
  // the single strongest match signal available to a server-side event; it was
  // never captured at all, so every conversion this store reported was matched
  // on a hashed email and nothing else.
  //
  // Read AFTER consent, because the pixel that writes them does not load until
  // then — which is also why capture() runs again on the consent event.
  const clickIds = { ...pick(CLICK_KEYS) };
  const fbp = cookie("_fbp");
  const fbc = cookie("_fbc");
  if (fbp) clickIds.fbp = fbp;
  if (fbc) clickIds.fbc = fbc;

  fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      landingUrl: window.location.href,
      referrer: document.referrer,
      utm: pick(UTM_KEYS),
      clickIds,
    }),
  })
    // Marked done only when the server says it actually STORED something.
    //
    // It used to be marked on any reply, including the "no-consent" one — so
    // the landing capture, which almost always runs before the banner is
    // answered, set the flag and the capture that runs the moment somebody
    // accepts returned early. Anybody who consented after landing, which is
    // everybody, had their click ids dropped.
    .then((r) => r.json().catch(() => ({})))
    .then((r: { stored?: boolean }) => {
      if (r?.stored) sessionStorage.setItem("gi_tracked", "1");
    })
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
