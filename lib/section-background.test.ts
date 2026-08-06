import { describe, it, expect } from "vitest";
import { normalizeBackground, emptyBackground } from "@/lib/blocks";
import { backgroundCss } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";
import { readFileSync } from "node:fs";

const theme = bandTheme("navy");

// A section's look was a preset and nothing else: six bands, each pairing a
// ground with ink that stays readable on it. Good as a default, and a wall the
// moment someone wants a photograph behind a hero.

describe("a band with a picture behind it", () => {
  it("keeps the band's own colour underneath", () => {
    // An image that has not arrived yet leaves the preset showing rather than
    // a white void, and the ink is still the band's, so the words survive it.
    const src = readFileSync("components/page/sales-page.tsx", "utf8");
    expect(src).toContain("background: view.theme.bg, color: view.theme.fg, ...painted");
  });

  it("draws nothing when there is nothing set", () => {
    const src = readFileSync("components/page/sales-page.tsx", "utf8");
    expect(src).toContain('bg && bg.type !== "none" ? backgroundCss');
  });

  it("resolves a library path to a real URL", () => {
    const css = backgroundCss(
      { ...emptyBackground(), type: "classic", image: "library/1786-photo.webp" },
      theme,
    );
    expect(String(css.backgroundImage)).toContain("/storage/v1/object/public/public-media/");
  });

  it("darkens without a second element", () => {
    const css = backgroundCss(
      { ...emptyBackground(), type: "classic", image: "x.webp", overlay: 55 },
      theme,
    );
    expect(String(css.backgroundImage)).toContain("rgba(0,0,0,0.55)");
  });

  it("uses the same shape a block's background does", () => {
    // One renderer, one set of rules — a second would drift.
    const b = normalizeBackground({ type: "classic", image: "a.webp", overlay: 30 });
    expect(b.type).toBe("classic");
    expect(b.overlay).toBe(30);
  });
});

describe("what is stored", () => {
  it("keeps null when the band is left alone", () => {
    // A row of defaults on every section of every page, for nothing.
    const src = readFileSync("lib/pages.ts", "utf8");
    expect(src).toContain('input.background && input.background.type !== "none"');
  });

  it("survives a background nobody can parse", () => {
    // Refusing the whole save would lose the section's copy along with it.
    const src = readFileSync("app/admin/pages/actions.ts", "utf8");
    expect(src).toContain("function parseBackground");
    expect(src).toContain("catch");
  });
});

describe("reaching it", () => {
  it("is in the section panel, not hidden behind a block selection", () => {
    const src = readFileSync("components/admin/section-settings.tsx", "utf8");
    expect(src).toContain("Choose an image");
    expect(src).toContain("Darken");
  });

  it("has a row in the structure tree", () => {
    // The panel shows the band when nothing is selected, which a tree of blocks
    // gives you no way to ask for.
    const src = readFileSync("components/admin/block-tree.tsx", "utf8");
    expect(src).toContain("onSelectSection");
    expect(src).toContain("band, colour, visibility");
  });
});

describe("deleting asks first", () => {
  it.each([
    ["a block", "components/admin/block-editor.tsx", "Delete it"],
    ["a product", "components/admin/product-form.tsx", "ConfirmSubmit"],
    ["an offer", "components/admin/offer-form.tsx", "ConfirmSubmit"],
  ])("%s", (_what, file, needle) => {
    expect(readFileSync(file, "utf8")).toContain(needle);
  });

  it("says what the second click will do", () => {
    // "Are you sure?" is a question about your confidence. The button should
    // say what happens.
    const src = readFileSync("components/admin/product-form.tsx", "utf8");
    expect(src).toContain("Delete it, and everything it sells");
  });

  it("disarms when the selection moves", () => {
    // A pending "Delete it" must never land on a block you have since clicked.
    // In an effect, because selection moves from the canvas, from the tree and
    // from a drop — a reset in each handler covers whichever ones someone
    // remembered.
    expect(readFileSync("components/admin/block-editor.tsx", "utf8")).toContain(
      "useEffect(() => setConfirmDelete(false), [selectedId])",
    );
  });
});

describe("a block standing on its own picture", () => {
  it("does not paint a panel over it", () => {
    // The wrapper draws the image; several blocks then draw a panel inside it.
    // With no image that panel IS the block's surface. With one, it is an
    // opaque sheet over the picture — so the setting appears to do nothing and
    // the default colour appears not to have gone.
    const src = readFileSync("lib/block-style.ts", "utf8");
    expect(src).toContain("function ownBackdrop");
    expect(src).toContain('ownBackdrop(s) ? "transparent" : theme.panel');
  });

  it("still honours a colour someone set on purpose", () => {
    // Both a colour and an image means they wanted the colour; the wrapper
    // draws them together.
    expect(readFileSync("lib/block-style.ts", "utf8")).toContain(
      "fill: s.background.color ?? panel",
    );
  });
});
