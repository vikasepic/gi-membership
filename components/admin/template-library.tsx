"use client";

import { useEffect, useRef, useState } from "react";
import { Blocks } from "@/components/page/blocks";
import { listTemplates, type Template } from "@/lib/templates";
import { bandTheme, normalizeSectionLayout, BAND_WIDTH, type BandTheme } from "@/lib/page-sections";
import { PREVIEW_SCOPE } from "@/lib/site-typography";

/**
 * The library popup: groups down the side, rendered previews in a grid.
 *
 * Previews are the template's real blocks — the same `Blocks` the live page
 * renders — never a screenshot: a picture goes stale the day a block's default
 * changes, and a rendered preview is a test of the template as well as a
 * picture of it.
 *
 * Two things this got wrong the first time, both reported from the builder:
 *
 *  - the tile scaled to fit its WIDTH inside a fixed 4:3 box, so any design
 *    taller than that was cut off at the bottom. The grid was showing the tops
 *    of designs, not the designs.
 *  - a click inserted immediately. Committing a change to the page was the
 *    same gesture as looking at something, and what you were committing to was
 *    the part you could not see.
 *
 * So: the tile fits the whole design, height included, and a click opens it
 * large. Adding is now a separate, deliberate press.
 */
export function TemplateLibrary({
  open,
  theme,
  onClose,
  onInsert,
}: {
  open: boolean;
  theme: BandTheme;
  onClose: () => void;
  onInsert: (t: Template) => void;
}) {
  const [group, setGroup] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);

  // Capture phase, because the builder underneath also listens for Escape on
  // the document. One key press closes one layer: the big preview first, then
  // the popup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (previewing) setPreviewing(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, previewing]);

  useEffect(() => {
    if (!open) setPreviewing(null);
  }, [open]);

  if (!open) return null;

  const all = listTemplates();
  const groups = [...new Set(all.map((t) => t.group))];
  const showing = group ? all.filter((t) => t.group === group) : all;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <strong className="font-display text-sm">Library</strong>
          <span className="text-xs text-muted">
            {previewing ? previewing.name : "Click a design to see it full size"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the library"
            className="ml-auto rounded px-2 py-1 text-sm text-muted hover:text-fg"
          >
            ✕
          </button>
        </header>

        {previewing ? (
          <BigPreview
            template={previewing}
            theme={theme}
            onBack={() => setPreviewing(null)}
            onAdd={() => onInsert(previewing)}
          />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[160px_1fr]">
            <aside className="flex flex-col gap-0.5 overflow-y-auto border-r border-border p-2">
              {[null, ...groups].map((g) => (
                <button
                  key={g ?? "all"}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={`rounded-lg px-2.5 py-1.5 text-left text-xs ${
                    group === g ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {g ?? "All designs"}
                </button>
              ))}
            </aside>
            <div className="grid content-start gap-3 overflow-y-auto p-4 sm:grid-cols-2">
              {showing.map((t) => (
                <div
                  key={t.id}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border transition-colors hover:border-primary"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewing(t)}
                    aria-label={`Preview ${t.name}`}
                    className="block w-full cursor-zoom-in"
                  >
                    <TemplatePreview template={t} theme={theme} height={240} />
                  </button>
                  <div className="flex items-center gap-2 border-t border-border px-2.5 py-1.5">
                    <span className="truncate text-xs text-fg">{t.name}</span>
                    <div className="ml-auto flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewing(t)}
                        className="rounded-full border border-border px-2 py-0.5 text-[0.66rem] text-muted hover:border-fg hover:text-fg"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => onInsert(t)}
                        className="rounded-full bg-primary px-2.5 py-0.5 text-[0.66rem] font-medium text-primary-fg hover:bg-primary-hover"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The design at the width it was drawn for, with the decision to make. */
function BigPreview({
  template,
  theme,
  onBack,
  onAdd,
}: {
  template: Template;
  theme: BandTheme;
  onBack: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-surface-2 p-4">
        <TemplatePreview template={template} theme={theme} />
      </div>
      <footer className="flex items-center gap-2 border-t border-border px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-fg hover:text-fg"
        >
          ← All designs
        </button>
        {template.band && (
          <span className="text-[0.66rem] text-muted">
            Adding this also sets the band it was drawn on.
          </span>
        )}
        <button
          type="button"
          onClick={onAdd}
          className="ml-auto rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary-hover"
        >
          Add to this section
        </button>
      </footer>
    </div>
  );
}

/** Width every preview is rendered at before scaling — the desktop measure. */
const PREVIEW_WIDTH = BAND_WIDTH;

/**
 * A template drawn at full size and scaled down to fit.
 *
 * `height` caps it for the grid; without one it fits the width and takes
 * whatever height the design needs, which is what the big preview wants.
 * Scaling by the smaller of the two ratios is the whole fix for the cropped
 * tiles: fitting width alone is what cut every tall design off at the bottom.
 */
function TemplatePreview({
  template,
  theme,
  height,
}: {
  template: Template;
  theme: BandTheme;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const outer = box.current;
    const inner = content.current;
    if (!outer || !inner) return;
    const measure = () => setSize({ w: outer.clientWidth, h: inner.scrollHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    measure();
    return () => ro.disconnect();
  }, [template.id]);

  // The band the design was drawn on, so the preview is the design and not the
  // design standing on somebody else's colour.
  const band = template.band;
  const previewTheme = band?.style ? bandTheme(band.style) : theme;
  const layout = normalizeSectionLayout(band?.layout ?? null);
  const padX = layout.padX ?? 24;
  const padY = layout.padY ?? 48;

  // Fit the width; if the box has a fixed height, fit that too and take the
  // smaller. Fitting width alone is exactly the bug being fixed here — it is
  // what cropped every design taller than its tile.
  const byWidth = size.w > 0 ? size.w / PREVIEW_WIDTH : 0;
  const byHeight = height && size.h > 0 ? height / size.h : Infinity;
  const shown = Math.min(byWidth, byHeight);

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden"
      style={{
        height: height ?? (size.h > 0 ? Math.round(size.h * shown) : 240),
        background: band?.color ?? previewTheme.bg,
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: PREVIEW_WIDTH, transform: `scale(${shown || 0.0001})` }}
      >
        {/* @container, or every grid inside collapses to one column and the
            design previews as a stacked list — the same fix the editor canvas
            needed. PREVIEW_SCOPE so the store's own type reaches it. */}
        <div
          ref={content}
          className={`${PREVIEW_SCOPE} @container pointer-events-none`}
          style={{
            paddingInline: padX,
            paddingBlock: padY,
            color: previewTheme.fg,
          }}
        >
          <Blocks blocks={template.blocks} theme={previewTheme} at="desktop" />
        </div>
      </div>
    </div>
  );
}
