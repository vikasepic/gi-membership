import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SalesPage } from "@/components/page/sales-page";
import { defaultRows, type SectionRow } from "@/lib/page-sections";
import { newBlock, type Block } from "@/lib/blocks";
import type { GlobalBlocks } from "@/lib/section-to-blocks";

// The seam a visitor actually meets: a page holding a pointer, and the map the
// server hands the renderer.

const heading = (text: string): Block => {
  const b = newBlock("heading");
  return { ...b, props: { ...b.props, text } };
};

const pointer = (globalId: string): Block => {
  const b = newBlock("global");
  return { ...b, props: { ...b.props, globalId } };
};

const pageWith = (blocks: Block[]): SectionRow[] =>
  defaultRows().map((r) => (r.sectionKey === "benefits" ? { ...r, content: { blocks } } : r));

const render = (rows: SectionRow[], globals?: GlobalBlocks) =>
  renderToStaticMarkup(
    <SalesPage rows={rows} money={{ priceLabel: "$49", termsLabel: null }} globals={globals} />,
  );

describe("a global block on a page a visitor reads", () => {
  it("draws what the pointer names", () => {
    const html = render(
      pageWith([heading("Above"), pointer("g1")]),
      new Map([["g1", [heading("The shared promise")]]]),
    );
    expect(html).toContain("Above");
    expect(html).toContain("The shared promise");
  });

  it("puts one edit on two pages", () => {
    // The entire point of the feature: one row, two documents.
    const globals: GlobalBlocks = new Map([["g1", [heading("Edited once")]]]);
    const a = render(pageWith([pointer("g1")]), globals);
    const b = render(pageWith([heading("Different page"), pointer("g1")]), globals);
    expect(a).toContain("Edited once");
    expect(b).toContain("Edited once");
    expect(b).toContain("Different page");
  });

  it("leaves no gap when the design is gone", () => {
    // A design deleted out from under a page makes it shorter, never broken —
    // and never an empty band with padding where a block used to be.
    const html = render(pageWith([heading("Still here"), pointer("missing")]), new Map());
    expect(html).toContain("Still here");
    expect(html).not.toContain("missing");
  });

  it("renders the rest of the page when nothing resolves at all", () => {
    // What a page does if the globals query fails: resolveGlobals returns an
    // empty map rather than throwing, because a shared footer that cannot be
    // read must not take a sales page down.
    const html = render(pageWith([heading("Body copy"), pointer("g1")]));
    expect(html).toContain("Body copy");
  });
});
