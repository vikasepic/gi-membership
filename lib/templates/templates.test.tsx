import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import {
  blockRendersNothing,
  insertBlock,
  normalizeBlocks,
  reid,
  walkBlocks,
  type Block,
} from "@/lib/blocks";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { listTemplates, templateSource } from "@/lib/templates";
import { make } from "@/lib/templates/template";

const paper = bandTheme("paper");

/** Save the way the server action does, then read the way the page does. */
const roundTrip = (blocks: unknown) =>
  normalizeBlocks(sanitizeSectionContent({ blocks: blocks as Block[] }).blocks);

// The shelf's contract: everything on it is in genuine working condition. A
// preview that renders but inserts broken is worse than no library, so every
// template walks the same path a placed one will — sanitize, normalize, render.
describe.each(listTemplates().map((t) => [t.name, t] as const))("%s", (_name, t) => {
  it("survives the save unchanged", () => {
    expect(roundTrip(t.blocks)).toEqual(t.blocks);
  });

  it("renders something a buyer can see", () => {
    const out = renderToStaticMarkup(<Blocks blocks={t.blocks} theme={paper} />);
    expect(out.replace(/<[^>]*>/g, "").trim()).not.toBe("");
  });

  it("loses nothing to the empty-block sweep on save", () => {
    for (const b of walkBlocks(t.blocks)) expect(blockRendersNothing(b)).toBe(false);
  });

  it("inserts as a copy, never sharing ids with the shelf or a prior insert", () => {
    const place = (into: Block[]) =>
      t.blocks.map(reid).reduce((acc, b, i) => insertBlock(acc, b, { zone: "root", index: i }), into);
    const twice = place(place([]));
    const ids = walkBlocks(twice).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const shelf = new Set(walkBlocks(t.blocks).map((b) => b.id));
    expect(ids.some((id) => shelf.has(id))).toBe(false);
  });
});

/** The template literal out of an exported file, the way tsc would read it. */
const parseSource = (source: string) =>
  JSON.parse(source.slice(source.indexOf("= {") + 2, source.lastIndexOf("}") + 1));

describe("the export", () => {
  // The format's real test: a design exported from the builder must insert
  // back identically, or every design built afterwards inherits the break.
  it("round-trips a built design through the file and back", () => {
    const built = [
      make("heading", { text: "Built in the builder", tag: "h1" }, { textAlign: "center" }),
      make("cards"),
    ];
    const source = templateSource("My design", built);
    const parsed = parseSource(source);
    expect(parsed.id).toBe("my-design");
    expect(normalizeBlocks(parsed.blocks)).toEqual(roundTrip(built));
  });

  it("emits what a reload would make of the blocks, not the raw tree", () => {
    // A row still carrying `structure` must land in the file already resolved
    // to widths — the stored form may not drift on read.
    const raw = { ...make("row"), props: { structure: "2-1", gap: 24 } };
    const source = templateSource("Rows", [raw]);
    const parsed = parseSource(source);
    expect(normalizeBlocks(parsed.blocks)).toEqual(parsed.blocks);
    expect(parsed.blocks[0].props.structure).toBeUndefined();
  });
});
