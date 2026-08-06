"use client";

import { BAND_STYLES, BAND_STYLE_KEYS, type BandStyleKey } from "@/lib/page-sections";

export type SectionEdit = {
  style: string | null;
  accent: string | null;
  variant: string | null;
  enabled: boolean;
  variants?: { key: string; label: string }[];
  onChange: (patch: Record<string, unknown>) => void;
};

/**
 * The band itself, edited from inside the builder.
 *
 * These used to sit in the form behind the editor, so changing a band colour
 * meant closing the thing you were judging the colour against. They live here
 * now, in the panel, shown when nothing is selected — which is what clicking
 * away from a block already means.
 */
export function SectionSettings({ section }: { section: SectionEdit }) {
  const band = (section.style as BandStyleKey) ?? "paper";
  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-3 py-2">
        <strong className="font-display text-sm">Section</strong>
        <p className="mt-0.5 text-[0.68rem] text-muted">
          Nothing selected — this is the band everything sits on.
        </p>
      </div>

      {section.variants && section.variants.length > 0 && (
        <details open className="insp-section border-b border-border">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[0.7rem] font-semibold text-fg [&::-webkit-details-marker]:hidden">
            <span className="text-[0.55rem] text-muted">▶</span> Layout
          </summary>
          <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-1">
            {section.variants.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => section.onChange({ variant: v.key })}
                className={`rounded-full border px-2.5 py-1 text-[0.68rem] transition-colors ${
                  section.variant === v.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:border-fg"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </details>
      )}

      <details open className="insp-section border-b border-border">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[0.7rem] font-semibold text-fg [&::-webkit-details-marker]:hidden">
          <span className="text-[0.55rem] text-muted">▶</span> Band
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">Colour</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {BAND_STYLE_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  title={BAND_STYLES[k].label}
                  aria-label={BAND_STYLES[k].label}
                  aria-pressed={section.style === k}
                  onClick={() => section.onChange({ style: k })}
                  className={`size-6 rounded-md border-2 transition-colors ${
                    section.style === k ? "border-fg" : "border-transparent"
                  }`}
                  style={{
                    background: BAND_STYLES[k].bg,
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.16)",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">Accent</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={section.accent ?? BAND_STYLES[band].accent}
                onChange={(e) => section.onChange({ accent: e.target.value })}
                aria-label="Accent colour"
                className="size-7 shrink-0 cursor-pointer rounded border border-border bg-surface"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[0.66rem] text-muted">
                {section.accent ?? "the band's own"}
              </span>
              {section.accent && (
                <button
                  type="button"
                  onClick={() => section.onChange({ accent: null })}
                  aria-label="Use the band's own accent"
                  className="shrink-0 rounded px-0.5 text-[0.62rem] text-muted hover:text-fg"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <p className="text-[0.66rem] leading-snug text-muted">
            The accent marks small things — buttons, numbers, ticks. The band decides the ground and
            the ink together, so words stay readable on it.
          </p>
        </div>
      </details>

      <details open className="insp-section border-b border-border">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[0.7rem] font-semibold text-fg [&::-webkit-details-marker]:hidden">
          <span className="text-[0.55rem] text-muted">▶</span> Visibility
        </summary>
        <div className="flex flex-col gap-1 px-3 pb-3 pt-1">
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">Show it</span>
            <button
              type="button"
              role="switch"
              aria-checked={section.enabled}
              aria-label="Show this section"
              onClick={() => section.onChange({ enabled: !section.enabled })}
              className={`relative h-5 w-9 shrink-0 justify-self-start rounded-full transition-colors ${
                section.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                  section.enabled ? "translate-x-[1.125rem]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <p className="text-[0.66rem] leading-snug text-muted">
            Switching it off keeps everything in it.
          </p>
        </div>
      </details>
    </div>
  );
}
