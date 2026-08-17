"use client";

import { useEffect, useState } from "react";

/**
 * "An update lands in 60 seconds — save now."
 *
 * Deliberately NOT a centred modal, and that is the whole design.
 *
 * A dialog in the middle of the screen covers the page and traps focus, and the
 * one thing this notice asks somebody to do is press Save — which in this admin
 * lives in the header, behind exactly where a modal sits. A warning that blocks
 * the action it is demanding is a warning that causes the loss it exists to
 * prevent. So it is a bar: unmissable, pinned out of the way, and the page
 * stays usable underneath it.
 *
 * It is dismissible, because "ignore this if you already saved" is a real and
 * common answer, and a notice you cannot put down is one people learn to work
 * around rather than read.
 *
 * The countdown runs to an absolute instant rather than counting 60 down from
 * whenever the browser heard about it. A tab that learns late shows 41 seconds
 * and is telling the truth; one that counted from 60 would promise time that
 * does not exist.
 */

export type DeployNotice = {
  /** When the deploy actually starts. ISO, from the server. */
  startsAt: string;
  /** Roughly how long the app is expected to be rebuilding, in minutes. */
  backInMinutes?: number;
};

/** Whole seconds until `iso`, floored at zero. */
function secondsUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

export function DeployNoticeBar({
  notice,
  onDismiss,
}: {
  notice: DeployNotice | null;
  onDismiss?: () => void;
}) {
  const [left, setLeft] = useState(() => (notice ? secondsUntil(notice.startsAt) : 0));

  useEffect(() => {
    if (!notice) return;
    setLeft(secondsUntil(notice.startsAt));
    // Every 250ms rather than every second: a timer ticking on its own schedule
    // drifts against the clock and can appear to skip or repeat a number, which
    // on a countdown somebody is watching reads as broken.
    const t = setInterval(() => setLeft(secondsUntil(notice.startsAt)), 250);
    return () => clearInterval(t);
  }, [notice]);

  if (!notice) return null;

  const going = left <= 0;
  const back = notice.backInMinutes ?? 5;

  return (
    <div
      // Bottom, not centre. The Save button is at the top of every editor in
      // this admin, and covering it would be the joke that writes itself.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex justify-center p-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border px-5 py-4 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] ${
          going ? "border-border" : "border-primary/45"
        }`}
        // Opaque, and that is the point.
        //
        // It was `bg-primary/8` — an eight per cent tint over nothing, so the
        // page read straight through it and the warning was unreadable on top
        // of a busy editor. A colour that carries a message cannot be ninety
        // per cent whatever happens to be underneath.
        //
        // Mixed against the surface rather than layered with alpha: the mix is
        // opaque by construction, so it stays legible over a hero image, a navy
        // band, or a table of numbers.
        style={{
          background: going
            ? "var(--surface)"
            : "color-mix(in srgb, var(--primary) 10%, var(--surface))",
        }}
      >
        {!going && (
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-primary-fg"
          >
            <span className="font-display text-xl tabular-nums leading-none">{left}</span>
          </span>
        )}

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong className="font-display text-[0.95rem]">
            {going ? "The update is going out now." : "Save your work — an update lands in a moment."}
          </strong>
          <span className="text-sm text-muted">
            {going ? (
              <>
                Anything you save from here may not stick. Give it about {back} minutes, then
                refresh and carry on.
              </>
            ) : (
              <>
                Press Save on anything you have open. Already saved? Ignore this — nothing else is
                needed.
              </>
            )}
          </span>
        </span>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            {going ? "Close" : "Dismiss"}
          </button>
        )}
      </div>
    </div>
  );
}
