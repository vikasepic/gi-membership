import { describe, it, expect } from "vitest";
import { blockRendersNothing, normalizeBlocks, newBlock } from "@/lib/blocks";

/**
 * A Ways to pay block that names an offer.
 *
 * A product page has one price of its own and no offer behind it, so a block
 * there has to say what it sells. The resolution happens server-side in one
 * pass; what is worth pinning here is the shape the block stores, because
 * stored blocks are untrusted JSON and an id that no longer resolves has to
 * drop out rather than draw something wrong.
 */
describe("what a Ways to pay block stores", () => {
  it("starts blank, meaning whatever this page already sells", () => {
    // An offer's own page knows its offer; blank is the right default there
    // and the only safe one anywhere else, because it draws nothing.
    expect(newBlock("prices").props.offerId).toBe("");
  });

  it("keeps a named offer through a save and a reload", () => {
    const b = newBlock("prices");
    const named = { ...b, props: { ...b.props, offerId: "abc-123" } };
    expect(normalizeBlocks([named])[0].props.offerId).toBe("abc-123");
  });

  it("is never treated as empty, however it is configured", () => {
    // The prices come from an offer rather than from anything typed in, so
    // there is nothing here that can be "missing" — and a block the editor
    // hides is a block nobody can fix.
    expect(blockRendersNothing(newBlock("prices"))).toBe(false);
    expect(blockRendersNothing(newBlock("stickybar"))).toBe(false);
  });
});

