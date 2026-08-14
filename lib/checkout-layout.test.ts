import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  checkoutStarterBlocks,
  flattenBlocks,
  missingFixedBlocks,
  usableCheckoutLayout,
} from "@/lib/checkout-layout";
import { BLOCK_TYPES, CHECKOUT_TYPES, FIXED_CHECKOUT_TYPES, newBlock, type Block } from "@/lib/blocks";
import { BLOCK_ICON, PALETTE, controlsFor, groupedPalette } from "@/lib/block-controls";

const row = (columns: Block[][]): Block => ({ ...newBlock("row"), columns });

describe("a checkout layout is trusted only when it can take money", () => {
  it("refuses nothing at all", () => {
    expect(usableCheckoutLayout(undefined)).toBeNull();
    expect(usableCheckoutLayout([])).toBeNull();
  });

  it("refuses a layout missing any essential part", () => {
    for (const dropped of FIXED_CHECKOUT_TYPES) {
      const blocks = FIXED_CHECKOUT_TYPES.filter((t) => t !== dropped).map((t) => newBlock(t));
      expect(usableCheckoutLayout(blocks), dropped).toBeNull();
      expect(missingFixedBlocks(blocks)).toContain(dropped);
    }
  });

  it("finds the essential parts inside columns", () => {
    // The whole point of this page is two columns, so a check that only looked
    // at the top level would refuse every layout anybody actually draws.
    const blocks = [row([[newBlock("buyerdetails")], FIXED_CHECKOUT_TYPES.slice(1).map((t) => newBlock(t))])];
    expect(flattenBlocks(blocks).length).toBe(1 + FIXED_CHECKOUT_TYPES.length);
    expect(usableCheckoutLayout(blocks)).not.toBeNull();
  });

  it("accepts the checkout that ships", () => {
    // The starter is what the seed button writes. If it could not pass this
    // guard, pressing that button would produce a layout the live page then
    // silently ignored — the editor working and nothing changing.
    const starter = Object.values(checkoutStarterBlocks()).flat();
    expect(missingFixedBlocks(starter)).toEqual([]);
    expect(usableCheckoutLayout(starter)).not.toBeNull();
  });
});

describe("the checkout blocks are wired end to end", () => {
  it("is a real block type, with an icon, controls and a place in the tray", () => {
    const labels = groupedPalette("", "checkout").flatMap((g) => g.items.map((i) => i.label));
    for (const t of CHECKOUT_TYPES) {
      expect(BLOCK_TYPES, t).toContain(t);
      expect(BLOCK_ICON[t], `${t} has no icon`).toBeTruthy();
      const entry = PALETTE.find((p) => p.type === t);
      expect(entry, `${t} is not in the palette`).toBeTruthy();
      expect(labels, `${t} is not in the checkout tray`).toContain(entry!.label);
      // A block with no controls is one you can place and never edit.
      const c = controlsFor(newBlock(t));
      expect(c.content.length + c.style.length, `${t} has no controls`).toBeGreaterThan(0);
    }
  });

  it("draws something in the renderer", () => {
    const src = readFileSync("components/page/blocks.tsx", "utf8");
    for (const t of CHECKOUT_TYPES) expect(src, t).toContain(`case "${t}":`);
  });

  it("never counts as empty", () => {
    // These draw the live order rather than anything typed into them. Treated
    // as empty, a pay button whose label was blanked would be dropped from the
    // page that charges the card.
    const src = readFileSync("lib/blocks.ts", "utf8");
    const fn = src.slice(src.indexOf("export function blockRendersNothing"));
    for (const t of CHECKOUT_TYPES) expect(fn, t).toContain(`case "${t}":`);
  });

  it("keeps the disclosure line attached to the button that takes the money", () => {
    // Naming the terms and the refund right at the point of payment is a
    // disclosure obligation, not decoration — so it cannot be a block somebody
    // can delete. It travels inside the pay button.
    const src = readFileSync("components/checkout/slots.tsx", "utf8");
    const pay = src.slice(src.indexOf("export function PayButtonSlot"));
    expect(pay).toContain("<TrustBlock />");
    expect(src).toContain('href="/refunds"');
  });
});
