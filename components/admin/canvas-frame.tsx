"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEVICE_MAX, type Device } from "@/lib/blocks";

/**
 * The canvas, at a width you can drag.
 *
 * Three fixed widths answered "what does this look like on a tablet" with one
 * number out of a range 256 pixels wide, and a layout that breaks at 800 looks
 * fine at 834. Elementor solved this years ago: a handle on the edge, a live
 * width, and the page reflowing under your hand.
 *
 * Two things make it honest rather than decorative:
 *
 * - **The width decides the device, not the tab.** Drag from 800 down to 700
 *   and the tab moves to Mobile because the page's own media queries have moved
 *   to mobile. The editor cannot claim a width and render another.
 * - **It is clamped to the range the tab governs**, so you cannot sit at 900px
 *   under a tab whose rules stop at 767 and wonder why nothing matches.
 */

// `DEVICE_MAX.desktop` is null — desktop has no ceiling — so the two that do
// are read out once here rather than being null-checked at every use.
const PHONE_MAX = DEVICE_MAX.mobile ?? 767;
const TABLET_MAX = DEVICE_MAX.tablet ?? 1023;

/** The widths a tab is allowed to show. */
export function widthRange(device: Device): { min: number; max: number } {
  if (device === "mobile") return { min: 280, max: PHONE_MAX };
  if (device === "tablet") return { min: PHONE_MAX + 1, max: TABLET_MAX };
  return { min: TABLET_MAX + 1, max: 2400 };
}

/**
 * Which device a width actually is, by the same numbers the page uses.
 *
 * Read from DEVICE_MAX rather than written out again, so the editor and the
 * media queries can never disagree about where a breakpoint is.
 */
export function deviceForWidth(w: number): Device {
  if (w <= PHONE_MAX) return "mobile";
  if (w <= TABLET_MAX) return "tablet";
  return "desktop";
}

export function CanvasFrame({
  device,
  width,
  onWidth,
  onDevice,
  children,
}: {
  device: Device;
  /** Null on desktop: take the pane, the way the real page takes the window. */
  width: number | null;
  onWidth: (w: number | null) => void;
  onDevice: (d: Device) => void;
  children: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState<number | null>(null);

  // What the pane can actually give, so desktop can be dragged too and a
  // narrow screen cannot be asked for 2400px.
  // `|| 1200` rather than `??`: a pane that measures 0 — not laid out yet, or
  // in a hidden panel — would otherwise clamp every width down to the 280px
  // floor and the canvas would collapse the first time you touched a handle.
  const paneWidth = () => wrap.current?.parentElement?.clientWidth || 1200;

  const apply = useCallback(
    (next: number) => {
      const capped = Math.max(280, Math.min(next, paneWidth()));
      onWidth(capped);
      // The tab follows the width, because the page does. Dragging below 768
      // means the mobile rules are the ones rendering.
      const d = deviceForWidth(capped);
      if (d !== device) onDevice(d);
    },
    [device, onDevice, onWidth],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const box = wrap.current?.getBoundingClientRect();
      if (!box) return;
      // Dragged from the right edge, and the frame is centred, so the width
      // changes by twice the distance the pointer moved.
      const next = Math.round((e.clientX - box.left - box.width / 2) * 2);
      setLive(next);
      apply(next);
    };
    const up = () => {
      setDragging(false);
      setLive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, apply]);

  const shown = width ?? null;
  const range = widthRange(device);

  return (
    <div ref={wrap} className="relative mx-auto w-full" style={{ maxWidth: shown ?? undefined }}>
      {children}

      {/* The handle. Both edges, because a centred frame grows from the middle
          and reaching only to the right feels like the page is off-centre. */}
      {[-1, 1].map((side) => (
        <button
          key={side}
          type="button"
          aria-label={side === 1 ? "Drag to make the canvas wider or narrower" : "Drag to resize the canvas"}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setDragging(true);
            setLive(shown ?? paneWidth());
          }}
          // The keyboard gets there too: a handle only a mouse can move is a
          // control half the people using this cannot reach.
          onKeyDown={(e) => {
            const step = e.shiftKey ? 50 : 10;
            if (e.key === "ArrowLeft") apply((shown ?? paneWidth()) - step);
            else if (e.key === "ArrowRight") apply((shown ?? paneWidth()) + step);
            else return;
            e.preventDefault();
          }}
          className={`absolute top-0 z-20 hidden h-full w-3 cursor-ew-resize touch-none items-center justify-center md:flex ${
            side === 1 ? "-right-3" : "-left-3"
          }`}
        >
          <span
            aria-hidden
            className={`h-10 w-1 rounded-full transition-colors ${
              dragging ? "bg-primary" : "bg-border hover:bg-primary"
            }`}
          />
        </button>
      ))}

      {/* The number, while it is moving. A width you cannot read is a width you
          cannot report a bug about. */}
      {dragging && (
        <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg tabular-nums">
          {Math.max(280, Math.min(live ?? 0, paneWidth()))}px · {deviceForWidth(live ?? 0)}
          {live !== null && (live < range.min || live > range.max) ? " ↔" : ""}
        </span>
      )}
    </div>
  );
}
