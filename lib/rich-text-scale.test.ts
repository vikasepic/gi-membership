import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HEADING_SIZE } from "@/lib/block-style";

const css = readFileSync("app/globals.css", "utf8");

/** The `.rich h2 { font-size: … }` line, whitespace-insensitive. */
function sizeOf(tag: string): string | null {
  const m = css.match(new RegExp(`\\.rich\\s+${tag}\\s*\\{\\s*font-size:\\s*([^;}]+)`));
  return m ? m[1].trim().replace(/\s+/g, "") : null;
}

/**
 * An H2 typed into a paragraph and a Heading block set to H2 are the same size.
 *
 * They had nothing in common: heading blocks read HEADING_SIZE, and rich text
 * set no size at all — Tailwind's preflight resets headings to
 * `font-size: inherit`, so an H2 in the editor came out bold at body size and
 * read as a bold paragraph.
 *
 * The scale now lives in both a TypeScript map and a stylesheet, which is two
 * places one fact can be written. This is the line that stops them drifting.
 */
describe("headings in rich text match the heading block", () => {
  it.each(Object.keys(HEADING_SIZE))("%s is the same size in both", (tag) => {
    const fromCss = sizeOf(tag);
    expect(fromCss, `.rich ${tag} has no font-size in globals.css`).not.toBeNull();
    expect(fromCss).toBe(HEADING_SIZE[tag as "h2"].replace(/\s+/g, ""));
  });

  it("covers every level the editor can produce", () => {
    // The toolbar offers H2 and H3, but pasted HTML and the code block can
    // carry any of them, and all six are valid in stored content.
    for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      expect(sizeOf(tag), `${tag} unstyled`).not.toBeNull();
    }
  });

  it("stays layered, so a set typography value still wins", () => {
    // Site settings → Typography emits unlayered `:root h2 { font-size: … }`.
    // An unlayered rule beats a layered one whatever the specificity, so these
    // defaults must sit inside @layer or they would override what the owner
    // actually chose — silently, and only for text blocks.
    const at = css.indexOf(".rich h2");
    const layer = css.lastIndexOf("@layer base", at);
    expect(layer, "the .rich sizes are not inside @layer base").toBeGreaterThan(-1);
    // And no stray closing brace between the layer and the rule.
    expect(css.slice(layer, at)).not.toMatch(/\n\}/);
  });
});
