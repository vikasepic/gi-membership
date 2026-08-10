import { describe, it, expect } from "vitest";
import { sectionToBlocks } from "@/lib/section-to-blocks";
import { sectionDef, SECTIONS } from "@/lib/page-sections";
import { newBlock, walkBlocks } from "@/lib/blocks";

/**
 * What a section still stored as typed fields renders as.
 *
 * `sectionToBlocks` is not only the "start from the template" button. It runs on
 * the LIVE page for every section whose content has no blocks — fifteen of them
 * in production when this was written, hero and problem and offer among them.
 * Whatever it returns is what a buyer sees.
 *
 * So it must not inherit the defaults for a block someone drops in. Those are
 * free to improve; this is a record of what existing pages already look like.
 * The default moved once — a new paragraph became 680px and centred — and took
 * every one of those fifteen pages with it, from 62ch flush left. Nobody asked.
 */
describe("body copy in a section that was never converted", () => {
  it("keeps the measure it has always had", () => {
    const blocks = sectionToBlocks(sectionDef("hero")!, {
      headline: "A headline",
      subhead: "Body copy under it.",
    });
    const text = walkBlocks(blocks).find((b) => b.type === "text");
    expect(text).toBeDefined();
    expect(text!.style.width).toBe("custom");
    expect(text!.style.maxWidthValue).toBe(62);
    expect(text!.style.maxWidthUnit).toBe("ch");
    expect(text!.style.blockAlign).toBe("left");
  });

  it("does not follow the default for a newly dropped block", () => {
    // The whole point. If these two ever agree by accident, this test is not
    // saying anything — so it asserts they DIFFER, which is the invariant.
    const dropped = newBlock("text").style;
    const blocks = sectionToBlocks(sectionDef("problem")!, { heading: "H", lead: "Lead line." });
    const converted = walkBlocks(blocks).find((b) => b.type === "text");
    if (!converted) return;
    expect(dropped.maxWidthValue).not.toBe(converted.style.maxWidthValue);
  });

  it("holds for every section that produces body copy", () => {
    for (const def of SECTIONS) {
      const blocks = sectionToBlocks(def, def.defaults as Record<string, unknown>);
      for (const b of walkBlocks(blocks)) {
        if (b.type !== "text") continue;
        // Some templates deliberately widen a block (a full-bleed strip). Those
        // say so explicitly; what must never happen is a text block silently
        // carrying the dropped-in default.
        const isDefault =
          b.style.width === "custom" &&
          b.style.maxWidthValue === newBlock("text").style.maxWidthValue &&
          b.style.blockAlign === newBlock("text").style.blockAlign;
        expect([def.key, isDefault]).toEqual([def.key, false]);
      }
    }
  });
});
