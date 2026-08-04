import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SalesPage } from "@/components/page/sales-page";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { buildSectionView, defaultRows, isSectionEmpty, type SectionRow } from "@/lib/page-sections";
import { newBlock, normalizeBlocks } from "@/lib/blocks";

// The seam. Everything above is tested on its own; this is the path a real
// edit takes: the editor makes a tree, the save action sanitizes it, the page
// reads it back and renders it for a buyer.

const heading = (text: string) => {
  const b = newBlock("heading");
  return { ...b, props: { ...b.props, text } };
};

const rowOf = (blocks: ReturnType<typeof newBlock>[]) => {
  const r = newBlock("row");
  r.columns![0] = blocks;
  return r;
};

/** Save the way the server action does, then read the way the page does. */
const roundTrip = (blocks: unknown) =>
  normalizeBlocks(sanitizeSectionContent({ blocks }).blocks);

const rowsWith = (sectionKey: string, content: Record<string, unknown>): SectionRow[] =>
  defaultRows().map((r) => (r.sectionKey === sectionKey ? { ...r, content } : r));

const page = (rows: SectionRow[]) =>
  renderToStaticMarkup(
    <SalesPage rows={rows} money={{ priceLabel: "$49", termsLabel: null }} />,
  );

describe("a block survives the trip from editor to buyer", () => {
  it("keeps what was written", () => {
    const out = roundTrip([heading("Built in the builder")]);
    expect(out).toHaveLength(1);
    expect(out[0].props.text).toBe("Built in the builder");
  });

  it("keeps a block nested in a column", () => {
    const out = roundTrip([rowOf([heading("Inside a column")])]);
    expect(out[0].columns![0][0].props.text).toBe("Inside a column");
  });

  it("strips a script on the way in, everywhere", () => {
    const nasty = { ...newBlock("html"), props: { code: "<p>ok</p><script>steal()</script>" } };
    const out = roundTrip([nasty, rowOf([nasty])]);
    expect(JSON.stringify(out)).not.toContain("steal()");
    expect(String(out[0].props.code)).toContain("<p>ok</p>");
  });

  it("is stable — saving the same content twice changes nothing", () => {
    const once = roundTrip([heading("Stable"), rowOf([newBlock("divider")])]);
    expect(roundTrip(once)).toEqual(once);
  });
});

describe("blocks reach the page", () => {
  it("renders a section's blocks on the live page", () => {
    const out = page(rowsWith("benefits", { blocks: roundTrip([heading("From the builder")]) }));
    expect(out).toContain("From the builder");
  });

  it("paints them in the section's own band", () => {
    // navy is the hero's default band; a block there must not be dark ink.
    const rows = rowsWith("hero", { blocks: roundTrip([heading("On navy")]) });
    const view = buildSectionView(rows.find((r) => r.sectionKey === "hero")!)!;
    expect(page(rows)).toContain(view.theme.fg);
  });

  it("a section with only blocks is not skipped as empty", () => {
    // Every typed field is empty here. Without blocks counting as content the
    // page would drop the section and the work would vanish.
    const row = { ...defaultRows().find((r) => r.sectionKey === "proof")!, content: { blocks: roundTrip([heading("Only blocks")]) } };
    expect(isSectionEmpty(buildSectionView(row)!)).toBe(false);
    expect(page(rowsWith("proof", row.content))).toContain("Only blocks");
  });

  it("a section with neither fields nor blocks is still skipped", () => {
    const out = page(rowsWith("proof", { blocks: [] }));
    expect(out).not.toContain("Proof it works");
  });

  it("an unfilled block leaves no gap on the page", () => {
    const out = page(rowsWith("benefits", { blocks: roundTrip([newBlock("image")]) }));
    expect(out).not.toContain("<img");
  });
});
