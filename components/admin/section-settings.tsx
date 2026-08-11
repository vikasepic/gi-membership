"use client";

import {
  BAND_STYLES,
  BAND_STYLE_KEYS,
  BAND_WIDTH,
  SECTION_LIMITS,
  normalizeSectionLayout,
  type BandStyleKey,
  type SectionLayout,
  type SectionUnit,
} from "@/lib/page-sections";
import { emptyBackground, type Background } from "@/lib/blocks";
import { MediaButton } from "@/components/admin/media-modal";
import { PositionPicker } from "@/components/admin/position-picker";
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
  /** How wide the band holds its content, and how much air. */
  layout?: unknown;
  variants?: { key: string; label: string }[];
  onChange: (patch: Record<string, unknown>) => void;
};

/**
 * A number that can be blank.
 *
 * Blank is not zero here — it means "keep the built-in", and zero means "none
 * at all". A field that turned an empty box into 0 would silently strip a
 * band's air the first time somebody cleared it to look at the placeholder.
 */
function NumberField({
  value,
  unit,
  max,
  placeholder,
  onChange,
  onUnit,
}: {
  value: number | null;
  unit: SectionUnit;
  max: number;
  placeholder: string;
  onChange: (n: number | null) => void;
  onUnit: (u: SectionUnit) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Slider AND a number you can type, the same pair every other measure
          in this builder offers — a slider alone cannot reliably hit 40, and a
          number alone cannot be explored. The cap is what stops a slipped
          keystroke becoming a hundred-thousand-pixel band. */}
      <input
        type="range"
        aria-label={placeholder}
        className="min-w-0 flex-1 accent-[var(--primary)]"
        min={0}
        max={max}
        step={unit === "%" ? 1 : 4}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        aria-label={`${placeholder} value`}
        min={0}
        max={max}
        value={value ?? ""}
        placeholder="—"
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? null : Math.max(0, Math.min(max, Number(raw))));
        }}
        className="w-12 shrink-0 rounded border border-border bg-surface px-1 py-1 text-center text-[0.68rem] tabular-nums outline-none focus:border-primary"
      />
      {/* px or per cent, on every measure. A band that should hold to a share
          of the screen cannot say so in pixels. */}
      <div className="flex shrink-0 overflow-hidden rounded border border-border">
        {(["px", "%"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onUnit(u)}
            className={`px-1.5 py-1 text-[0.62rem] ${
              unit === u ? "bg-primary/10 font-medium text-primary" : "text-muted hover:text-fg"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
      {/* Clearing is how a measure goes back to the built-in, so it has to be
          reachable — not only settable. */}
      <button
        type="button"
        aria-label={`Reset ${placeholder}`}
        title="Back to the built-in"
        onClick={() => onChange(null)}
        className="shrink-0 rounded px-0.5 text-[0.62rem] text-muted hover:text-fg"
      >
        ✕
      </button>
    </div>
  );
}

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

  // One patch shape for the layout too: the whole object goes back, so a
  // sparse patch cannot leave half a layout behind — the same rule the
  // background above follows, and for the same reason.
  const layout = normalizeSectionLayout(section.layout);
  const setLayout = (patch: Partial<SectionLayout>) =>
    section.onChange({ layout: { ...layout, ...patch } });

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

      {/* Width and air, on the band itself.
          Until this existed the only way to reach past the 1040px measure was
          a negative margin on a block inside it — which works, and leaves a
          number nobody typed sitting in the inspector for the next person to
          puzzle over. A design whose ground runs to the screen edge is a
          property of the band, so it is set on the band. */}
      <details open className="insp-section border-b border-border">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[0.7rem] font-semibold text-fg [&::-webkit-details-marker]:hidden">
          <span className="text-[0.55rem] text-muted">▶</span> Width
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">Content</span>
            <div className="flex overflow-hidden rounded-lg border border-border">
              {(["boxed", "full", "custom"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setLayout({ width: w })}
                  className={`flex-1 px-2 py-1.5 text-[0.68rem] capitalize transition-colors ${
                    layout.width === w ? "bg-primary/10 font-medium text-primary" : "text-muted hover:text-fg"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[0.62rem] leading-snug text-muted">
            {layout.width === "full"
              ? "Content reaches the screen edge. Side padding still applies — set it to 0 for a true bleed."
              : layout.width === "custom"
                ? "Capped at the measure below and centred."
                : `Capped at ${BAND_WIDTH}px and centred, the way every band has been.`}
          </p>
          {layout.width === "custom" && (
            <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
              <span className="text-xs text-fg">Measure</span>
              <NumberField
                value={layout.maxWidth}
                unit={layout.maxWidthUnit}
                max={SECTION_LIMITS.maxWidth[layout.maxWidthUnit]}
                placeholder="Measure"
                onChange={(n) => setLayout({ maxWidth: n })}
                onUnit={(u) => setLayout({ maxWidthUnit: u, maxWidth: null })}
              />
            </div>
          )}
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">Side padding</span>
            <NumberField
              value={layout.padX}
              unit={layout.padXUnit}
              max={SECTION_LIMITS.pad[layout.padXUnit]}
              placeholder="Side padding"
              onChange={(n) => setLayout({ padX: n })}
              onUnit={(u) => setLayout({ padXUnit: u, padX: null })}
            />
          </div>
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs text-fg">Top &amp; bottom</span>
            <NumberField
              value={layout.padY}
              unit={layout.padYUnit}
              max={SECTION_LIMITS.pad[layout.padYUnit]}
              placeholder="Top and bottom padding"
              onChange={(n) => setLayout({ padY: n })}
              onUnit={(u) => setLayout({ padYUnit: u, padY: null })}
            />
          </div>
          <p className="text-[0.62rem] leading-snug text-muted">
            Blank keeps the built-in air. 0 removes it — which is what a
            photograph standing on the band&rsquo;s edge needs.
          </p>
        </div>
      </details>

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

              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-2.5">
                <span className="pt-1 text-xs text-fg">Position</span>
                <PositionPicker
                  value={bg.position}
                  onChange={(position) => setBg({ position })}
                />
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
