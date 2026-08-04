import { describe, it, expect } from "vitest";
import { starterBlocks } from "@/lib/page-starter";
import { SECTIONS, sectionDef } from "@/lib/page-sections";
import { normalizeBlocks, walkBlocks, type Block } from "@/lib/blocks";
import { sanitizeSectionContent } from "@/lib/sanitize-html";

const starter = starterBlocks();
const all = (blocks: Block[]) => walkBlocks(blocks).map((b) => b.type);
const text = (blocks: Block[]) => walkBlocks(blocks).map((b) => JSON.stringify(b.props)).join(" ");

describe("the starter page", () => {
  it("fills every band", () => {
    for (const def of SECTIONS) {
      expect(starter[def.key]?.length, def.key).toBeGreaterThan(0);
    }
  });

  it("is a real block tree that survives being stored and read back", () => {
    for (const def of SECTIONS) {
      const round = normalizeBlocks(JSON.parse(JSON.stringify(starter[def.key])));
      expect(round, def.key).toEqual(starter[def.key]);
    }
  });

  it("has nothing in it the sanitizer needs to remove", () => {
    // Byte-identity is the wrong property — the sanitizer rewrites <circle/>
    // as <circle></circle>, which changes the serialisation and not the
    // meaning. What matters is that nothing is stripped and that a second pass
    // changes nothing more.
    for (const def of SECTIONS) {
      const once = sanitizeSectionContent({ blocks: starter[def.key] }).blocks as Block[];
      const twice = sanitizeSectionContent({ blocks: once }).blocks;
      expect(twice, def.key).toEqual(once);
      expect(all(once), def.key).toEqual(all(starter[def.key]));
      expect(walkBlocks(once).filter((b) => b.type === "cards").map((b) => (b.props.items as unknown[]).length))
        .toEqual(walkBlocks(starter[def.key]).filter((b) => b.type === "cards").map((b) => (b.props.items as unknown[]).length));
    }
  });

  it("builds the hero the way the reference page does", () => {
    const row = starter.hero.find((b) => b.type === "row")!;
    expect(row.props.structure).toBe("3-2");
    expect(all(row.columns![1])).toContain("cards");
  });

  it("carries the shapes we built for the second half of the page", () => {
    expect(all(starter.value)).toContain("pricing");
    expect(all(starter.value)).toContain("pricecard");
    expect(all(starter.faq)).toContain("faq");
    expect(all(starter.footer)).toContain("text");
    expect(all(starter.guarantee)).toContain("iconlist");
  });

  it("leaves the price to the offer rather than typing one into the card", () => {
    // The one number on a sales page that must never drift from what Stripe
    // will charge.
    for (const card of walkBlocks(starter.value).filter((b) => b.type === "pricecard")) {
      expect(card.props.price).toBe("");
    }
  });

  it("quotes nobody", () => {
    // No testimonials and no revenue figures, because there are none.
    expect(walkBlocks(starter.proof).some((b) => b.type === "slides")).toBe(false);
    expect(text(starter.authority)).not.toMatch(/\$\d|million/i);
  });

  it("states only facts the store already states", () => {
    const blob = Object.values(starter).map(text).join(" ");
    for (const fact of ["$47", "Seven days free", "Instagram and LinkedIn"]) {
      expect(blob).toContain(fact);
    }
    // Nothing invented about scale or results.
    expect(blob).not.toMatch(/\d+,\d{3}\s*(customers|users|members)/i);
  });

  it("does not carry the editor's own placeholder prose", () => {
    const blob = Object.values(starter).map(text).join(" ");
    for (const def of SECTIONS) {
      const headline = def.defaults.headline;
      if (typeof headline === "string" && headline) expect(blob).not.toContain(headline);
    }
  });
});
