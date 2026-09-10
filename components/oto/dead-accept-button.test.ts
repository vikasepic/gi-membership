import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { hasBuyAnchorBlock } from "@/lib/page-sections";

/**
 * The upsell's sticky bar must never render a button that does nothing.
 *
 * Found 10 Sep 2026 while asking why 0 of 10 upsells were accepted. The
 * Funnel App's upsell has two live prices, so OtoStickyBar took its
 * `optionCount > 1` branch and rendered a button calling `scrollToBuy()`
 * rather than the accept form. `buyAnchor()` looks for a Ways to pay block or
 * a Button block set to buy; that page had eight headings, eight rows, five
 * card grids, three texts, an FAQ and an image, and neither of those. So
 * `scrollIntoView` ran on null, nothing moved, and there was no other way to
 * accept anywhere on the page. Ten buyers were shown it. None could take it.
 */
const row = (...blocks: unknown[]) => ({ content: { blocks } });

describe("whether a bar has anywhere to scroll", () => {
  it("finds a Ways to pay block", () => {
    expect(hasBuyAnchorBlock([row({ type: "prices", props: {} })])).toBe(true);
  });

  it("finds a Button set to buy", () => {
    expect(hasBuyAnchorBlock([row({ type: "button", props: { action: "buy" } })])).toBe(true);
  });

  it("does not count a Button that merely links somewhere", () => {
    expect(hasBuyAnchorBlock([row({ type: "button", props: { action: "link", link: "/x" } })])).toBe(false);
  });

  it("does not count a block that renders a CTA but leaves no anchor", () => {
    // A cards block with a ctaLabel IS an accept control, but buyAnchor cannot
    // find it — so a bar still must not try to scroll to it.
    expect(hasBuyAnchorBlock([row({ type: "cards", props: { ctaLabel: "Get it" } })])).toBe(false);
  });

  it("is false for the page that actually broke", () => {
    // The Funnel App upsell's real block census, from production.
    const funnelApp = [
      row(
        ...Array(8).fill({ type: "heading", props: {} }),
        ...Array(8).fill({ type: "row", props: {} }),
        ...Array(5).fill({ type: "cards", props: {} }),
        ...Array(3).fill({ type: "text", props: {} }),
        { type: "faq", props: {} },
        { type: "image", props: {} },
      ),
    ];
    expect(hasBuyAnchorBlock(funnelApp)).toBe(false);
  });

  it("looks inside a row's columns, not just the top level", () => {
    // A Ways to pay dropped into a row is the ordinary way to place one, and
    // a row nests through `columns` — an array per column.
    expect(
      hasBuyAnchorBlock([
        row({ type: "row", props: {}, columns: [[{ type: "text", props: {} }], [{ type: "prices", props: {} }]] }),
      ]),
    ).toBe(true);
  });

  it("survives a row with no blocks at all", () => {
    expect(hasBuyAnchorBlock([{ content: null }, { content: { blocks: [] } }, {}])).toBe(false);
  });
});

describe("what the template does with that answer", () => {
  const src = readFileSync("components/oto/sections-template.tsx", "utf8");

  it("tells the bar to accept when there is no anchor to scroll to", () => {
    expect(src).toContain("const optionCount = hasBuyAnchorBlock(rows) ? shown : 1;");
  });

  it("still lets a page with a real chooser scroll to it", () => {
    // Two prices AND a Ways to pay block must keep the scroll behaviour, or
    // the bar would charge the first price past a chooser the buyer can see.
    expect(src).toContain("const shown = options.length > 1 ? options.length : alt ? 2 : 1;");
  });
});
