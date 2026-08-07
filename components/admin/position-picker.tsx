"use client";

import { useState } from "react";
import { BG_POSITIONS } from "@/lib/blocks";

/**
 * Where a background picture sits.
 *
 * A grid rather than a dropdown of nine phrases: the control is a picture of
 * the thing it sets, so "top left" is a corner you point at instead of two
 * words you read and then map onto a rectangle. Elementor uses a dropdown; the
 * grid is the same nine choices with the reading removed.
 *
 * Custom is behind them, not beside them. A percentage pair is what you reach
 * for when none of the nine is right — which is rarely, and never first.
 */

const LABEL: Record<string, string> = {
  "left top": "Top left",
  "center top": "Top",
  "right top": "Top right",
  "left center": "Left",
  "center center": "Centre",
  "right center": "Right",
  "left bottom": "Bottom left",
  "center bottom": "Bottom",
  "right bottom": "Bottom right",
};

const CUSTOM = /^(\d{1,3})% (\d{1,3})%$/;

export function PositionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const custom = CUSTOM.exec(value);
  const [open, setOpen] = useState(Boolean(custom));
  const x = custom ? Number(custom[1]) : 50;
  const y = custom ? Number(custom[2]) : 50;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <div
          role="group"
          aria-label="Background position"
          className="grid w-fit grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border"
        >
          {BG_POSITIONS.map((p) => {
            const on = value === p;
            return (
              <button
                key={p}
                type="button"
                title={LABEL[p]}
                aria-label={LABEL[p]}
                aria-pressed={on}
                onClick={() => {
                  setOpen(false);
                  onChange(p);
                }}
                className={`grid size-6 place-items-center bg-surface transition-colors ${
                  on ? "bg-primary/12" : "hover:bg-surface-2"
                }`}
              >
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${on ? "bg-primary" : "bg-border"}`}
                />
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-1 pt-0.5">
          <span className="text-[0.66rem] text-muted">
            {custom ? `${x}% ${y}%` : (LABEL[value] ?? "Centre")}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = !open;
              setOpen(next);
              // Entering custom starts from where it already is, so the picture
              // does not jump the moment the fields appear.
              if (next && !custom) onChange("50% 50%");
            }}
            className="w-fit text-[0.66rem] text-muted underline-offset-2 hover:text-primary hover:underline"
          >
            {open ? "Use one of the nine" : "Custom…"}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-1.5">
          {(
            [
              ["Across", x, (n: number) => onChange(`${n}% ${y}%`)],
              ["Down", y, (n: number) => onChange(`${x}% ${n}%`)],
            ] as const
          ).map(([label, at, set]) => (
            <span key={label} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[0.66rem] text-muted">{label}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={at}
                aria-label={`${label} position`}
                onChange={(e) => set(Number(e.target.value))}
                className="min-w-0 flex-1 accent-[var(--primary)]"
              />
              <span className="w-8 text-right text-[0.66rem] tabular-nums text-muted">{at}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
