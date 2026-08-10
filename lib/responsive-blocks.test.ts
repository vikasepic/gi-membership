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
import { blocksForSection } from "@/lib/section-to-blocks";

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
    let b = setStyleAt(heading(), "desktop", { textAlign: "left" });
    b = setStyleAt(b, "tablet", { textAlign: "center" });
    expect(styleFor(b, "mobile").textAlign).toBe("center");
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
    b = setStyleAt(b, "mobile", { size: 28, textAlign: "center" });
    const back = trip(b);
    expect(styleFor(back, "mobile").size).toBe(28);
    expect(styleFor(back, "mobile").textAlign).toBe("center");
    expect(styleFor(back, "desktop").textAlign).toBe("left");
  });

  it("stays sparse — a round trip must not freeze the desktop values in", () => {
    const b = setStyleAt(setStyleAt(heading(), "desktop", { size: 48 }), "mobile", { size: 28 });
    expect(Object.keys(trip(b).responsive!.mobile.style)).toEqual(["size"]);
    expect(trip(b).responsive!.mobile.props).toEqual({});
  });

  it("drops a value the desktop style would have rejected", () => {
    const raw = [{ ...heading(), responsive: { tablet: { textAlign: "diagonal" }, mobile: {} } }];
    // Not "align: diagonal" and not a crash: the same validation desktop gets.
    expect(styleFor(normalizeBlocks(JSON.parse(JSON.stringify(raw)))[0], "tablet").textAlign).toBe("left");
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
  it("hangs off a class derived from the block id, written twice", () => {
    // The element carries the class once; the rule names it twice. That is the
    // whole of the specificity fix: 0-2-0 beats the site-wide `:root h1` rules
    // (0-1-1) that are about to exist, without an !important anywhere.
    const b = heading();
    expect(blockClass(b)).toBe(`bk-${b.id}`);
    expect(blockRules(b, paper)).toContain(`.bk-${b.id}.bk-${b.id}{`);
  });

  it("changes nothing but the selector — every declaration is where it was", () => {
    // The doubling must be invisible. This block exercises every emitter that
    // takes the selector: the desktop rule, both media queries, the mobile
    // padding cap, the row's column rules and the block's own custom CSS. Undo
    // the doubling textually and what is left is what the single class emitted,
    // captured before the change.
    let b = newBlock("row", { props: { widths: [60, 40], gap: 24 } });
    b.id = "cap2";
    b = setStyleAt(b, "desktop", { padding: { t: 0, r: 160, b: 0, l: 160, u: "px", link: false } });
    b = setStyleAt(b, "tablet", { textAlign: "center" });
    b = setStyleAt(b, "mobile", { transform: "uppercase" });
    b = { ...b, style: { ...b.style, customCss: "selector h2 { color: red }" } };

    const collapsed = blockRules(b, paper).replaceAll(".bk-cap2.bk-cap2", ".bk-cap2");
    expect(collapsed).toBe(
      ".bk-cap2{margin:0px 0px 16px 0px;padding:0px 160px 0px 160px;text-align:left;color:#16181f}" +
        "@media (max-width:1023px){.bk-cap2{text-align:center}}" +
        "@media (max-width:767px){.bk-cap2{text-transform:uppercase}}" +
        "@media (max-width:767px){.bk-cap2{padding-left:min(160px,6vw);padding-right:min(160px,6vw)}}" +
        ".bk-cap2 > [data-row]{display:flex;flex-wrap:wrap;gap:24px;align-items:stretch}" +
        ".bk-cap2 > [data-row] > :nth-child(1){min-width:0;width:calc(60% - 9.6px);order:0}" +
        ".bk-cap2 > [data-row] > :nth-child(2){min-width:0;width:calc(40% - 14.4px);order:1}" +
        "@media (max-width:767px){.bk-cap2 > [data-row] > :nth-child(1){width:calc(100% - 0px)}" +
        ".bk-cap2 > [data-row] > :nth-child(2){width:calc(100% - 0px)}}" +
        ".bk-cap2 h2 { color: red }",
    );
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

  it("lets a size set on the block beat the tag default, at the width it was set", () => {
    // The size still wins over the tag default — it is emitted after it, at the
    // same specificity. What changed is where: the block's own typography now
    // lives in a desktop-width query rather than the unscoped rule, so it is
    // the tag default and the site's `:root h2` that answer on a phone.
    const b = setStyleAt(heading(), "desktop", { size: 20 });
    const css = blockRules(b, paper);
    const frame = css.split("@media")[0];
    expect(frame).toContain("clamp");
    expect(frame).not.toContain("font-size:20px");
    expect(css).toContain("@media (min-width:1024px)");
    expect(css.indexOf("clamp")).toBeLessThan(css.indexOf("font-size:20px"));
  });

  it("stops a desktop-only size reaching the phone, so the site's own can", () => {
    // The reason for the min-width query. `styleFor` still layers desktop down
    // — the panel has to show what the phone renders — but the stylesheet says
    // nothing about size below 1024px unless that width was given one.
    const b = setStyleAt(heading(), "desktop", { size: 20 });
    expect(styleFor(b, "mobile").size).toBe(20);
    expect(blockRules(b, paper)).not.toContain("max-width:");
  });

  it("says it again at a width that was given its own value", () => {
    const b = setStyleAt(setStyleAt(heading(), "desktop", { size: 20 }), "mobile", { size: 14 });
    const css = blockRules(b, paper);
    expect(css).toContain(`@media (max-width:${DEVICE_MAX.mobile}px){.bk-${b.id}.bk-${b.id}{font-size:14px}}`);
    // Nothing to undo and nothing to restate: the desktop rule was never in
    // force here. `revert` would have rolled back the site rules as well.
    expect(css).not.toContain("revert");
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

describe("blocks stored before a field existed", () => {
  it("still render, because reading normalizes them", () => {
    // Exactly the shape on the live store: saved months ago, so no customCss
    // and no responsive. A cast would have promised both and blockRules would
    // have thrown on the first one it read.
    const old = {
      id: "b_old1",
      type: "heading",
      props: { text: "Hi", tag: "h2" },
      style: { margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false }, textAlign: "left" },
    };
    const view = {
      def: { key: "hero", label: "Hero" },
      stored: { blocks: [old] },
    } as unknown as Parameters<typeof blocksForSection>[0];
    const [block] = blocksForSection(view);
    expect(block.style.customCss).toBe("");
    expect(() => blockRules(block, paper)).not.toThrow();
  });
});
