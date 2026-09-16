import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, setPropsAt, type Block } from "@/lib/blocks";
import { template } from "@/lib/templates/class-schedule";

/**
 * The schedule block.
 *
 * Asked for 16 Sep 2026: the dated rail on greaterinside.com's Social Media
 * System page, as a template, with every number, face, colour and the line
 * itself editable. What has to hold is that the design's own measurements
 * are what a fresh block draws, that a phone's numbers reach the stylesheet
 * rather than an attribute, and that the template carries the reference.
 */
const render = (b: Block, at?: "desktop" | "tablet" | "mobile") =>
  renderToStaticMarkup(<Blocks blocks={[b]} theme={bandTheme("paper")} at={at} />);
const schedule = (props: Record<string, unknown> = {}): Block => {
  const b = newBlock("timeline");
  return {
    ...b,
    props: {
      ...b.props,
      items: [{ label: "Class", number: "01", date: "Monday, September 21", title: "Finding it.", text: "Two lines." }],
      ...props,
    },
  };
};

describe("the schedule block", () => {
  it("draws the reference's rail, dot and numeral by default", () => {
    const out = render(schedule());
    expect(out).toContain("--tl-rail:110px");
    expect(out).toContain("--tl-dot:15px");
    expect(out).toContain("--tl-num:50px");
    expect(out).toContain("--tl-rule-w:85px");
    expect(out).toContain("background:#c8653d");
    expect(out).toContain("font-style:italic");
    expect(out).toContain("Monday, September 21");
  });

  it("hands a phone's numbers to the stylesheet, not the attribute", () => {
    const out = render(setPropsAt(schedule(), "mobile", { rail: 60, dotSize: 12, numberSize: 32 }));
    expect(out).not.toMatch(/style="[^"]*--tl-rail:/);
    expect(out).toMatch(/@media \(max-width:767px\)\{[^}]*--tl-rail:60px;[^}]*--tl-dot:12px;[^}]*--tl-num:32px[^}]*\}\}/);
  });

  it("sets them inline on the builder canvas at the width being drawn", () => {
    const out = render(setPropsAt(schedule(), "mobile", { rail: 60 }), "mobile");
    expect(out).toMatch(/style="[^"]*--tl-rail:60px/);
  });

  it("drops the rule at width 0 and draws nothing with no entries", () => {
    expect(render(schedule({ ruleWidth: 0 }))).not.toContain("<hr");
    expect(render(schedule({ items: [] }))).not.toContain("--tl-rail");
  });

  it("ships as the four classes on the reference, in its faces", () => {
    const block = template.blocks.find((b) => b.type === "timeline")!;
    expect((block.props.items as unknown[]).length).toBe(4);
    expect(block.props.dateFont).toBe("Poppins");
    expect(block.responsive?.mobile.props).toMatchObject({ rail: 60, dotSize: 12, numberSize: 32 });
    const out = render(block);
    expect(out).toContain("Building a system for writing and posting.");
    expect(out).toContain("--tl-rail:60px");
  });
});
