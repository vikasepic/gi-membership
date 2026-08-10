"use client";

import { useEffect, useRef, useState } from "react";
import { Blocks } from "@/components/page/blocks";
import { listTemplates, type Template } from "@/lib/templates";
import type { BandTheme } from "@/lib/page-sections";
import { PREVIEW_SCOPE } from "@/lib/site-typography";

/**
 * The library popup: groups down the side, rendered previews in a grid.
 *
 * Previews are the template's real blocks — the same `Blocks` the live page
 * renders — drawn at desktop width and scaled down with a transform. Never a
 * screenshot: a picture goes stale the day a block's default changes, and a
 * rendered preview is a test of the template as well as a picture of it.
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

  // Capture phase, because the builder underneath also listens for Escape on
  // the document — bubbled — and one key press must close one layer, not both.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

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
        className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <strong className="font-display text-sm">Library</strong>
          <span className="text-xs text-muted">Click a design to add it to this section</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the library"
            className="ml-auto rounded px-2 py-1 text-sm text-muted hover:text-fg"
          >
            ✕
          </button>
        </header>
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
              <button
                key={t.id}
                type="button"
                onClick={() => onInsert(t)}
                className="group flex flex-col overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary"
              >
                <TemplatePreview blocks={t.blocks} theme={theme} />
                <span className="border-t border-border px-2.5 py-1.5 text-xs text-fg group-hover:text-primary">
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Width every preview is rendered at before scaling — the desktop canvas. */
const PREVIEW_WIDTH = 900;

function TemplatePreview({ blocks, theme }: { blocks: Template["blocks"]; theme: BandTheme }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: "4 / 3", background: theme.bg }}
    >
      {width > 0 && (
        // @container, or every grid inside collapses to one column and every
        // template previews as a stacked list — the same fix the editor canvas
        // needed. PREVIEW_SCOPE so the site's own type reaches the preview.
        <div
          className={`${PREVIEW_SCOPE} @container pointer-events-none absolute left-0 top-0 origin-top-left px-8 py-6`}
          style={{
            width: PREVIEW_WIDTH,
            transform: `scale(${width / PREVIEW_WIDTH})`,
            color: theme.fg,
          }}
        >
          <Blocks blocks={blocks} theme={theme} at="desktop" />
        </div>
      )}
    </div>
  );
}
