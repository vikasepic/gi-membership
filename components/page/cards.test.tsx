import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { blockRules } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks, setPropsAt, setStyleAt, type Block } from "@/lib/blocks";
import { sanitizeBlocks } from "@/lib/sanitize-html";

// The cards block, and the settings added to it after pages were already using
// it. Every one of those settings is null or a "as it was" default, and this
// file's first job is to prove that: the goldens below were captured from the
// renderer BEFORE any of them existed, so a byte of drift fails here.

const theme = bandTheme("paper");

/** What an old row literally looks like: props, and not one of the new keys. */
const stored = (props: Record<string, unknown>): Block =>
  normalizeBlocks([{ id: "b1", type: "cards", props }])[0];

/**
 * The goldens below are the card block and nothing else, byte for byte.
 *
 * The last block in a flow now has its bottom margin zeroed — it separates
 * itself from nothing, and that dead space is what made the foot of a section
 * look mis-padded. A fixture of one block is always the last block, so these
 * would all have had to be re-baselined to keep passing, which is the one thing
 * a golden must never be asked to do.
 *
 * So the fixture gets a sibling after it and the sibling's markup is cut back
 * off. The card is then rendered exactly as a card in the middle of a page is,
 * the strings below are untouched from the original capture, and the trailing
 * margin has its own test rather than being folded into these.
 */
const TAIL_ID = "tail-sentinel";
const render = (b: Block) => {
  const tail = normalizeBlocks([{ id: TAIL_ID, type: "spacer", props: { height: 8 } }]);
  const out = renderToStaticMarkup(<Blocks blocks={[b, ...tail]} theme={theme} />);
  const cut = out.indexOf(`<style>.bk-${TAIL_ID}`);
  if (cut === -1) throw new Error("the sentinel did not render — the cut below is measuring nothing");
  // Everything before the sibling, plus the wrapper's own closing tag.
  return `${out.slice(0, cut)}</div>`;
};

const ITEMS = [
  { title: "One", body: "First", amount: "£9", icon: '<svg viewBox="0 0 2 2"><path d="M0 0"/></svg>' },
  { title: "Two", body: "Second", amount: "", icon: "https://x.test/a.png" },
];

const legacy = (over: Record<string, unknown> = {}) =>
  stored({ items: ITEMS, columns: 2, numbered: true, title: "T", note: "N", ...over });

describe("a cards block saved before any of the new settings existed", () => {
  it("renders the boxed grid byte for byte as it did", () => {
    // Captured from the renderer at the commit before the settings landed. Not
    // a snapshot file on purpose: a snapshot that can be updated with a flag is
    // no defence at all against the thing this is guarding, which is a default
    // that quietly repaints every card on every live page.
    expect(render(legacy({ skin: "boxed", numberStyle: "eyebrow" }))).toBe(
      '<link rel="preload" as="image" href="https://x.test/a.png"/><div class="mt-7 flex flex-col"><style>.bk-b1.bk-b1{margin:0px 0px 16px 0px;padding:0px 0px 0px 0px;text-align:left;color:#16181f}</style><div class="bk-b1"><div class="grid grid-cols-1 @xl:grid-cols-[var(--cards)]" style="--cards:repeat(2, minmax(0,1fr));gap:1rem"><div style="background:#f4f2ec;border:1px solid rgba(22, 24, 31, 0.14);border-radius:16px;padding:1.35rem 1.4rem"><span aria-hidden="true" class="mb-3 grid place-content-center" style="width:44px;height:44px;border-radius:11px;background:#b0532f;color:#ffffff"><span style="display:grid;width:22px;height:22px"><svg viewBox="0 0 2 2"><path d="M0 0"/></svg></span></span><span class="font-display text-[0.72rem] font-bold tracking-[0.14em]" style="color:#b0532f">01</span><h3 class="font-display font-semibold" style="color:#16181f;font-size:1.02rem;margin-top:.45rem;margin-bottom:.4rem"><span>One</span></h3><p class="text-[0.88rem] leading-relaxed" style="color:rgba(22, 24, 31, 0.72)"><span>First</span></p><p class="mt-3 font-display font-bold" style="color:#16181f;font-size:1.05rem">£9</p></div><div style="background:#f4f2ec;border:1px solid rgba(22, 24, 31, 0.14);border-radius:16px;padding:1.35rem 1.4rem"><span aria-hidden="true" class="mb-3 grid place-content-center" style="width:44px;height:44px;border-radius:11px;background:#b0532f;color:#ffffff"><img src="https://x.test/a.png" alt="" style="width:22px;height:22px;object-fit:contain"/></span><span class="font-display text-[0.72rem] font-bold tracking-[0.14em]" style="color:#b0532f">02</span><h3 class="font-display font-semibold" style="color:#16181f;font-size:1.02rem;margin-top:.45rem;margin-bottom:.4rem"><span>Two</span></h3><p class="text-[0.88rem] leading-relaxed" style="color:rgba(22, 24, 31, 0.72)"><span>Second</span></p></div></div></div></div>',
    );
  });

  it("renders the inline-number grid byte for byte as it did", () => {
    // The other grid branch: its own gap, its own tree, and no amount.
    expect(render(legacy({ skin: "tinted", numberStyle: "inline" }))).toBe(
      '<link rel="preload" as="image" href="https://x.test/a.png"/><div class="mt-7 flex flex-col"><style>.bk-b1.bk-b1{margin:0px 0px 16px 0px;padding:0px 0px 0px 0px;text-align:left;color:#16181f}</style><div class="bk-b1"><div class="grid grid-cols-1 @xl:grid-cols-[var(--cards)]" style="--cards:repeat(2, minmax(0,1fr));gap:1.6rem"><div style="background:rgba(176, 83, 47, 0.12);border-radius:3px;padding:1.6rem 1.7rem"><span aria-hidden="true" class="mb-3 grid place-content-center" style="width:44px;height:44px;border-radius:11px;background:#b0532f;color:#ffffff"><span style="display:grid;width:22px;height:22px"><svg viewBox="0 0 2 2"><path d="M0 0"/></svg></span></span><div class="flex items-baseline gap-2"><span class="font-display font-bold tabular-nums" style="color:#b0532f;font-size:1rem">01</span><h3 class="font-display font-semibold" style="color:#16181f;font-size:1.02rem"><span>One</span></h3></div><p class="mt-2 text-[0.9rem] leading-relaxed" style="color:rgba(22, 24, 31, 0.72);padding-left:1.9rem"><span>First</span></p></div><div style="background:rgba(176, 83, 47, 0.12);border-radius:3px;padding:1.6rem 1.7rem"><span aria-hidden="true" class="mb-3 grid place-content-center" style="width:44px;height:44px;border-radius:11px;background:#b0532f;color:#ffffff"><img src="https://x.test/a.png" alt="" style="width:22px;height:22px;object-fit:contain"/></span><div class="flex items-baseline gap-2"><span class="font-display font-bold tabular-nums" style="color:#b0532f;font-size:1rem">02</span><h3 class="font-display font-semibold" style="color:#16181f;font-size:1.02rem"><span>Two</span></h3></div><p class="mt-2 text-[0.9rem] leading-relaxed" style="color:rgba(22, 24, 31, 0.72);padding-left:1.9rem"><span>Second</span></p></div></div></div></div>',
    );
  });

  it("renders the one-card skin byte for byte as it did", () => {
    // Its own early return, and the only branch that shows title and note.
    expect(render(legacy({ skin: "list" }))).toBe(
      '<div class="mt-7 flex flex-col"><style>.bk-b1.bk-b1{margin:0px 0px 16px 0px;padding:0px 0px 0px 0px;text-align:left;color:#16181f}</style><div class="bk-b1"><div style="border:1px solid rgba(22, 24, 31, 0.14);border-radius:20px;padding:1.35rem"><div class="mb-3 text-[0.68rem] uppercase tracking-[0.13em]" style="color:rgba(22, 24, 31, 0.72)">T</div><div class="flex flex-col gap-2"><div class="flex items-baseline gap-3" style="background:#f4f2ec;border-radius:10px;padding:0.72rem 0.95rem"><span class="text-[0.72rem] tabular-nums" style="color:rgba(22, 24, 31, 0.72)">01</span><span class="min-w-0"><span style="color:#16181f;font-size:0.88rem"><span>One</span></span><span class="mt-0.5 block text-[0.78rem] leading-snug" style="color:rgba(22, 24, 31, 0.72)"><span>First</span></span></span></div><div class="flex items-baseline gap-3" style="background:#f4f2ec;border-radius:10px;padding:0.72rem 0.95rem"><span class="text-[0.72rem] tabular-nums" style="color:rgba(22, 24, 31, 0.72)">02</span><span class="min-w-0"><span style="color:#16181f;font-size:0.88rem"><span>Two</span></span><span class="mt-0.5 block text-[0.78rem] leading-snug" style="color:rgba(22, 24, 31, 0.72)"><span>Second</span></span></span></div></div><p class="mt-3 text-[0.82rem] leading-relaxed" style="background:#f4f2ec;border-radius:10px;padding:0.72rem 0.95rem;color:#16181f">N</p></div></div></div>',
    );
  });

  it("adds nothing to the stylesheet", () => {
    // Across became per-device, which means cards can now emit rules of their
    // own. A block nobody made responsive must emit none of them, or every
    // sales page grows a rule per cards block for a value nothing changed.
    expect(blockRules(legacy(), theme)).toBe(
      ".bk-b1.bk-b1{margin:0px 0px 16px 0px;padding:0px 0px 0px 0px;text-align:left;color:#16181f}",
    );
  });
});

describe("the media switch", () => {
  const withImage = [{ title: "One", icon: "<svg/>", image: "pages/x/a.png" }];

  it("shows the pasted icon and ignores the picture until it is asked to", () => {
    const out = render(stored({ items: withImage, media: "icon" }));
    expect(out).toContain("<svg");
    expect(out).not.toContain("a.png");
  });

  it("shows the picture from the library in the same tile", () => {
    const out = render(stored({ items: withImage, media: "image" }));
    // Through imageSrc like every other image on a page, so a bucket path and a
    // pasted address both work — and inside the tile, not beside it.
    expect(out).toContain('class="mb-3 grid place-content-center"');
    expect(out).toContain("/public-media/pages/x/a.png");
    expect(out).not.toContain("<svg");
  });

  it("carries an unused icon back out of the database untouched", () => {
    // Only what this file can see: normalize does not strip the field the tile
    // is not drawing. That the SWITCH does not empty it is a property of
    // writeControl, and is tested where the switch is — block-editor.interaction.
    const b = stored({ items: withImage, media: "image" });
    expect((b.props.items as Record<string, unknown>[])[0].icon).toBe("<svg/>");
  });

  it("drops the tile entirely when set to None", () => {
    expect(render(stored({ items: withImage, media: "none" }))).not.toContain("place-content-center");
  });

  it("draws no tile for a card whose picture is missing", () => {
    // An empty accent square is worse than no square: it reads as an image that
    // failed to load rather than a card that has none.
    expect(render(stored({ items: [{ title: "One", icon: "<svg/>" }], media: "image" }))).not.toContain(
      "place-content-center",
    );
  });
});

describe("the icon tile", () => {
  const tile = (props: Record<string, unknown>) =>
    /class="[^"]*place-content-center" style="([^"]+)"/.exec(
      render(stored({ items: [{ title: "One", icon: "<svg/>" }], ...props })),
    )![1];

  it("keeps 44px, an 11px corner and the band accent when nothing is set", () => {
    expect(tile({})).toBe("width:44px;height:44px;border-radius:11px;background:#b0532f;color:#ffffff");
  });

  it("takes a size, and the corner follows it", () => {
    // A fixed 11px corner on an 80px tile is not the same shape — "rounded"
    // has to mean the same roundness whatever the tile grows to.
    expect(tile({ iconBox: 80 })).toContain("width:80px;height:80px;border-radius:20px");
  });

  it("squares off and circles on demand", () => {
    expect(tile({ iconShape: "square" })).toContain("border-radius:0");
    expect(tile({ iconShape: "circle" })).toContain("border-radius:999px");
  });

  it("takes its own colours, and re-reads the ink against the fill it was given", () => {
    // Not against the accent it no longer uses: a white glyph on a white tile
    // is the failure this whole pairing exists to prevent.
    expect(tile({ iconBg: "#ffffff" })).toContain("background:#ffffff;color:#000000");
    expect(tile({ iconBg: "#ffffff", iconColor: "#b0532f" })).toContain("background:#ffffff;color:#b0532f");
  });

  it("sizes the glyph inside the tile separately", () => {
    expect(render(stored({ items: [{ title: "One", icon: "<svg/>" }], iconSize: 30 }))).toContain(
      "display:grid;width:30px;height:30px",
    );
  });

  it("becomes a flex sibling of the copy when it stands beside it", () => {
    const out = render(stored({ items: [{ title: "One", body: "b", icon: "<svg/>" }], iconPlace: "beside" }));
    expect(out).toContain('<div class="flex items-start gap-3">');
    // The bottom margin separated it from the title UNDER it. Beside the copy
    // that margin is a gap on the wrong axis.
    expect(out).not.toContain("mb-3 grid");
    expect(out).toContain("grid shrink-0 place-content-center");
  });
});

describe("card padding and the gap between cards", () => {
  const gridStyle = (props: Record<string, unknown>) =>
    /@xl:grid-cols-\[var\(--cards\)\]" style="([^"]+)"/.exec(render(stored({ items: ITEMS, ...props })))![1];

  it("leaves the skin's own padding alone until a figure is typed", () => {
    expect(render(stored({ items: ITEMS, skin: "tinted" }))).toContain("padding:1.6rem 1.7rem");
  });

  it("replaces the skin's padding with the figure typed", () => {
    expect(render(stored({ items: ITEMS, skin: "tinted", cardPadding: 40 }))).toContain("padding:40px");
  });

  it("can pad the plain skin, which has no padding of its own", () => {
    expect(render(stored({ items: ITEMS, skin: "plain", cardPadding: 40 }))).toContain('style="padding:40px"');
  });

  it("takes zero as a real answer rather than as unset", () => {
    // The reason both of these default to null: 0 is a padding someone means.
    expect(render(stored({ items: ITEMS, skin: "boxed", cardPadding: 0 }))).toContain("padding:0px");
    expect(gridStyle({ cardGap: 0 })).toContain("gap:0px");
  });

  it("keeps each number style's own gap until one is typed", () => {
    expect(gridStyle({ numberStyle: "inline" })).toContain("gap:1.6rem");
    expect(gridStyle({ numberStyle: "eyebrow" })).toContain("gap:1rem");
    expect(gridStyle({ numberStyle: "inline", cardGap: 8 })).toContain("gap:8px");
  });
});

describe("the card corner and the rule between cards", () => {
  // The style attribute of each card, or "" where the card has none at all —
  // an unstyled Plain card emits no attribute, which is the thing "changes
  // nothing" has to keep true.
  const cells = (props: Record<string, unknown>) =>
    [...render(stored({ items: ITEMS, ...props })).matchAll(/<div(?: style="([^"]*)")?><span aria-hidden/g)].map(
      (m) => m[1] ?? "",
    );

  it("leaves the skin's own corner alone until a figure is typed", () => {
    expect(cells({ skin: "boxed" })[0]).toContain("border-radius:16px");
    expect(cells({ skin: "boxed", cardRadius: 12 })[0]).toContain("border-radius:12px");
  });

  it("takes zero as a real answer, so a boxed card can be square", () => {
    expect(cells({ skin: "boxed", cardRadius: 0 })[0]).toContain("border-radius:0");
  });

  it("draws the rule above every card but the first", () => {
    // Above, not below: a rule under the last card is a line under nothing.
    const [first, second] = cells({ skin: "plain", divider: true });
    expect(first).toBe("");
    expect(second).toContain("border-top:1px solid rgba(22, 24, 31, 0.14)");
  });

  it("repeats the gap under the rule so the air either side of it matches", () => {
    // The grid gap only opens ABOVE the border. Without this the rule sits hard
    // against the copy below and reads as an underline for the wrong card.
    expect(cells({ skin: "plain", divider: true, cardGap: 28 })[1]).toContain("padding-top:28px");
    expect(cells({ skin: "plain", divider: true })[1]).toContain("padding-top:1rem");
  });

  it("changes nothing at all while it is off", () => {
    expect(cells({ skin: "plain", divider: false })).toEqual(["", ""]);
  });
});

describe("how many cards stand across", () => {
  const responsive = (b: Block) => setPropsAt(b, "mobile", { columns: 1 });

  it("stays in the style attribute while it is one value", () => {
    expect(render(stored({ items: ITEMS, columns: 3 }))).toContain("--cards:repeat(3, minmax(0,1fr))");
  });

  it("moves out of the style attribute the moment a device changes it", () => {
    // A rule cannot beat a style attribute, so the two cannot both hold this.
    // The attribute gives it up entirely rather than being overridden with
    // !important on every responsive cards block on the page.
    const out = render(responsive(stored({ items: ITEMS, columns: 3 })));
    expect(out).toContain('@xl:grid-cols-[var(--cards)]" style="gap:1rem"');
  });

  it("writes the desktop value and only the widths that differ", () => {
    const css = blockRules(responsive(stored({ items: ITEMS, columns: 3 })), theme);
    expect(css).toContain(".bk-b1.bk-b1{--cards:repeat(3, minmax(0,1fr))}");
    // Tablet was never given its own value, so it inherits three and says
    // nothing — a media query restating it would freeze it there.
    expect(css).not.toContain("max-width:1023px");
    expect(css).toContain("@media (max-width:767px){.bk-b1.bk-b1{--cards:repeat(1, minmax(0,1fr))}}");
  });

  it("still writes the attribute when the canvas is pinned to a device", () => {
    // No rules are emitted there at all: a 390px canvas inside a 1900px window
    // never fires a media query, so the value has to be inline or lost.
    const b = responsive(stored({ items: ITEMS, columns: 3 }));
    expect(renderToStaticMarkup(<Blocks blocks={[b]} theme={theme} at="mobile" />)).toContain(
      "--cards:repeat(1, minmax(0,1fr))",
    );
  });

  it("clamps a figure no control could have produced", () => {
    // Block props are raw jsonb and normalize never validates them; repeat(NaN)
    // drops the grid to one column and explains nothing.
    expect(render(stored({ items: ITEMS, columns: "banana" }))).toContain("--cards:repeat(3,");
    // Six, the ceiling a row of columns already has. Four was right while
    // cards meant cards with words in them; a strip of six logos is also a
    // cards block, and capped at four it wrapped 4 + 2.
    expect(render(stored({ items: ITEMS, columns: 99 }))).toContain("--cards:repeat(6,");
  });

/**
 * The one gap inside a card, as opposed to the gap between cards.
 *
 * Unset has to keep drawing exactly what each layout drew before it existed —
 * the stacked and inline layouts do not agree on that number, and a single new
 * default would have moved every card block on the site.
 */
describe("the gap between a card's title and its text", () => {
  const withGap = (over: Record<string, unknown>) =>
    render(stored({ items: [{ title: "One", body: "First" }], ...over }));

  it("moves the stacked layout's title", () => {
    expect(withGap({ cardTextGap: 24 })).toContain("margin-bottom:24px");
  });

  it("moves the inline layout's text", () => {
    const out = withGap({ cardTextGap: 24, numbered: true, numberStyle: "eyebrow", skin: "inline" });
    expect(out).toMatch(/margin-top:24px|margin-bottom:24px/);
  });

  it("leaves both alone when it is unset", () => {
    const out = withGap({});
    expect(out).toContain("margin-bottom:.4rem");
    expect(out).not.toContain("margin-bottom:0px");
  });

  it("accepts zero, which is a decision and not an unset", () => {
    // `?? ` on a falsy number is the classic way this control would silently
    // refuse the one value someone reaches for it to set.
    expect(withGap({ cardTextGap: 0 })).toContain("margin-bottom:0");
  });
});

/**
 * Every block carries a bottom margin, and nothing that stacks blocks has a
 * container gap — so that margin is the only thing separating one from the
 * next. The last one has nothing below it to be separated from, and the 16px
 * it kept was dead space at the foot of a section and inside the bottom of a
 * column, which is what made a card's padding look uneven.
 */
describe("the last block in a flow", () => {
  const two = () => [
    stored({ items: ITEMS }),
    normalizeBlocks([{ id: "b2", type: "spacer", props: { height: 8 } }])[0],
  ];

  it("has no bottom margin", () => {
    const out = renderToStaticMarkup(<Blocks blocks={two()} theme={theme} />);
    expect(out).toContain(".bk-b2.bk-b2{margin-bottom:0}");
  });

  it("leaves every earlier block's margin alone", () => {
    const out = renderToStaticMarkup(<Blocks blocks={two()} theme={theme} />);
    expect(out).not.toContain(".bk-b1.bk-b1{margin-bottom:0}");
    expect(out).toContain(".bk-b1.bk-b1{margin:0px 0px 16px 0px");
  });

  it("corrects the last VISIBLE block, not the last stored one", () => {
    // A trailing empty block renders nothing at all. If the count were taken
    // before that was known, the correction would land on a block nobody sees
    // and the real last one would keep its gap.
    const blocks = [
      stored({ items: ITEMS }),
      normalizeBlocks([{ id: "ghost", type: "text", props: { html: "" } }])[0],
    ];
    const out = renderToStaticMarkup(<Blocks blocks={blocks} theme={theme} />);
    expect(out).not.toContain("bk-ghost");
    expect(out).toContain(".bk-b1.bk-b1{margin-bottom:0}");
  });

  it("wins over a per-device margin, which would put the gap back on a phone", () => {
    // Appended after the block's own media queries, at the same specificity,
    // so order decides. Written before them it would lose on mobile only.
    const b = setStyleAt(stored({ items: ITEMS }), "mobile", {
      margin: { t: 0, r: 0, b: 40, l: 0, u: "px", link: false },
    });
    const out = renderToStaticMarkup(<Blocks blocks={[b]} theme={theme} />);
    const style = out.slice(out.indexOf("<style>"), out.indexOf("</style>"));
    // The override really is there — otherwise the ordering below compares
    // against nothing and passes for the wrong reason.
    expect(style).toContain("@media");
    expect(style).toContain("40px");
    expect(style.lastIndexOf("margin-bottom:0")).toBeGreaterThan(style.indexOf("@media"));
  });
});
});

/**
 * The three things a card could not say.
 *
 * Each one is "null still means what it meant" plus "and now there is a way to
 * say otherwise" — the same shape as everything else in this file, because a
 * card block saved two years ago must render byte for byte either way.
 */
describe("what a card can now be told", () => {
  const cards = (props: Record<string, unknown>) =>
    render(stored({ items: ITEMS, ...props }));

  it("draws the closing note's markup, like every other field on the card", () => {
    const out = cards({ skin: "list", note: "<strong>Voice match:</strong> paste 200 words." });
    expect(out).toContain("<strong>Voice match:</strong>");
    expect(out).not.toContain("&lt;strong&gt;");
  });

  it("filters that note on save, because it is now markup", () => {
    const [b] = sanitizeBlocks(
      normalizeBlocks([
        { id: "b1", type: "cards", props: { items: [], note: '<strong>ok</strong><script>alert(1)</script>' } },
      ]),
    );
    expect(String(b.props.note)).toContain("<strong>ok</strong>");
    expect(String(b.props.note)).not.toContain("<script");
  });

  it("takes card padding as one number, as it always has", () => {
    expect(cards({ cardPadding: 22 })).toContain("padding:22px");
  });

  it("takes it as four sides", () => {
    const out = cards({ cardPadding: { t: 10, r: 20, b: 30, l: 40, u: "px", link: false } });
    expect(out).toContain("padding:10px 20px 30px 40px");
  });

  it("still lets the skin pad the card when nothing is set", () => {
    // 1.35rem 1.4rem is the boxed skin's own padding, and unset must not
    // replace it with a figure of this control's choosing.
    expect(cards({ skin: "boxed" })).toContain("padding:1.35rem 1.4rem");
  });

  it("paints the card's own title and text when told to", () => {
    const out = cards({ cardTitleColor: "#ff0000", cardBodyColor: "#00ff00" });
    expect(out).toContain("#ff0000");
    expect(out).toContain("#00ff00");
  });

  it("colours the line above the cards separately from the cards themselves", () => {
    // Three lines, three controls. "Title" used to mean a card's title here
    // and the heading above them in the panel, so the one control anybody
    // reached for changed the wrong thing and the other looked broken.
    const list = cards({ skin: "list", title: "YOUR PACKAGE", headingColor: "#112233" });
    expect(list).toContain("#112233");
    const grid = cards({ caption: "Trusted by", headingColor: "#445566" });
    expect(grid).toContain("#445566");
  });

  it("gives the closing note the card text colour, not the title's", () => {
    const out = cards({ skin: "list", note: "The note", cardTitleColor: "#ff0000", cardBodyColor: "#00ff00" });
    // The note sits on the body ink; the row titles keep the title ink.
    expect(out).toMatch(/#00ff00[^<]*">The note|The note/);
    expect(out.slice(out.indexOf("The note") - 200, out.indexOf("The note"))).toContain("#00ff00");
  });
});

/**
 * `text-wrap: balance` evens line lengths, so it wraps NARROWER than the box on
 * purpose — a heading given a measure of 980px broke at about 840 and read as
 * "the width did not apply". It used to yield to a stated measure, which left
 * every heading nobody had given a width to still breaking somewhere the
 * builder could not reach.
 *
 * So it is off here entirely. The block builder is the one place where where a
 * heading breaks is somebody's decision; the class stays on the pages that are
 * not built block by block — the error page, the checkout panel, the OTO kit,
 * the storefront — where there is no panel to decide it in.
 */
describe("a heading block's line breaks", () => {
  const heading = (style: Record<string, unknown> = {}) => {
    const b = normalizeBlocks([{ id: "h1", type: "heading", props: { text: "A long enough heading to wrap" } }])[0];
    return render({ ...b, style: { ...b.style, ...style } } as Block);
  };

  it("fall where the box ends, with nothing evening them out", () => {
    expect(heading()).not.toContain("text-balance");
  });

  it("do the same once a measure is stated, so the width is the width", () => {
    expect(heading({ width: "custom", maxWidthValue: 980, maxWidthUnit: "px" })).not.toContain("text-balance");
  });
});

/**
 * The line above the cards, and the line under that.
 *
 * `caption` was rendered and had no control at all — the field existed, the
 * page drew it, and there was no way to type into it. Everything here is
 * still "unset draws exactly what it drew before".
 */
describe("the heading over a cards block", () => {
  const cards = (props: Record<string, unknown>) => render(stored({ items: ITEMS, ...props }));

  it("takes a size on the grid's heading", () => {
    expect(cards({ caption: "Trusted by", headingSize: 30 })).toContain("font-size:30px");
  });

  it("takes one on the one-card skin's heading too", () => {
    expect(cards({ skin: "list", title: "YOUR PACKAGE", headingSize: 18 })).toContain("font-size:18px");
  });

  it("draws a line under the heading, with its own size and ink", () => {
    const out = cards({ caption: "Trusted by", subheading: "The <em>whole</em> set.", subheadingSize: 15, subheadingColor: "#abcdef" });
    expect(out).toContain("The <em>whole</em> set.");
    expect(out).toContain("font-size:15px");
    expect(out).toContain("#abcdef");
  });

  it("draws nothing at all when that line is blank", () => {
    // The goldens above already pin this byte for byte; this says why.
    expect(cards({ caption: "Trusted by" })).toBe(cards({ caption: "Trusted by", subheading: "" }));
  });

  it("takes a face and a weight for both lines", () => {
    const out = cards({
      caption: "Trusted by",
      subheading: "The whole set.",
      headingFont: "Lora",
      headingWeight: "800",
      subheadingFont: "Inter",
      subheadingWeight: "300",
    });
    expect(out).toContain("font-weight:800");
    expect(out).toContain("font-weight:300");
    // The face arrives through familyToken — a var() with the family as its
    // fallback — so it resolves to whatever the site has loaded under that
    // name rather than to a bare string the page may not have.
    expect(out).toContain("font-family:&quot;Lora&quot;");
    expect(out).toContain("font-family:var(--font-inter");
  });

  it("filters the line under the heading, because it is markup", () => {
    const [b] = sanitizeBlocks(
      normalizeBlocks([{ id: "b1", type: "cards", props: { items: [], subheading: '<em>ok</em><script>x()</script>' } }]),
    );
    expect(String(b.props.subheading)).toContain("<em>ok</em>");
    expect(String(b.props.subheading)).not.toContain("<script");
  });
});
