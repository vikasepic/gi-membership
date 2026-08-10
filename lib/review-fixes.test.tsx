import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme, sectionDef } from "@/lib/page-sections";
import { newBlock, normalizeBlocks, type Block } from "@/lib/blocks";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { blockRules } from "@/lib/block-style";
import { shellHrefIsValid } from "@/lib/site-shell";
import { sectionToBlocks } from "@/lib/section-to-blocks";

// What the pre-push review found. Each of these failed before the fix beside
// it, on a page a paying customer would have been looking at.

const paper = bandTheme("paper");
const render = (blocks: Block[]) => renderToStaticMarkup(<Blocks blocks={blocks} theme={paper} />);

/** A row as it would come back from getPageSections: sanitized on read. */
const throughRead = (blocks: unknown): Block[] =>
  sanitizeSectionContent({ blocks }).blocks as Block[];

describe("one line of copy is encoded once", () => {
  it("keeps the ampersand in a button label", () => {
    // sanitize-html turns & into &amp; in a TEXT node. The button renderer
    // hands its label to React, which encodes the ampersand again — so a CTA
    // reading "Join & Save" reached the buyer as "Join &amp; Save".
    const out = render(throughRead([{ ...newBlock("button"), props: { text: "Join & Save", action: "link", link: "/x" } }]));
    expect(out).toContain("Join &amp; Save");
    expect(out).not.toContain("&amp;amp;");
  });

  it("keeps the ampersand in a testimonial", () => {
    const out = render(throughRead([{ ...newBlock("slides"), props: { items: [{ quote: "Jane & Co", name: "R&D", role: "" }] } }]));
    expect(out).not.toContain("&amp;amp;");
  });

  it("still renders emphasis in a heading", () => {
    expect(render(throughRead([{ ...newBlock("heading"), props: { text: "Say <b>this</b>" } }]))).toContain("<b>this</b>");
  });
});

describe("every field the page renders as markup is filtered", () => {
  it("filters a price comparison label", () => {
    // The price table sits directly above the buy button, and its label was
    // the one <Inline> field missing from the sanitizer's map.
    const dirty = [{ ...newBlock("pricing"), props: { items: [{ label: "<img src=x onerror=alert(1)>", amount: "$0" }] } }];
    expect(render(throughRead(dirty))).not.toContain("onerror");
  });
});

describe("a stylesheet cannot be escaped from", () => {
  it("strips a closing tag out of a row's align-items", () => {
    // <style> is a raw-text element: the parser ends it at the first `</style`
    // and everything after is real markup.
    const row = normalizeBlocks([
      {
        id: "pwn",
        type: "row",
        props: { widths: [50, 50], verticalAlign: "stretch</style><img src=x onerror=alert(1)>" },
        columns: [[{ id: "h", type: "heading", props: { text: "Buy" } }], []],
      },
    ])[0];
    const css = blockRules(row, paper);
    expect(css).not.toContain("</style>");
    expect(css).toContain("align-items:stretch");
  });
});

describe("a nav link cannot leave the site", () => {
  it("refuses a backslash path", () => {
    // A regex reads `\` as an ordinary character; the URL parser reads it as
    // `/`, so `/\evil.com` resolves to https://evil.com/.
    expect(shellHrefIsValid("/\\evil.com")).toBe(false);
    expect(shellHrefIsValid("//evil.com")).toBe(false);
    expect(shellHrefIsValid("/about")).toBe(true);
  });
});

describe("stacking into one column wins", () => {
  const rules = (props: Record<string, unknown>) =>
    blockRules(
      normalizeBlocks([{ id: "b1", type: "row", props: { widths: [50, 50], ...props }, columns: [[], []] }])[0],
      paper,
    );

  it("beats No wrap on a phone", () => {
    // Two 100%-wide items on a nowrap line shrink onto one line instead.
    const mobile = rules({ wrap: "nowrap" }).split("@media (max-width:767px)")[1];
    expect(mobile).toContain("flex-wrap:wrap");
  });

  it("beats Auto flow: column on a phone", () => {
    // One explicit track only sizes the first item under column flow; the
    // rest go into implicit columns and stay side by side.
    const css = rules({ containerType: "grid", autoFlow: "column" });
    expect(css).toContain("grid-auto-flow:column");
    expect(css.split("@media (max-width:767px)")[1]).toContain("grid-auto-flow:revert");
  });
});

describe("a section still on typed fields", () => {
  const convert = (key: string, content: Record<string, unknown>) =>
    JSON.stringify(sectionToBlocks(sectionDef(key)!, content));

  it("shows the words somebody typed rather than swallowing them", () => {
    // These fields were plain-text form inputs before the block renderer
    // started handing them to the page as markup.
    expect(convert("hero", { headline: "Save 20% <today>" })).toContain("Save 20% &lt;today&gt;");
  });

  it("drops a javascript: footer link", () => {
    const out = convert("footer", { links: [{ label: "Terms", url: "javascript:alert(1)" }] });
    expect(out).not.toContain("javascript:");
    expect(out).toContain("Terms");
  });

  it("cannot inject an attribute through a footer link", () => {
    // The quote has to be escaped, or it closes href= and opens a handler.
    const out = convert("footer", { links: [{ label: "x", url: '" onmouseover="alert(1)' }] });
    expect(out).not.toContain('onmouseover=\\"');
    expect(out).toContain("&quot; onmouseover=&quot;");
  });
});
