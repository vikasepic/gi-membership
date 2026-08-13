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
import { normalizeHex, readableInk, tint } from "@/lib/color";
import { normalizeBlocks, setStyleAt } from "@/lib/blocks";
import { bandTheme } from "@/lib/page-sections";
import { SITE_TYPOGRAPHY_SCHEMA } from "@/lib/site-typography";
import { SITE_SHELL_SCHEMA } from "@/lib/site-shell";
import { SETTINGS_SCHEMA } from "@/lib/settings-schema";
import { normalizeAccent, bumpInk } from "@/lib/bump";

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
  it("reads the hex inside the reference for arithmetic", () => {
    expect(normalizeHex(colorToken(INK), "#ffffff")).toBe("#16181f");
  });

  it("hands back the ink the palette publishes, not one frozen at render", () => {
    // The trap this closes: compute white-on-navy once, then somebody lightens
    // that global colour in settings and every button keeps a white label on a
    // pale ground. The AA promise has to survive the colour changing, so the
    // ink is a variable too — with today's answer as its fallback.
    expect(readableInk(colorToken(INK))).toBe(`var(--gc-ffff0000-ink, ${readableInk(INK.value)})`);
    expect(readableInk(colorToken(BRAND))).toBe(`var(--gc-a1b2c3d4-ink, ${readableInk(BRAND.value)})`);
  });

  it("leaves a plain colour computing exactly as it always did", () => {
    expect(readableInk("#16181f")).toBe("#ffffff");
    expect(readableInk("#ffffff")).toBe("#000000");
  });

  it("tints a reference with color-mix, because the channels are not knowable yet", () => {
    // rgba() from the fallback hex would stop following the colour, which is
    // the one thing a global colour is for.
    expect(tint(colorToken(BRAND), 0.14)).toBe(
      `color-mix(in srgb, ${colorToken(BRAND)} 14%, transparent)`,
    );
    expect(tint("#16181f", 0.5)).toBe("rgba(22, 24, 31, 0.5)");
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

  it("declares each colour, and the ink that reads on it", () => {
    expect(paletteCss([BRAND])).toBe(
      `:root{--gc-a1b2c3d4:#b4472b;--gc-a1b2c3d4-ink:${readableInk(BRAND.value)}}`,
    );
  });

  it("does that for every colour in the list", () => {
    const css = paletteCss([BRAND, INK]);
    for (const c of [BRAND, INK]) {
      expect(css).toContain(`--gc-${c.id}:${c.value}`);
      expect(css).toContain(`--gc-${c.id}-ink:${readableInk(c.value)}`);
    }
  });

  it("can be scoped, so the builder is not the admin around it", () => {
    expect(paletteCss([BRAND], ".site-type").startsWith(".site-type{")).toBe(true);
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

  it("takes its ink from the palette, so the ink follows the colour", () => {
    expect(bandTheme("navy", colorToken(BRAND)).onAccent).toBe(
      `var(--gc-a1b2c3d4-ink, ${bandTheme("navy", BRAND.value).onAccent})`,
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

/**
 * Every screen that sets a colour, and whether the link survives its save.
 *
 * Each of these has its own normalizer, and each one used to accept a hex and
 * nothing else — so a global colour would have been quietly flattened to a
 * copy. The control offers the choice on all of them now, and a field that
 * offers a choice it silently discards is worse than one that never offered it.
 */
describe("a global colour survives every save path", () => {
  const token = colorToken(BRAND);

  it("the site's own typography", () => {
    const parsed = SITE_TYPOGRAPHY_SCHEMA.parse({ body: { color: token } });
    expect(parsed.body.color).toBe(token);
  });

  it("the header and its links", () => {
    const parsed = SITE_SHELL_SCHEMA.parse({ barColor: token, linkColor: token });
    expect(parsed.barColor).toBe(token);
    expect(parsed.linkColor).toBe(token);
  });

  it("the order bump's accent, whose AA promise it must not break", () => {
    expect(normalizeAccent(token)).toBe(token);
    // The promise survives because the ink is published beside the colour
    // rather than computed once and frozen into the page.
    expect(bumpInk(normalizeAccent(token))).toBe(`var(--gc-${BRAND.id}-ink, #ffffff)`);
  });

  it("the two brand colours", () => {
    expect(SETTINGS_SCHEMA.parse({ primaryColor: token }).primaryColor).toBe(token);
  });

  it("and none of them takes anything else", () => {
    for (const bad of ["var(--anything, #fff)", "red", "rgb(0,0,0)"]) {
      expect(SITE_TYPOGRAPHY_SCHEMA.parse({ body: { color: bad } }).body.color, bad).toBe("");
      expect(SETTINGS_SCHEMA.safeParse({ primaryColor: bad }).success, bad).toBe(false);
    }
  });
});

/**
 * A guard, not a test of behaviour.
 *
 * The failure this feature keeps finding is a normalizer that predates it:
 * accept only a hex, and the picker appears to work while the link is thrown
 * away on the next read. This fails if a new colour field is added the old way.
 */
describe("no colour field is left accepting only a hex", () => {
  it("has no normalizeHex left on a stored colour", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const offenders: string[] = [];
    for (const f of readdirSync("lib")) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f === "color.ts") continue;
      const src = readFileSync(`lib/${f}`, "utf8");
      for (const line of src.split("\n")) {
        // A stored value being cleaned. `normalizeHex` is right for arithmetic
        // and wrong for storage — `normalizeColor` is the storage one.
        if (/normalizeHex\((raw|value|input|v)\b/.test(line)) offenders.push(`lib/${f}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
