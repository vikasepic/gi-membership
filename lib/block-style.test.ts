import { describe, it, expect } from "vitest";
import { contrastRatio } from "@/lib/color";
import { bandTheme, BAND_STYLE_KEYS } from "@/lib/page-sections";
import { newBlock, type Block } from "@/lib/blocks";
import {
  backgroundCss,
  blockColors,
  blockWrapperCss,
  dimCss,
  hiddenClasses,
  typographyCss,
} from "@/lib/block-style";

const paper = bandTheme("paper");
const navy = bandTheme("navy");
const plum = bandTheme("plum");

const withStyle = (type: Parameters<typeof newBlock>[0], patch: Record<string, unknown>): Block => {
  const b = newBlock(type);
  return { ...b, style: { ...b.style, ...patch } as Block["style"] };
};

describe("dimCss", () => {
  it("writes all four sides with the unit", () => {
    expect(dimCss({ t: 1, r: 2, b: 3, l: 4, u: "px", link: false })).toBe("1px 2px 3px 4px");
  });

  it("respects a non-pixel unit", () => {
    expect(dimCss({ t: 1, r: 0, b: 1, l: 0, u: "rem", link: true })).toBe("1rem 0rem 1rem 0rem");
  });
});

describe("colours follow the band", () => {
  it("a heading with no colour of its own takes the band's text colour", () => {
    expect(blockColors(newBlock("heading"), paper).fg).toBe(paper.fg);
    expect(blockColors(newBlock("heading"), navy).fg).toBe(navy.fg);
  });

  it("switching band changes it — this is the bug the prototype had", () => {
    const h = newBlock("heading");
    expect(blockColors(h, paper).fg).not.toBe(blockColors(h, navy).fg);
  });

  it("a colour someone chose is never overwritten by the band", () => {
    const h = withStyle("heading", { color: "#008060" });
    expect(blockColors(h, paper).fg).toBe("#008060");
    expect(blockColors(h, navy).fg).toBe("#008060");
  });

  it("a button fills with the band accent and labels itself readably", () => {
    for (const key of BAND_STYLE_KEYS) {
      const t = bandTheme(key);
      const c = blockColors(newBlock("button"), t);
      expect(c.fill).toBe(t.accent);
      expect(contrastRatio(c.fg, c.fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a button given its own fill still gets a readable label", () => {
    // The label has to derive from the fill, not the band: the fill is what is
    // directly behind the text and the value most likely to be overridden.
    for (const fill of ["#ffffff", "#000000", "#b0532f", "#f3dbe9", "#11325b"]) {
      const b = withStyle("button", { background: { ...newBlock("button").style.background, type: "classic", color: fill } });
      const c = blockColors(b, navy);
      expect(c.fill).toBe(fill);
      expect(contrastRatio(c.fg, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every block type reads legibly on every band", () => {
    for (const key of BAND_STYLE_KEYS) {
      const t = bandTheme(key);
      for (const type of ["heading", "text", "iconlist", "slides"] as const) {
        const c = blockColors(newBlock(type), t);
        const ground = type === "slides" ? c.fill : t.bg;
        expect(
          contrastRatio(c.fg, ground),
          `${type} on ${key} (${c.fg} on ${ground})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("a divider is a hairline from the band, not a fixed light grey", () => {
    expect(blockColors(newBlock("divider"), navy).fg).toBe(navy.rule);
    expect(blockColors(newBlock("divider"), paper).fg).toBe(paper.rule);
  });

  it("icons take the band accent, so Navy's accent is not Paper's", () => {
    expect(blockColors(newBlock("iconlist"), navy).accent).toBe(navy.accent);
    expect(blockColors(newBlock("iconlist"), navy).accent).not.toBe(blockColors(newBlock("iconlist"), paper).accent);
  });
});

describe("backgroundCss", () => {
  const bg = newBlock("text").style.background;

  it("renders nothing when the type is none", () => {
    expect(backgroundCss({ ...bg, type: "none", color: "#fff" }, paper)).toEqual({});
  });

  it("renders a classic colour", () => {
    expect(backgroundCss({ ...bg, type: "classic", color: "#f1efe9" }, paper).backgroundColor).toBe("#f1efe9");
  });

  it("renders an image with its size, position and repeat", () => {
    const css = backgroundCss({ ...bg, type: "classic", image: "https://x.test/a.jpg" }, paper);
    expect(css.backgroundImage).toBe("url('https://x.test/a.jpg')");
    expect(css.backgroundSize).toBe("cover");
    expect(css.backgroundRepeat).toBe("no-repeat");
  });

  it("cannot be broken out of with a quote in the image value", () => {
    // The value lands inside url('…'). A quote here would end the URL and let
    // whatever follows become another declaration.
    const css = backgroundCss({ ...bg, type: "classic", image: "a.jpg');background:url('evil" }, paper);
    expect(css.backgroundImage).not.toContain("evil');");
    expect(String(css.backgroundImage).match(/'/g)).toHaveLength(2);
  });

  it("renders a linear gradient with both stops", () => {
    const css = backgroundCss({ ...bg, type: "gradient", from: "#11325b", to: "#832a63", angle: 90 }, paper);
    expect(css.backgroundImage).toBe("linear-gradient(90deg, #11325b 0%, #832a63 100%)");
  });

  it("renders a radial gradient without an angle", () => {
    const css = backgroundCss({ ...bg, type: "gradient", shape: "radial", from: "#000000", to: "#ffffff" }, paper);
    expect(css.backgroundImage).toContain("radial-gradient(circle at center");
    expect(css.backgroundImage).not.toContain("deg");
  });

  it("falls back to band colours for a gradient with no colours chosen", () => {
    const css = backgroundCss({ ...bg, type: "gradient" }, navy);
    expect(css.backgroundImage).toContain(navy.accent);
    expect(css.backgroundImage).toContain(navy.panel);
  });
});

describe("typographyCss", () => {
  it("leaves out everything unset, so the theme supplies it", () => {
    expect(typographyCss(newBlock("heading").style)).toEqual({});
  });

  it("emits only what was overridden", () => {
    const css = typographyCss({ ...newBlock("heading").style, size: 28, weight: 700 });
    expect(css).toEqual({ fontSize: "28px", fontWeight: 700 });
  });

  it("emits a text transform only when it is not none", () => {
    expect(typographyCss({ ...newBlock("heading").style, transform: "uppercase" }).textTransform).toBe("uppercase");
  });
});

describe("blockWrapperCss", () => {
  it("writes the box model", () => {
    const css = blockWrapperCss(newBlock("text"), paper);
    expect(css.margin).toBe("0px 0px 16px 0px");
    expect(css.padding).toBe("0px 0px 0px 0px");
  });

  it("caps the measure unless the width is full", () => {
    expect(blockWrapperCss(withStyle("text", { width: "narrow" }), paper).maxWidth).toBe("38ch");
    expect(blockWrapperCss(withStyle("text", { width: "full" }), paper).maxWidth).toBeUndefined();
  });

  it("centres with auto side margins, which the shorthand would otherwise eat", () => {
    const css = blockWrapperCss(withStyle("text", { align: "center", width: "narrow" }), paper);
    expect(css.marginLeft).toBe("auto");
    expect(css.marginRight).toBe("auto");
    expect(css.textAlign).toBe("center");
  });

  it("rounds the corner only when there is a background to round", () => {
    expect(blockWrapperCss(withStyle("text", { radius: 20 }), paper).borderRadius).toBeUndefined();
    const filled = withStyle("text", {
      radius: 20,
      background: { ...newBlock("text").style.background, type: "classic", color: "#eeeeee" },
    });
    expect(blockWrapperCss(filled, paper).borderRadius).toBe("20px");
  });
});

describe("hiddenClasses", () => {
  it("is empty when the block shows everywhere", () => {
    expect(hiddenClasses(newBlock("text"))).toBe("");
  });

  it("emits a class per hidden breakpoint", () => {
    const b = newBlock("text");
    const hidden = { ...b, style: { ...b.style, hideMobile: true, hideDesktop: true } };
    expect(hiddenClasses(hidden).split(" ").sort()).toEqual(["lg:hidden", "max-md:hidden"]);
  });
});

describe("colours that come from props are validated", () => {
  const iconlist = (iconColor: unknown): Block => {
    const b = newBlock("iconlist");
    return { ...b, props: { ...b.props, iconColor } };
  };

  it("uses an icon colour someone chose", () => {
    expect(blockColors(iconlist("#008060"), paper).accent).toBe("#008060");
  });

  it("falls back to the band accent when unset", () => {
    expect(blockColors(iconlist(null), navy).accent).toBe(navy.accent);
  });

  it("refuses anything that is not a hex value", () => {
    // props are not schema-checked the way style is, and this lands in a style
    // attribute.
    for (const junk of ["red;background:url(x)", "javascript:1", 42, {}, "expression(alert(1))"]) {
      expect(blockColors(iconlist(junk), paper).accent).toBe(paper.accent);
    }
  });
});
