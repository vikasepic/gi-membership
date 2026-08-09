import { describe, it, expect } from "vitest";
import { safeFamily, fontFaceCss, familyStack } from "@/lib/fonts";
import { GOOGLE_FAMILIES, GOOGLE_FONTS, BUILT_IN_FONTS } from "@/lib/fonts-catalogue";

/**
 * A family name typed by a person ends up inside a stylesheet, twice — in an
 * @font-face block and in a font-family declaration. Everything here is about
 * that trip.
 */

describe("a family name on its way into CSS", () => {
  it("strips what would end the declaration", () => {
    // `"` closes the string and `}` closes the rule; what follows is whatever
    // the person typed, as CSS.
    expect(safeFamily('Inter"; } body { display:none } .x{"')).toBe("Inter  body  displaynone  x");
    expect(safeFamily("Font<script>")).toBe("Fontscript");
  });

  it("keeps what a real typeface name needs", () => {
    expect(safeFamily("Plus Jakarta Sans")).toBe("Plus Jakarta Sans");
    expect(safeFamily("Source Serif 4")).toBe("Source Serif 4");
    expect(safeFamily("Bricolage Grotesque")).toBe("Bricolage Grotesque");
  });

  it("falls back rather than emitting an empty family", () => {
    // `font-family: "", system-ui` is a parse error that takes the whole
    // declaration with it.
    expect(familyStack("", "system-ui")).toBe("system-ui");
    expect(familyStack(null, "system-ui")).toBe("system-ui");
    expect(familyStack("Lora", "system-ui")).toBe('"Lora", system-ui');
  });
});

describe("the faces we emit", () => {
  const font = {
    id: "f1",
    family: "Lora",
    source: "google" as const,
    files: [
      { weight: 400, style: "normal" as const, path: "fonts/lora/400-normal.woff2" },
      { weight: 700, style: "italic" as const, path: "fonts/lora/700-italic.woff2" },
    ],
  };

  it("points at our own origin, never Google's", () => {
    // The whole reason the files are downloaded at install time.
    const css = fontFaceCss([font], "https://grow-api.greaterinside.com");
    expect(css).toContain("https://grow-api.greaterinside.com/storage/v1/object/public/public-media/fonts/lora/400-normal.woff2");
    expect(css).not.toContain("fonts.gstatic.com");
    expect(css).not.toContain("googleapis");
  });

  it("keeps weight and style on the face they belong to", () => {
    const css = fontFaceCss([font], "https://x.test");
    expect(css).toContain("font-style:normal;font-weight:400");
    expect(css).toContain("font-style:italic;font-weight:700");
  });

  it("always swaps rather than hiding the text", () => {
    // The alternative is invisible words while a file downloads.
    expect(fontFaceCss([font], "https://x.test")).toContain("font-display:swap");
  });

  it("names the format from the file, so a ttf is not called woff2", () => {
    const ttf = { ...font, files: [{ weight: 400, style: "normal" as const, path: "fonts/x/400-normal.ttf" }] };
    expect(fontFaceCss([ttf], "https://x.test")).toContain('format("truetype")');
  });
});

describe("the catalogue", () => {
  it("has no duplicates across its groups", () => {
    // A family in two groups appears twice in the picker.
    expect(new Set(GOOGLE_FAMILIES).size).toBe(GOOGLE_FAMILIES.length);
  });

  it("only lists names that survive sanitising", () => {
    // Otherwise the name shown in the picker is not the name installed, and
    // the setting silently refers to a family that does not exist.
    for (const f of GOOGLE_FAMILIES) expect(safeFamily(f)).toBe(f);
  });

  it("gives every group at least one family", () => {
    for (const g of GOOGLE_FONTS) expect(g.families.length).toBeGreaterThan(0);
  });

  it("offers the fonts the site already ships with", () => {
    for (const f of BUILT_IN_FONTS) expect(GOOGLE_FAMILIES).toContain(f);
  });
});
