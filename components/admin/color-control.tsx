"use client";

import { createContext, useContext } from "react";
import { colorName, colorToken, swatchColor, tokenId, type PaletteColor } from "@/lib/palette";

/**
 * The store's named colours, for every colour control on a screen.
 *
 * A context rather than a prop threaded through nine components: the controls
 * that need it are rendered from a switch statement four levels down and from
 * the section panel beside it, and the palette is one value that does not
 * change while the editor is open.
 */
export const PaletteContext = createContext<PaletteColor[]>([]);

/**
 * A colour, and the store's own colours beside it.
 *
 * Two ways to answer the same question, and the difference matters. The picker
 * writes a hex — a copy, which is right for a one-off. A swatch writes a
 * REFERENCE, `var(--gc-…, #hex)`, so the day the brand colour changes in Site
 * settings every block that took it changes with it. Nothing else in the
 * builder can say "the same colour as that other thing".
 *
 * A linked value cannot be shown in an `<input type="color">` — it holds a
 * variable, not a hex — so the swatch is drawn as a button and the picker sits
 * beside it holding the resolved colour.
 */
export function ColorControl({
  label,
  value,
  onChange,
  empty = "theme",
  fallback = "#000000",
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  /** What "nothing set" is called here — a block says theme, a band says band. */
  empty?: string;
  /** What the picker opens on when nothing is set. Black is never the answer. */
  fallback?: string;
}) {
  const palette = useContext(PaletteContext);
  const linked = tokenId(value);
  // The picker opens on the colour in force, not on black: a control whose
  // first suggestion is #000000 is one people close again.
  const shown = swatchColor(value, palette) ?? fallback;
  const named = colorName(value, palette);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          className="size-7 shrink-0 rounded border border-border bg-surface"
          value={shown}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[0.66rem] text-muted">
          {/* The NAME when it is linked. A row of identical hexes tells you
              nothing about which of them will move when the brand changes. */}
          {named ?? (linked ? "unlinked colour" : typeof value === "string" && value ? value : empty)}
        </span>
        <button
          type="button"
          title={`Use ${empty}`}
          aria-label={`Reset ${label}`}
          onClick={() => onChange(null)}
          className="shrink-0 rounded px-0.5 text-[0.62rem] text-muted hover:text-fg"
        >
          ✕
        </button>
      </div>

      {palette.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {palette.map((c) => (
            <button
              key={c.id}
              type="button"
              title={`${c.name} — follows Site settings`}
              aria-label={`${label}: ${c.name}`}
              aria-pressed={linked === c.id}
              onClick={() => onChange(colorToken(c))}
              className={`size-5 rounded-full border transition-transform hover:scale-110 ${
                linked === c.id ? "border-fg ring-1 ring-fg" : "border-border"
              }`}
              style={{ background: c.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
