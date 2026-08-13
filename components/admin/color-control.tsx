"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { readableInk } from "@/lib/color";
import { colorName, colorToken, swatchColor, tokenId, type PaletteColor } from "@/lib/palette";

/**
 * One colour control, everywhere a colour is set.
 *
 * There were five of them — the block inspector, the band panel, Site settings,
 * the typography table, the header fields — each with its own markup and its
 * own idea of what "unset" looks like. They are one component now, because the
 * global colours have to be reachable from every one of them: a brand colour
 * half the screens cannot offer is a brand colour half the store will not use.
 *
 * Two ways to answer the same question, and the difference is the point:
 *
 * - The picker writes a HEX — a copy, which is right for a one-off.
 * - The globe writes a REFERENCE, `var(--gc-…, #hex)`, so the day that colour
 *   changes in Site settings, every block that took it changes with it.
 *
 * A linked value cannot be shown in an `<input type="color">` — it holds a
 * variable, not a hex — so a linked control shows the colour's NAME instead. A
 * column of identical hexes tells you nothing about which of them will move
 * when the brand does.
 */

export const PaletteContext = createContext<PaletteColor[]>([]);

/** Where the colours are defined, for the link out of the popover. */
const SETTINGS_HREF = "/admin/settings";

export function ColorControl({
  label,
  value,
  onChange,
  empty = "theme",
  fallback = "#000000",
  globals = true,
}: {
  label: string;
  value: unknown;
  onChange: (v: string | null) => void;
  /** What "nothing set" is called here — a block says theme, a band says band. */
  empty?: string;
  /** What the picker opens on when nothing is set. Black is never the answer. */
  fallback?: string;
  /**
   * Off where a colour is DEFINED rather than chosen — the palette editor
   * itself. A global colour pointing at a global colour has no answer.
   */
  globals?: boolean;
}) {
  const palette = useContext(PaletteContext);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const linked = tokenId(value);
  const shown = swatchColor(value, palette) ?? fallback;
  const named = colorName(value, palette);
  const text = typeof value === "string" ? value.trim() : "";

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped here, or the builder underneath reads it as "close the editor"
      // and one press throws away the panel you were working in.
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  // Typed text that is not a colour is dropped on save by every normalizer in
  // the app, and used to be dropped without a word on the screens that had no
  // note — which was most of them. Said once, here.
  const bad = text !== "" && !linked && !/^#[0-9a-f]{3,8}$/i.test(text);

  return (
    <div ref={wrap} className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {globals && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${label}: choose a global colour`}
          title="The store's global colours"
          className={`grid size-7 shrink-0 place-content-center rounded-lg border transition-colors ${
            linked || open ? "border-primary text-primary" : "border-border text-muted hover:text-fg"
          }`}
        >
          {/* A globe: the mark every builder uses for "this one is shared". */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 fill-none stroke-current"
            strokeWidth="1.6"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
          </svg>
        </button>
      )}

      <input
        type="color"
        aria-label={`${label} picker`}
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        className="size-7 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-0.5"
      />

      {linked ? (
        // Named, not hexed. Clicking it reopens the list, because the name is
        // the only thing on this row that says where the colour came from.
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={`${named ?? "A colour that has been removed"} — follows Site settings`}
          className="min-w-0 flex-1 truncate rounded px-1 text-left text-[0.7rem] text-fg hover:text-primary"
        >
          {named ?? "removed colour"}
        </button>
      ) : (
        // The text and the picker write the same value, because a hex you can
        // paste matters as much as one you can point at.
        <input
          aria-label={label}
          value={text}
          placeholder={empty}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 font-mono text-[0.7rem] text-muted outline-none focus:border-border focus:bg-surface focus:text-fg"
        />
      )}

      {text !== "" && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title={`Use ${empty}`}
          aria-label={`Reset ${label}`}
          className="shrink-0 rounded px-0.5 text-[0.68rem] text-muted hover:text-fg"
        >
          ✕
        </button>
      )}

      {bad && (
        <span className="w-full text-[0.66rem] text-primary">
          Not a colour — dropped on save. Try #c8653d.
        </span>
      )}

      {open && (
        <div
          className="absolute right-0 top-9 z-[200] w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          role="listbox"
          aria-label="Global colours"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <strong className="flex-1 text-[0.7rem] font-semibold text-fg">Global colours</strong>
            <a
              href={SETTINGS_HREF}
              title="Manage them in Site settings"
              className="text-[0.66rem] text-muted hover:text-primary"
            >
              Manage
            </a>
          </div>

          {palette.length === 0 ? (
            <p className="px-3 py-3 text-[0.68rem] leading-relaxed text-muted">
              None defined yet. Add them under{" "}
              <a href={SETTINGS_HREF} className="text-primary underline">
                Site settings → Brand
              </a>
              , and every colour control on the site will offer them.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {palette.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={linked === c.id}
                  onClick={() => {
                    onChange(colorToken(c));
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className="grid size-5 shrink-0 place-content-center rounded"
                    style={{ background: c.value, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.16)" }}
                  >
                    {linked === c.id && (
                      // The tick is drawn in whatever reads on that colour, so
                      // it is visible on the white swatch and the black one.
                      <svg
                        viewBox="0 0 24 24"
                        className="size-3.5 fill-current"
                        style={{ color: readableInk(c.value) }}
                      >
                        <path d="M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6L20.4 7.8 19 6.4 9.6 16.2Z" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.72rem] text-fg">{c.name}</span>
                  <span className="shrink-0 font-mono text-[0.64rem] uppercase text-muted">
                    {c.value}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The same control inside a `<form>`.
 *
 * Site settings posts fields by name rather than calling back, so this holds
 * the value and puts it in a hidden input. One component behind both, or the
 * two screens drift the way they already had.
 */
export function ColorField({
  name,
  label,
  value,
  fallback = "#000000",
  empty = "inherit",
  globals = true,
}: {
  name: string;
  label: string;
  value: string;
  fallback?: string;
  empty?: string;
  globals?: boolean;
}) {
  const [colour, setColour] = useState(value);
  return (
    <>
      <input type="hidden" name={name} value={colour} />
      <ColorControl
        label={label}
        value={colour}
        onChange={(v) => setColour(v ?? "")}
        fallback={fallback}
        empty={empty}
        globals={globals}
      />
    </>
  );
}
