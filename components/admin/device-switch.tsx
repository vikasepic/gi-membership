"use client";

import { DEVICES, DEVICE_CANVAS, DEVICE_RANGE, type Device } from "@/lib/blocks";

// Desktop / Tablet / Mobile, in one control shared by the builder and the
// section editor. Two copies of this would be two places for the widths to
// drift from the widths the page actually responds at.

const LABEL: Record<Device, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" };

/** Simple glyphs rather than an icon set: three shapes, no dependency. */
function Glyph({ device }: { device: Device }) {
  const box =
    device === "desktop"
      ? { w: 15, h: 10, r: 1.5 }
      : device === "tablet"
        ? { w: 10, h: 13, r: 1.5 }
        : { w: 7, h: 13, r: 1.5 };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden focusable="false">
      <rect
        x={(16 - box.w) / 2}
        y={(16 - box.h) / 2}
        width={box.w}
        height={box.h}
        rx={box.r}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      {device === "desktop" && <path d="M6 14h4" stroke="currentColor" strokeWidth="1.3" />}
    </svg>
  );
}

export function DeviceSwitch({
  device,
  onChange,
  className = "",
}: {
  device: Device;
  onChange: (d: Device) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-0.5 rounded-full border border-border bg-surface-2 p-0.5 ${className}`}
      role="group"
      aria-label="Editing width"
    >
      {DEVICES.map((d) => {
        const on = d === device;
        const width = DEVICE_CANVAS[d];
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={on}
            // The widths the tab GOVERNS, then the width it previews at. It
            // used to name the canvas alone — "Tablet — 834px" — which is the
            // one number in this control that no media query is written
            // against, and it is the tooltip on the control both panels share.
            title={
              width
                ? `${LABEL[d]} — ${DEVICE_RANGE[d]}, previewed at ${width}px`
                : `${LABEL[d]} — ${DEVICE_RANGE[d]}`
            }
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
              on ? "bg-surface font-medium text-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            <Glyph device={d} />
            <span className={on ? "" : "sr-only sm:not-sr-only"}>{LABEL[d]}</span>
          </button>
        );
      })}
    </div>
  );
}
