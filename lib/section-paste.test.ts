import { describe, it, expect } from "vitest";
import { newBlock, walkBlocks } from "@/lib/blocks";
import { sectionClip, pastedSection } from "@/lib/section-clip";
import type { SectionRow } from "@/lib/page-sections";

/**
 * A section copied out of one slot and pasted into another.
 *
 * The clipboard holds BLOCKS rather than the typed fields sections used to
 * store, which is what makes "any section into any section" work: every
 * section renders blocks identically, and what differs between them — the
 * name, the purpose, the step in the framework — belongs to the slot, not to
 * what is standing in it.
 */
const row = (over: Partial<SectionRow> = {}): SectionRow => ({
  sectionKey: "problem",
  position: 0,
  enabled: true,
  style: "navy",
  accent: "#112233",
  variant: null,
  content: { blocks: [newBlock("text"), newBlock("heading")] },
  background: null,
  cssId: null,
  cssClass: null,
  ...over,
});

const clipOf = (r: SectionRow) => ({ ...sectionClip(r), copiedAt: Date.now() });

describe("pasting a section", () => {
  it("carries the blocks into a different kind of section", () => {
    const target = row({ sectionKey: "authority", content: {} });
    const next = pastedSection(clipOf(row()), target);
    expect(walkBlocks((next.content as { blocks: never[] }).blocks)).toHaveLength(2);
  });

  it("brings the band and the accent, or it arrives looking like another section", () => {
    const next = pastedSection(clipOf(row()), row({ sectionKey: "authority", style: "paper" }));
    expect(next.style).toBe("navy");
    expect(next.accent).toBe("#112233");
  });

  it("gives the pasted blocks their own ids", () => {
    const source = row();
    const before = walkBlocks((source.content as { blocks: never[] }).blocks).map((b) => b.id);
    const next = pastedSection(clipOf(source), row({ sectionKey: "authority" }));
    for (const b of walkBlocks((next.content as { blocks: never[] }).blocks)) {
      expect(before).not.toContain(b.id);
    }
  });

  it("keeps a variant within its own kind and drops it across kinds", () => {
    // A variant names a layout the section it came from defines. The target
    // may have no such thing, and saveSection would drop it anyway — dropping
    // it here means the editor shows what will actually be saved.
    const source = row({ variant: "stacked" });
    expect(pastedSection(clipOf(source), row()).variant).toBe("stacked");
    expect(pastedSection(clipOf(source), row({ sectionKey: "authority" })).variant).toBeNull();
  });

  it("writes only blocks, never the typed fields of the section it left", () => {
    // A field carried into a section whose definition has never heard of it is
    // a value nothing reads and nothing can remove.
    const source = row({ content: { heading: "Old typed field", lead: "More" } });
    const next = pastedSection(clipOf(source), row({ sectionKey: "authority" }));
    expect(Object.keys(next.content as object)).toEqual(["blocks"]);
  });

  it("converts a section that was never opened in the block editor", () => {
    // Its content is typed fields; blocksForSection turns those into blocks on
    // the way out, so the paste is never empty.
    // `heading` is a field the Problem section actually defines; a key it has
    // never heard of converts to nothing, which is correct and not the case
    // under test here.
    const source = row({ content: { heading: "A heading worth keeping" } });
    const blocks = (clipOf(source).data as { blocks: unknown[] }).blocks;
    expect(blocks.length).toBeGreaterThan(0);
  });
});
