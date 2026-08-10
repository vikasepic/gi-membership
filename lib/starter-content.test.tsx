// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, normalizeBlocks, BLOCK_TYPES, type BlockType } from "@/lib/blocks";

const theme = bandTheme("paper");
const draw = (b: ReturnType<typeof newBlock>) =>
  renderToStaticMarkup(<Blocks blocks={[b]} theme={theme} at="desktop" />);
const words = (html: string) => html.replace(/<[^>]*>/g, "").trim();

/**
 * A block dropped into a section should show its design straight away.
 *
 * Half of them rendered nothing at all: cards, FAQ, figures, the icon list,
 * the price rows and the testimonial all start from an empty items array, so
 * dropping one gave you an invisible block and a panel of settings with
 * nothing to look at.
 */
const LIST_BLOCKS: BlockType[] = ["cards", "faq", "iconlist", "stats", "pricing", "slides"];

describe("a block you have just dropped", () => {
  it.each(LIST_BLOCKS)("%s shows something to look at", (type) => {
    expect(words(draw(newBlock(type))).length).toBeGreaterThan(10);
  });

  it("has nothing that could be mistaken for a real claim", () => {
    // The rule this store keeps: it never fabricates a trust signal. Starter
    // content is the easiest place to break it — a plausible testimonial with
    // a plausible name, or a round number beside a noun, is a claim the moment
    // somebody forgets to replace it.
    const all = LIST_BLOCKS.map((t) => words(draw(newBlock(t)))).join(" ");
    // No figure that could survive to a live page as a statistic.
    expect(all).not.toMatch(/\b\d{1,3}(,\d{3})+\b/);      // 10,000
    expect(all).not.toMatch(/\b\d+\s*(customers|users|buyers|members|students)\b/i);
    expect(all).not.toMatch(/\b\d+%/);                     // 98%
    expect(all).not.toMatch(/\$\s?\d/);                    // $49
    // The only digits allowed are the visibly-unset figure.
    const digits = all.match(/\d+/g) ?? [];
    for (const d of digits) expect(d).toBe("00");
  });
});

describe("a block that already exists", () => {
  it("never grows copy nobody wrote", () => {
    // The trap this avoids: normalizeBlock spreads DEFAULT_PROPS over every
    // block it READS, so starter content living there would appear on a live
    // sales page anywhere the key happened to be absent. It lives in newBlock
    // alone. A stored cards block with no items is an empty block, and it
    // stays one.
    const stored = normalizeBlocks([{ id: "x", type: "cards", props: {}, style: {} }])[0];
    expect(stored.props.items).toEqual([]);
    expect(words(draw(stored))).toBe("");
  });

  it("keeps the items it was saved with", () => {
    const stored = normalizeBlocks([
      { id: "x", type: "faq", props: { items: [{ q: "Mine", a: "Also mine" }] }, style: {} },
    ])[0];
    expect(stored.props.items).toEqual([{ q: "Mine", a: "Also mine" }]);
    expect(words(draw(stored))).not.toContain("question someone asks");
  });

  it("leaves every block type's stored props alone", () => {
    for (const type of BLOCK_TYPES) {
      const stored = normalizeBlocks([{ id: "x", type, props: {}, style: {} }])[0];
      const fresh = newBlock(type);
      // Where a starter exists the two must DIFFER — if they ever agree, the
      // starter has leaked into the read path and this test is the only thing
      // that would have said so.
      if (LIST_BLOCKS.includes(type)) {
        expect([type, stored.props.items]).toEqual([type, []]);
        expect((fresh.props.items as unknown[]).length).toBeGreaterThan(0);
      }
    }
  });
});
