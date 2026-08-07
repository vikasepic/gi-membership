"use client";

import { BAND_STYLES, BAND_STYLE_KEYS, type BandStyleKey } from "@/lib/page-sections";
import { emptyBackground, type Background } from "@/lib/blocks";
import { MediaButton } from "@/components/admin/media-modal";
import { publicCoverUrl } from "@/lib/media-url";

export type SectionEdit = {
  style: string | null;
  accent: string | null;
  variant: string | null;
  enabled: boolean;
  /** A picture or a wash over the band's colour. */
  background?: Background | null;
  cssId?: string | null;
  cssClass?: string | null;
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
  const bg = section.background ?? emptyBackground();
  // One patch shape, so a change to any part of the background writes the
  // whole object — a sparse patch would leave half a background behind.
  const setBg = (patch: Partial<Background>) =>
    section.onChange({ background: { ...bg, ...patch } });
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
          <span className="text-[0.55rem] text-muted">▶</span> Background
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">Image</span>
            <div className="flex flex-col gap-1.5">
              {bg.image ? (
                <span className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={publicCoverUrl(bg.image) ?? ""}
                    alt=""
                    className="h-9 w-14 shrink-0 rounded border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setBg({ image: "", type: "none" })}
                    className="text-[0.66rem] text-muted hover:text-primary"
                  >
                    Remove
                  </button>
                </span>
              ) : null}
              <MediaButton
                kind="image"
                label={bg.image ? "Replace" : "Choose an image"}
                onPick={(item) => setBg({ image: item.path, type: "classic" })}
              />
            </div>
          </div>

          {bg.image && (
            <>
              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
                <span className="text-xs text-fg">Fit</span>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {(["cover", "contain", "auto"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={bg.size === v}
                      onClick={() => setBg({ size: v })}
                      className={`flex-1 border-r border-border px-1 py-1 text-[0.66rem] capitalize last:border-r-0 ${
                        bg.size === v ? "bg-primary/12 text-primary" : "text-muted hover:text-fg"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
                <span className="text-xs text-fg">Position</span>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {(
                    [
                      ["top", "Top"],
                      ["center", "Centre"],
                      ["bottom", "Bottom"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={bg.position === v}
                      onClick={() => setBg({ position: v })}
                      className={`flex-1 border-r border-border px-1 py-1 text-[0.66rem] last:border-r-0 ${
                        bg.position === v ? "bg-primary/12 text-primary" : "text-muted hover:text-fg"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
                <span className="text-xs text-fg">Darken</span>
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={5}
                    value={bg.overlay ?? 0}
                    aria-label="Darken the image"
                    onChange={(e) => setBg({ overlay: Number(e.target.value) })}
                    className="min-w-0 flex-1 accent-[var(--primary)]"
                  />
                  <span className="w-8 text-right text-[0.66rem] tabular-nums text-muted">
                    {bg.overlay ?? 0}%
                  </span>
                </span>
              </div>
              <p className="text-[0.66rem] leading-snug text-muted">
                The band still decides the ink, so words stay readable if the picture is slow, fails
                to load, or turns out lighter than it looked. Darken it until they are.
              </p>
            </>
          )}
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
              className={`relative h-[18px] w-8 shrink-0 justify-self-start rounded-full transition-colors ${
                section.enabled ? "bg-[#3f9b6d]" : "bg-border"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  section.enabled ? "translate-x-3.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <p className="text-[0.66rem] leading-snug text-muted">
            Switching it off keeps everything in it.
          </p>
        </div>
      </details>

      <details className="insp-section border-b border-border">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[0.7rem] font-semibold text-fg [&::-webkit-details-marker]:hidden">
          <span className="text-[0.55rem] text-muted">▶</span> Attributes
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">CSS id</span>
            <input
              value={section.cssId ?? ""}
              onChange={(e) => section.onChange({ cssId: e.target.value })}
              placeholder="pricing"
              aria-label="CSS id for this section"
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">CSS class</span>
            <input
              value={section.cssClass ?? ""}
              onChange={(e) => section.onChange({ cssClass: e.target.value })}
              placeholder="promo highlight"
              aria-label="CSS classes for this section"
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
          </div>
          <p className="text-[0.66rem] leading-snug text-muted">
            An id makes this band linkable — a button anywhere can go to{" "}
            <code className="font-mono">#{section.cssId?.trim() || "pricing"}</code>. Both are
            cleaned on save: anything that is not a letter, digit, hyphen or underscore is dropped,
            because these land in an attribute and in a selector.
          </p>
        </div>
      </details>
    </div>
  );
}
