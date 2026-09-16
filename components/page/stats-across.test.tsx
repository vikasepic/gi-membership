import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, setPropsAt, type Block } from "@/lib/blocks";

/**
 * Figures across, per device.
 *
 * Asked for 16 Sep 2026: four figures wrapped wherever the words ran out,
 * and there was no way to say "two by two on a phone". Same control and
 * the same track the cards block has.
 */
const render = (b: Block) => renderToStaticMarkup(<Blocks blocks={[b]} theme={bandTheme("navy")} />);
const stats = (props: Record<string, unknown>): Block => {
  const b = newBlock("stats");
  return {
    ...b,
    props: {
      ...b.props,
      items: [1, 2, 3, 4].map((n) => ({ value: `${n}00+`, label: `thing ${n}`, detail: "" })),
      ...props,
    },
  };
};

describe("figures across", () => {
  it("keeps the wrapping strip it always drew when nothing is set", () => {
    const out = render(stats({ layout: "strip" }));
    expect(out).toContain("flex flex-wrap items-stretch");
    expect(out).not.toContain("--cards");
  });
  it("becomes a grid of that many once Across is set", () => {
    const out = render(stats({ layout: "strip", columns: 4 }));
    expect(out).toContain("grid grid-cols-[var(--cards)]");
    expect(out).toContain("--cards:repeat(4, minmax(0,1fr))");
  });
  it("hands the count to the stylesheet when a phone says something else", () => {
    const out = render(setPropsAt(stats({ layout: "boxed", columns: 4 }), "mobile", { columns: 2 }));
    expect(out).toContain("grid grid-cols-[var(--cards)]");
    // The stylesheet owns the value now; an attribute would outrank the media query.
    expect(out).not.toMatch(/style="[^"]*--cards/);
    expect(out).toMatch(/@media \(max-width:767px\)\{[^}]*--cards:repeat\(2, minmax\(0,1fr\)\)\}\}/);
  });
});
