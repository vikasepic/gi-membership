"use client";

import { useEffect } from "react";
import { parseLabels } from "@/lib/attribution";

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
  // the single strongest match signal available to a server-side event.
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
      // The same seven keys the server keeps (lib/attribution.ts), so the
      // visitor row and the order can never disagree about which labels exist.
      utm: parseLabels(window.location.search),
      clickIds,
    }),
  })
    .then((r) => r.json().catch(() => ({})))
    .then((r: { stored?: boolean }) => {
      // Finished only once one of Meta's own cookies was in the payload.
      //
      // Marking it on any successful store is the trap this component used to
      // fall into from the other direction: the first run happens before
      // fbevents.js has loaded, so neither cookie exists yet, and a flag set
      // there means the run that WOULD have carried them never happens. The
      // server merges late click ids into the existing row without disturbing
      // first touch, so running again is safe and is the whole point.
      if (r?.stored && (fbp || fbc)) sessionStorage.setItem("gi_tracked", "1");
    })
    .catch(() => {});
}

/**
 * Captures UTMs, click ids and referrer on landing.
 *
 * Runs for every visitor — the consent banner that used to gate this was
 * removed on 11 Sep 2026. An explicit opt-out cookie still stops the server
 * storing anything (lib/consent.ts); nothing writes one.
 */
export function AttributionTracker() {
  useEffect(() => {
    // Immediately, so the campaign that brought them here is recorded even if
    // the pixel is blocked and the cookies below never appear.
    capture();

    // Then again once Meta's pixel has written its cookies. `fbevents.js` is
    // loaded async by the snippet, so `_fbp` appears some hundreds of ms after
    // this effect — there is no event for it, and the pixel-ready event fires
    // too early (it marks the inline stub, not the loaded script). Polling the
    // cookie costs nothing and is the only signal that is never early.
    if (sessionStorage.getItem("gi_tracked")) return;
    const poll = setInterval(() => {
      if (sessionStorage.getItem("gi_tracked")) {
        clearInterval(poll);
        return;
      }
      // Only re-send when there is something new to send: a blocked pixel
      // means these never arrive, and re-posting the same payload 30 times
      // would be 30 wasted requests on a page that takes money.
      if (cookie("_fbp") || cookie("_fbc")) capture();
    }, 500);
    // Give up rather than poll forever — an ad blocker is a permanent answer.
    const stop = setTimeout(() => clearInterval(poll), 15000);

    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, []);

  return null;
}
