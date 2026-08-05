import { describe, it, expect } from "vitest";
import {
  DEVICES,
  DEVICE_MAX,
  clearStyleAt,
  duplicateBlock,
  hasOverride,
  newBlock,
  normalizeBlocks,
  setStyleAt,
  styleFor,
  type Block,
} from "@/lib/blocks";
import { blockClass, blockRules, customCss } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";

const paper = bandTheme("paper");
const heading = () => newBlock("heading", { props: { text: "Hi", tag: "h2" } });

describe("what a device inherits", () => {
  it("is everything, until something is set on it", () => {
    const b = setStyleAt(heading(), "desktop", { size: 48 });
    for (const d of DEVICES) expect(styleFor(b, d).size, d).toBe(48);
  });

  it("is the desktop value for the one key the phone changes", () => {
    let b = setStyleAt(heading(), "desktop", { size: 48, weight: 700 });
    b = setStyleAt(b, "mobile", { size: 28 });
    expect(styleFor(b, "mobile").size).toBe(28);
    expect(styleFor(b, "mobile").weight).toBe(700);
  });

  it("is the tablet value on the phone, not the desktop one", () => {
    // The point of layering mobile on tablet: a phone is also a narrow screen,
    // so an override set for narrow screens has to reach it.
    let b = setStyleAt(heading(), "desktop", { align: "left" });
    b = setStyleAt(b, "tablet", { align: "center" });
    expect(styleFor(b, "mobile").align).toBe("center");
  });

  it("follows a later desktop edit, because the override is sparse", () => {
    let b = setStyleAt(heading(), "desktop", { size: 48, color: "#111111" });
    b = setStyleAt(b, "mobile", { size: 28 });
    b = setStyleAt(b, "desktop", { color: "#990000" });
    expect(styleFor(b, "mobile").color).toBe("#990000");
    expect(styleFor(b, "mobile").size).toBe(28);
  });
});

describe("clearing an override", () => {
  it("is not the same as retyping the desktop value", () => {
    let b = setStyleAt(heading(), "desktop", { size: 48 });
    const pinned = setStyleAt(b, "mobile", { size: 48 });
    b = clearStyleAt(pinned, "mobile", "size");
    const later = (x: Block) => styleFor(setStyleAt(x, "desktop", { size: 60 }), "mobile").size;
    expect(later(pinned)).toBe(48); // pinned: desktop edit no longer reaches it
    expect(later(b)).toBe(60);
  });

  it("takes the whole responsive object away once nothing is left", () => {
    let b = setStyleAt(heading(), "mobile", { size: 28 });
    expect(b.responsive).toBeTruthy();
    b = clearStyleAt(b, "mobile", "size");
    expect(b.responsive).toBeUndefined();
  });

  it("reports which device set a value itself", () => {
    const b = setStyleAt(heading(), "tablet", { size: 36 });
    expect(hasOverride(b, "tablet", "size")).toBe(true);
    expect(hasOverride(b, "mobile", "size")).toBe(false);
    expect(hasOverride(b, "desktop", "size")).toBe(false);
  });
});

describe("what survives a round trip through the database", () => {
  const trip = (b: Block) => normalizeBlocks(JSON.parse(JSON.stringify([b])))[0];

  it("keeps the overrides", () => {
    let b = setStyleAt(heading(), "desktop", { size: 48 });
    b = setStyleAt(b, "mobile", { size: 28, align: "center" });
    const back = trip(b);
    expect(styleFor(back, "mobile").size).toBe(28);
    expect(styleFor(back, "mobile").align).toBe("center");
    expect(styleFor(back, "desktop").align).toBe("left");
  });

  it("stays sparse — a round trip must not freeze the desktop values in", () => {
    const b = setStyleAt(setStyleAt(heading(), "desktop", { size: 48 }), "mobile", { size: 28 });
    expect(Object.keys(trip(b).responsive!.mobile)).toEqual(["size"]);
  });

  it("drops a value the desktop style would have rejected", () => {
    const raw = [{ ...heading(), responsive: { tablet: { align: "diagonal" }, mobile: {} } }];
    // Not "align: diagonal" and not a crash: the same validation desktop gets.
    expect(styleFor(normalizeBlocks(JSON.parse(JSON.stringify(raw)))[0], "tablet").align).toBe("left");
  });

  it("stores nothing at all for a block nobody made responsive", () => {
    expect(trip(heading()).responsive).toBeUndefined();
  });

  it("does not let a duplicate share its overrides with the original", () => {
    const b = setStyleAt(heading(), "mobile", { size: 28 });
    const [orig, copy] = duplicateBlock([b], b.id);
    const edited = setStyleAt(copy, "mobile", { size: 14 });
    expect(styleFor(orig, "mobile").size).toBe(28);
    expect(styleFor(edited, "mobile").size).toBe(14);
  });
});

describe("the CSS a block emits", () => {
  it("hangs off a class derived from the block id", () => {
    const b = heading();
    expect(blockClass(b)).toBe(`bk-${b.id}`);
    expect(blockRules(b, paper)).toContain(`.bk-${b.id}{`);
  });

  it("writes one media query per device that overrides something", () => {
    let b = setStyleAt(heading(), "mobile", { size: 28 });
    expect(blockRules(b, paper)).toContain(`@media (max-width:${DEVICE_MAX.mobile}px)`);
    expect(blockRules(b, paper)).not.toContain(`max-width:${DEVICE_MAX.tablet}px`);
    b = setStyleAt(b, "tablet", { size: 36 });
    expect(blockRules(b, paper)).toContain(`@media (max-width:${DEVICE_MAX.tablet}px)`);
  });

  it("puts tablet before mobile, so the phone gets the narrower answer", () => {
    let b = setStyleAt(heading(), "tablet", { size: 36 });
    b = setStyleAt(b, "mobile", { size: 28 });
    const css = blockRules(b, paper);
    expect(css.indexOf("1023px")).toBeLessThan(css.indexOf("767px"));
  });

  it("restates only what the device changes", () => {
    const b = setStyleAt(setStyleAt(heading(), "desktop", { color: "#123456" }), "mobile", { size: 28 });
    const mobile = blockRules(b, paper).split("767px")[1];
    expect(mobile).toContain("font-size:28px");
    expect(mobile).not.toContain("#123456");
  });

  it("carries the per-tag heading size, so the tag control still does something", () => {
    const h3 = newBlock("heading", { props: { text: "Hi", tag: "h3" } });
    expect(blockRules(h3, paper)).toContain("font-size:1.12rem");
  });

  it("lets a size set on the block beat the tag default", () => {
    const b = setStyleAt(heading(), "desktop", { size: 20 });
    const desktop = blockRules(b, paper).split("@media")[0];
    expect(desktop).toContain("font-size:20px");
    expect(desktop).not.toContain("clamp");
  });

  it("cannot be broken out of by a value that carries a brace", () => {
    const b = newBlock("heading");
    b.style.background = { ...b.style.background, type: "classic", color: null, image: "x');}body{display:none" };
    const css = blockRules(b, paper);
    expect(css).not.toContain("body{display:none");
    expect(css.split("{").length).toBe(css.split("}").length);
  });
});

describe("a block's own custom CSS", () => {
  const withCss = (code: string) => {
    const b = heading();
    return { ...b, style: { ...b.style, customCss: code } };
  };

  it("wraps bare declarations in the block, because that is what they look like", () => {
    expect(customCss("font-size: 20px", ".bk-x")).toBe(".bk-x{font-size: 20px}");
  });

  it("puts `selector` where the block is", () => {
    expect(customCss("selector h2 { color: red }", ".bk-x")).toBe(".bk-x h2 { color: red }");
  });

  it("replaces every mention, not just the first", () => {
    const out = customCss("selector { color: red } selector:hover { color: blue }", ".bk-x");
    expect(out.match(/\.bk-x/g)?.length).toBe(2);
  });

  it("does not treat a word that merely contains it as the token", () => {
    expect(customCss(".selectors { color: red }", ".bk-x")).toBe(".selectors { color: red }");
  });

  it("cannot close the style element it is written into", () => {
    // `</style>` inside the source would end the element and put the rest of
    // the CSS on the page as text — or worse, as markup.
    expect(customCss("selector { color: red } </style><img onerror=x>", ".bk-x")).not.toContain("</");
  });

  it("strips braces out of bare declarations, which have no business opening a rule", () => {
    expect(customCss("color: red } body ", ".bk-x")).toBe(".bk-x{color: red  body}");
  });

  it("lets someone who writes real rules write real selectors", () => {
    // Not a hole to close: the author is an admin who can write the same rule
    // in the page's own Custom CSS box. Scoping is here so a stray selector
    // does not repaint the page by accident, not to contain an attacker.
    expect(customCss("body { display: none }", ".bk-x")).toBe("body { display: none }");
  });

  it("is emitted after the responsive rules, so it can override them", () => {
    let b = withCss("selector { color: red }");
    b = setStyleAt(b, "mobile", { size: 28 });
    const css = blockRules(b, paper);
    expect(css.indexOf("767px")).toBeLessThan(css.indexOf("color: red"));
  });

  it("emits nothing at all when it is blank", () => {
    expect(blockRules(withCss("   "), paper)).not.toContain("{}");
  });
});
