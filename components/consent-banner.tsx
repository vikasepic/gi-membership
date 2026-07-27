"use client";

import { useEffect, useState } from "react";
import { CONSENT_COOKIE, CONSENT_MAX_AGE, parseConsent } from "@/lib/consent";

// GDPR consent gate. The store takes EU/UK traffic, so tracking is opt-IN and
// declining must be exactly as easy as accepting — hence two equal buttons, no
// pre-selection, and no "X" that quietly counts as consent.
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
      ?.split("=")[1];
    setVisible(parseConsent(raw) === "unset");
  }, []);

  function choose(state: "granted" | "denied") {
    document.cookie = `${CONSENT_COOKIE}=${state}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax`;
    setVisible(false);
    // Let the attribution capture run now if it was just permitted.
    if (state === "granted") window.dispatchEvent(new Event("gi:consent-granted"));
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie and tracking consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 p-5 backdrop-blur md:bottom-4 md:left-4 md:right-auto md:max-w-md md:rounded-2xl md:border"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed">
          We use cookies to measure which ads bring people here. That&rsquo;s only set if
          you agree — the store works exactly the same either way.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => choose("granted")}
            className="flex-1 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Accept
          </button>
          <button
            onClick={() => choose("denied")}
            className="flex-1 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-fg"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
