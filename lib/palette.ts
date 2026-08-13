import { z } from "zod";
import { colorVar, inkVar, readableInk, tokenId } from "@/lib/color";

// The value-level helpers live in lib/color.ts — everything there has to know
// what a reference looks like — and are re-exported so callers have one import.
export { colorVar, isGlobalColor, tokenId, GLOBAL_COLOR_RE } from "@/lib/color";

/**
 * The store's own colours, named once and used everywhere.
 *
 * A hex typed into a block is a copy. Twenty blocks later the brand colour
 * lives in twenty places, and changing it means finding all twenty — which is
 * why nobody changes it. A global colour is a REFERENCE: the block stores
 * `var(--gc-a1b2c3, #b4472b)` and the value lives in Site settings, so
 * repainting the store is one field.
 *
 * The hex rides along as the fallback on purpose. A page whose stylesheet has
 * not arrived, an email client, a screenshot service, a variable somebody
 * deleted — every one of them draws the colour it drew the day it was chosen
 * rather than black.
 *
 * The id is generated, not derived from the name. Renaming "Brand" to "Primary"
 * must not silently unlink every block that pointed at it.
 */

export type PaletteColor = { id: string; name: string; value: string };

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "A colour like #b4472b");

export const paletteSchema = z
  .array(
    z.object({
      // Ids are ours; anything that is not one of our ids cannot be a variable
      // name, so the shape is enforced rather than trusted.
      id: z
        .string()
        .trim()
        .regex(/^[a-z0-9]{4,12}$/, "id"),
      name: z.string().trim().min(1).max(40),
      value: hex,
    }),
  )
  // Enough for a brand, few enough to stay a palette. A list of sixty colours
  // is the problem this feature exists to solve, wearing a different hat.
  .max(24)
  .catch([]);

/** A stable id for a new colour. Same shape the schema accepts. */
export function newColorId(): string {
  const g = globalThis.crypto;
  const raw =
    g && "randomUUID" in g ? g.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2);
  return raw.replace(/[^a-z0-9]/g, "").slice(0, 8) || "c0000000";
}

/** What a block stores when it points at a global colour. */
export const colorToken = (c: PaletteColor): string => `var(${colorVar(c.id)}, ${c.value})`;

/**
 * What to paint in a swatch for a stored value.
 *
 * A `<input type="color">` cannot show a variable, so a linked colour is looked
 * up. A link whose colour has since been deleted falls back to the hex still
 * written in the token — which is exactly what the browser does with it.
 */
export function swatchColor(value: unknown, palette: readonly PaletteColor[]): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const id = tokenId(value);
  if (!id) return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : null;
  const found = palette.find((c) => c.id === id);
  if (found) return found.value;
  const fallback = /,\s*(#[0-9a-fA-F]{6})\s*\)$/.exec(value);
  return fallback ? fallback[1] : null;
}

/** The name of the global colour a value points at, if it points at one. */
export function colorName(value: unknown, palette: readonly PaletteColor[]): string | null {
  const id = tokenId(value);
  return id ? (palette.find((c) => c.id === id)?.name ?? null) : null;
}

/**
 * The palette as CSS. Empty when there is none, so nothing is shipped.
 *
 * `scope` lets the admin declare the same variables on the preview's own class
 * instead of `:root` — the builder must draw the store's colours without the
 * admin around it changing colour too.
 */
export function paletteCss(palette: readonly PaletteColor[], scope = ":root"): string {
  if (palette.length === 0) return "";
  return `${scope}{${palette
    .map((c) => `${colorVar(c.id)}:${c.value};${inkVar(c.id)}:${readableInk(c.value)}`)
    .join(";")}}`;
}
