"use client";

import { useEffect, useState } from "react";
import { evergreenDeadline, pad, remainingAt, unitLabel, type Remaining } from "@/lib/countdown";

/**
 * The clock itself.
 *
 * A client leaf inside an otherwise server-rendered block tree, because a
 * countdown is the one thing on a sales page that cannot be static. Everything
 * around it — the band, the boxes, the styling — is still server-rendered; only
 * the digits live here.
 *
 * It renders `null` for the first paint and fills in on mount, the same trick
 * `components/oto/sticky-bar.tsx` uses and for the same reason: a time rendered
 * on the server is already wrong when it reaches the browser, and rendering it
 * anyway produces a visible jump plus a hydration mismatch. The box keeps its
 * height throughout, so nothing below it moves when the numbers arrive.
 */

export type CountdownUnits = { days: boolean; hours: boolean; minutes: boolean; seconds: boolean };

export type CountdownView = {
  /**
   * The instant being counted to, or null when it is a per-visitor length.
   *
   * An evergreen deadline cannot be decided on the server: it depends on when
   * THIS browser first saw the block, which only that browser knows.
   */
  deadline: number | null;
  /** Evergreen only: the window, and where this visitor's start is kept. */
  evergreen?: { key: string; minutes: number; restartAfterDays: number };
  units: CountdownUnits;
  showLabel: boolean;
  /** Singular and plural per unit, already resolved from the block's props. */
  labels: Record<keyof CountdownUnits, { one: string; many: string }>;
  leadingZero: boolean;
  separator: string;
  /** What happens at zero. `redirect` is handled here; the rest by the parent. */
  onExpire: "keep" | "hide" | "message" | "redirect";
  redirectTo?: string;
  /** Rendered in place of the clock once it is done. */
  message?: React.ReactNode;
  /** Presentation, supplied by the block so this component owns no design. */
  classes: { list: string; box: string; digit: string; label: string; sep: string };
  styles: { list?: React.CSSProperties; box?: React.CSSProperties; digit?: React.CSSProperties; label?: React.CSSProperties };
};

const ORDER: (keyof CountdownUnits)[] = ["days", "hours", "minutes", "seconds"];

export function Countdown(v: CountdownView) {
  const [now, setNow] = useState<number | null>(null);
  // Resolved on mount, never during render: reading localStorage while
  // rendering makes the server and client disagree, and writing to it during
  // render would start somebody's timer just because React re-rendered.
  const [evEnds, setEvEnds] = useState<number | null>(null);
  const ev = v.evergreen;

  useEffect(() => {
    if (!ev) return;
    try {
      setEvEnds(evergreenDeadline(window.localStorage, ev.key, ev.minutes, Date.now(), ev.restartAfterDays));
    } catch {
      // Storage refused — private mode, or blocked. The visitor gets the full
      // window each visit rather than no countdown at all, and nothing breaks.
      setEvEnds(Date.now() + ev.minutes * 60000);
    }
  }, [ev?.key, ev?.minutes, ev?.restartAfterDays]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    // Every second. Not requestAnimationFrame: this updates once a second and
    // rAF would wake the machine sixty times to redraw the same digits.
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const ends = v.evergreen ? evEnds : v.deadline;
  const left: Remaining | null =
    now === null || ends === null
      ? null
      : remainingAt(ends, now, {
          days: v.units.days,
          hours: v.units.hours,
          minutes: v.units.minutes,
        });

  // The redirect fires from an effect, never during render — a redirect in a
  // render pass runs again on every re-render and fights the router.
  useEffect(() => {
    if (!left?.done || v.onExpire !== "redirect" || !v.redirectTo) return;
    window.location.href = v.redirectTo;
  }, [left?.done, v.onExpire, v.redirectTo]);

  if (left?.done) {
    if (v.onExpire === "hide") return null;
    if (v.onExpire === "message") return <>{v.message}</>;
  }

  const shown = ORDER.filter((u) => v.units[u]);
  // Every unit switched off is a block with nothing to draw. Not an error, and
  // not an empty bordered box either.
  if (shown.length === 0) return null;

  return (
    <div
      className={v.classes.list}
      style={v.styles.list}
      // The whole clock is one live region, announced as it changes rather than
      // four separate ones talking over each other. `polite` because a screen
      // reader interrupting every second would make the page unusable.
      role="timer"
      aria-live="off"
      aria-atomic="true"
    >
      {shown.map((u, i) => (
        <div key={u} className="contents">
          {i > 0 && v.separator && (
            <span aria-hidden className={v.classes.sep}>
              {v.separator}
            </span>
          )}
          <div className={v.classes.box} style={v.styles.box}>
            <span className={v.classes.digit} style={v.styles.digit}>
              {left === null ? (
                // A placeholder of the right width, so the box does not resize
                // when the real number lands a moment later.
                <span style={{ visibility: "hidden" }}>{v.leadingZero ? "00" : "0"}</span>
              ) : (
                pad(left[u], v.leadingZero)
              )}
            </span>
            {v.showLabel && (
              <span className={v.classes.label} style={v.styles.label}>
                {left === null
                  ? v.labels[u].many
                  : unitLabel(left[u], v.labels[u].one, v.labels[u].many)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
