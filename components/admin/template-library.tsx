"use client";

import { useEffect, useState } from "react";
import { listTemplates, type Template } from "@/lib/templates";
import { type BandTheme } from "@/lib/page-sections";
import { TemplatePreview } from "@/components/admin/template-preview";

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
/** A design pages link to rather than copy. The id says so — see toTemplate. */
const isGlobal = (t: Template) => t.id.startsWith("global:");
const GLOBAL_GROUP = "Global blocks";

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
  // The saved half of the shelf. Built-ins are imported; these live in the
  // database, so they arrive when the popup opens. A failed fetch narrows the
  // shelf to the built-ins rather than emptying it — see /api/templates.
  const [saved, setSaved] = useState<Template[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j: { templates?: Template[] }) => {
        if (alive) setSaved(j.templates ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

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

  // Saved first: a design this store made is more likely to be the one being
  // reached for than one that ships with the app.
  //
  // Globals get their own group whatever they were filed under, because the
  // group is the only warning you get before pressing Add: everything else on
  // this shelf makes a copy, and these do not.
  const all = [...saved, ...listTemplates()].map((t) =>
    isGlobal(t) ? { ...t, group: GLOBAL_GROUP } : t,
  );
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
            {/* Three across where there is room. Two made every tile 460px
                wide in a 1024px modal, which is a lot of scrolling for a shelf
                whose job is "show me what there is". */}
            {/* `auto-rows-max` is load-bearing, not tidying.
                Each card carries `overflow-hidden`, which makes its
                `min-height: auto` resolve to ZERO — so the grid was free to
                shrink every row below its content, and with a fixed-height
                scroller it did exactly that: seventeen rows of 200px content
                squeezed into 32px each, and the whole library rendered as
                coloured strips with the titles crushed out of existence.

                Sizing the rows to their content is the direct statement of what
                a scrolling grid means. The container then overflows and
                scrolls, which is what `overflow-y-auto` was there for. */}
            <div className="grid auto-rows-max content-start gap-3 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    {/* Shorter, because there are three of them now — a tile
                        shows what a design IS, and the full size is one click
                        away for what it says. */}
                    <TemplatePreview template={t} theme={theme} height={200} />
                  </button>
                  <div className="flex items-center gap-2 border-t border-border px-2.5 py-1.5">
                    <span className="truncate text-xs text-fg">{t.name}</span>
                    {isGlobal(t) && (
                      <span
                        title="Linked, not copied — editing it changes every page using it"
                        className="shrink-0 rounded-full border border-border px-1.5 py-px text-[0.6rem] text-muted"
                      >
                        Linked
                      </span>
                    )}
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
                        {isGlobal(t) ? "Link" : "Add"}
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
        {isGlobal(template) ? (
          <span className="text-[0.66rem] text-muted">
            Linked, not copied. Editing this design changes every page using it.
          </span>
        ) : (
          template.band && (
            <span className="text-[0.66rem] text-muted">
              Adding this also sets the band it was drawn on.
            </span>
          )
        )}
        <button
          type="button"
          onClick={onAdd}
          className="ml-auto rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary-hover"
        >
          {isGlobal(template) ? "Link into this section" : "Add to this section"}
        </button>
      </footer>
    </div>
  );
}
