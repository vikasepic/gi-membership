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
    // And say so out loud when it was refused. Anything reported during
    // hydration is held until a pixel exists; a refusal has to throw that away
    // rather than leave it waiting for one.
    else window.dispatchEvent(new Event("gi:consent-denied"));
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie and tracking consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:bottom-4 md:left-4 md:right-auto md:max-w-md md:rounded-2xl md:border md:p-5"
      // Clears the home indicator, and sits above the bottom tab bar.
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-md flex-col gap-2.5 md:gap-3">
        <p className="text-[13px] leading-snug md:text-sm md:leading-relaxed">
          We use cookies to measure which ads bring people here — only if you agree.
          The store works the same either way.{" "}
          {/* A consent banner that can't tell you what you're consenting to isn't
              informed consent. Opens in place; the choice stays available. */}
          <a href="/privacy" className="text-primary underline underline-offset-2">
            What we collect
          </a>
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => choose("granted")}
            className="flex-1 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Accept
          </button>
          <button
            onClick={() => choose("denied")}
            className="flex-1 rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:border-fg"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
