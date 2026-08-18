"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { acceptOtoAction } from "@/app/(store)/checkout/oto/actions";
import { scrollToBuy } from "@/lib/buy-anchor";

// Sticky accept bar, with a countdown to the offer's REAL expiry.
//
// The clock is honest. The upsell token is signed with a 15-minute TTL and
// verifyOtoToken refuses it afterwards, so when this hits zero the offer
// genuinely cannot be accepted — the page redirects to thank-you on reload and
// the server rejects a late POST. It is describing the state of the offer, not
// manufacturing pressure. That distinction is the only reason a timer belongs
// on this page at all: a countdown that resets, or that expires into a still-
// working button, is a lie the buyer eventually notices.
//
// The button buys only when there is nothing to decide. With more than one way
// to pay, a bar that submits has to guess which one — and it guessed the first,
// so somebody could tick the yearly, press the bar, and be charged the monthly.
// A bar cannot carry a choice it is not showing, so it sends them to the one on
// the page instead. One tap either way, and no way to be charged for a thing
// nobody picked.
//
// What it deliberately does NOT claim: that this is the only way to get the
// product. Content Engine is also offered as a checkout bump and stands in the
// library, so "last chance to get it" would be false. The true scarcity is
// narrower and still real — this one-click page, at this moment, once.

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function OtoStickyBar({
  token,
  acceptLabel,
  declineLabel,
  priceLine,
  subLine,
  expiresAt,
  optionCount = 1,
}: {
  token: string;
  acceptLabel: string;
  declineLabel: string;
  priceLine: string;
  subLine?: string | null;
  expiresAt?: number;
  /** How many ways to pay this page is showing. More than one and the button scrolls. */
  optionCount?: number;
}) {
  // Starts null so the server render and the first client render agree; a
  // clock rendered on the server is wrong the moment it reaches the browser.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(expiresAt - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const expired = remaining !== null && remaining <= 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 backdrop-blur"
      style={{ background: "rgba(17,50,91,0.97)" }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 md:px-6 md:py-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg font-semibold leading-tight text-white">
            {priceLine}
          </span>
          {subLine && <span className="truncate text-xs text-white/65">{subLine}</span>}
        </div>

        {remaining !== null && (
          <div className="flex flex-col items-end leading-tight">
            <span
              className="text-[1.05rem] font-semibold tabular-nums text-white [font-variant-numeric:tabular-nums]"
              aria-live="off"
            >
              {format(remaining)}
            </span>
            <span className="text-[0.68rem] uppercase tracking-[0.14em] text-white/55">
              {expired ? "expired" : "left on this offer"}
            </span>
          </div>
        )}

        {expired ? (
          <Link
            href="/checkout/thank-you?oto=expired"
            className="rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Continue to your library
          </Link>
        ) : (
          <div className="flex items-center gap-4">
            {optionCount > 1 ? (
              <button
                type="button"
                onClick={() => scrollToBuy()}
                className="rounded-full bg-[#b0532f] px-7 py-3.5 text-[0.98rem] font-medium text-white transition-[transform,background-color] duration-200 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:bg-[#9c4728] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {acceptLabel}
              </button>
            ) : (
            <form action={acceptOtoAction}>
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-full bg-[#b0532f] px-7 py-3.5 text-[0.98rem] font-medium text-white transition-[transform,background-color] duration-200 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:bg-[#9c4728] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {acceptLabel}
              </button>
            </form>
            )}
            <Link
              href="/checkout/thank-you?oto=declined"
              className="hidden text-sm text-white/60 underline underline-offset-4 transition-colors hover:text-white sm:block"
            >
              {declineLabel}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
