import { describe, it, expect } from "vitest";
import {
  colorName,
  colorToken,
  newColorId,
  paletteCss,
  paletteSchema,
  swatchColor,
  tokenId,
  type PaletteColor,
} from "@/lib/palette";
import { normalizeHex, readableInk } from "@/lib/color";
import { normalizeBlocks, setStyleAt } from "@/lib/blocks";
import { bandTheme } from "@/lib/page-sections";

const BRAND: PaletteColor = { id: "a1b2c3d4", name: "Brand", value: "#b4472b" };
const INK: PaletteColor = { id: "ffff0000", name: "Ink", value: "#16181f" };

describe("what a block stores when it takes a global colour", () => {
  it("is a reference with the hex still in it", () => {
    // Both halves matter. The variable is what makes changing the colour once
    // change every page; the hex is what the browser draws if the stylesheet
    // never arrives, which is the difference between a brand colour and black.
    expect(colorToken(BRAND)).toBe("var(--gc-a1b2c3d4, #b4472b)");
    expect(tokenId(colorToken(BRAND))).toBe("a1b2c3d4");
  });

  it("is not confused with a plain colour", () => {
    expect(tokenId("#b4472b")).toBe(null);
    expect(tokenId("")).toBe(null);
    expect(tokenId(null)).toBe(null);
  });

  it("survives a save and a reload", () => {
    // The trap this repo has been caught by before: a normalizer that accepts
    // only the old shape silently drops the new one, so the picker works, the
    // page draws it once, and it is gone after a refresh.
    const b = normalizeBlocks([{ id: "b1", type: "heading", props: { text: "x" } }])[0];
    const linked = setStyleAt(b, "desktop", { color: colorToken(BRAND) });
    expect(normalizeBlocks([linked])[0].style.color).toBe(colorToken(BRAND));
  });

  it("still refuses anything that is not one of ours", () => {
    const b = normalizeBlocks([{ id: "b1", type: "heading", props: { text: "x" } }])[0];
    for (const bad of ["var(--anything, #fff)", "url(x)", "red; background:url(y)", "var(--gc-a1b2c3d4)"]) {
      const dirty = { ...b, style: { ...b.style, color: bad } };
      expect(normalizeBlocks([dirty])[0].style.color, bad).toBe(null);
    }
  });
});

describe("colours derived from a global one", () => {
  it("are worked out from the hex inside the reference, not from a fallback", () => {
    // A button filled with a dark brand colour must get light text. Reading the
    // token as "not a colour" would compute the ink from the fallback argument
    // instead and put black on navy.
    expect(normalizeHex(colorToken(INK), "#ffffff")).toBe("#16181f");
    expect(readableInk(colorToken(INK))).toBe(readableInk(INK.value));
    expect(readableInk(colorToken(BRAND))).toBe(readableInk(BRAND.value));
  });
});

describe("the swatch the panel paints", () => {
  const palette = [BRAND, INK];

  it("looks the colour up when the value is a link", () => {
    expect(swatchColor(colorToken(BRAND), palette)).toBe("#b4472b");
    expect(colorName(colorToken(BRAND), palette)).toBe("Brand");
  });

  it("falls back to the hex in the token when the colour has been deleted", () => {
    // Exactly what the browser does with it, so the panel and the page agree.
    expect(swatchColor("var(--gc-deadbeef, #123456)", palette)).toBe("#123456");
    expect(colorName("var(--gc-deadbeef, #123456)", palette)).toBe(null);
  });

  it("shows a plain colour as itself, and nothing for nothing", () => {
    expect(swatchColor("#abcdef", palette)).toBe("#abcdef");
    expect(swatchColor(null, palette)).toBe(null);
  });
});

describe("the palette as CSS", () => {
  it("ships nothing when there is nothing", () => {
    expect(paletteCss([])).toBe("");
  });

  it("declares each colour under the name blocks point at", () => {
    expect(paletteCss([BRAND, INK])).toBe(":root{--gc-a1b2c3d4:#b4472b;--gc-ffff0000:#16181f}");
  });

  it("can be scoped, so the builder is not the admin around it", () => {
    expect(paletteCss([BRAND], ".site-type")).toBe(".site-type{--gc-a1b2c3d4:#b4472b}");
  });
});

describe("what may be saved", () => {
  it("takes a well-formed list", () => {
    expect(paletteSchema.parse([BRAND])).toEqual([BRAND]);
  });

  it("never throws — a bad blob narrows to no palette rather than failing a save", () => {
    expect(paletteSchema.parse("nonsense")).toEqual([]);
    expect(paletteSchema.parse([{ id: "!!", name: "x", value: "#fff000" }])).toEqual([]);
    expect(paletteSchema.parse([{ id: "a1b2c3d4", name: "x", value: "notacolour" }])).toEqual([]);
  });

  it("gives every new colour an id the schema accepts", () => {
    for (let i = 0; i < 20; i++) {
      expect(paletteSchema.parse([{ id: newColorId(), name: "x", value: "#000000" }])).toHaveLength(1);
    }
  });
});

/**
 * A band's accent is the one colour outside the block tree, and it has to make
 * the same round trip: stored as a link, drawn as a link, and still able to
 * answer "what ink is readable on this".
 */
describe("a band accent that follows a global colour", () => {
  it("draws the reference, so changing the colour repaints the band", () => {
    const theme = bandTheme("navy", colorToken(BRAND));
    expect(theme.accent).toBe(colorToken(BRAND));
  });

  it("still picks its ink from the colour behind the reference", () => {
    // Not from a fallback, and not from the band's own accent — a pale global
    // colour needs dark ink on it whichever way it was written.
    expect(bandTheme("navy", colorToken(BRAND)).onAccent).toBe(
      bandTheme("navy", BRAND.value).onAccent,
    );
  });

  it("leaves a plain hex exactly as it was", () => {
    expect(bandTheme("navy", "#123456").accent).toBe("#123456");
    expect(bandTheme("navy", null).accent).toBe(bandTheme("navy").accent);
  });

  it("refuses anything that is not a colour or one of ours", () => {
    // The value reaches a style attribute; "the band's own" is the safe answer.
    const own = bandTheme("navy").accent;
    for (const bad of ["var(--anything, #fff)", "url(x)", "red;background:url(y)"]) {
      expect(bandTheme("navy", bad).accent, bad).toBe(own);
    }
  });
});
