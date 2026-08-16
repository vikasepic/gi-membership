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

describe("the sticky bar is one decision, asked once", () => {
  // The upsell suppresses its built-in bar when the page carries a Sticky bar
  // block, and the offer's page editor tells you which of the two you are
  // looking at. Two copies of that check would be a panel saying one thing
  // while the page does the other.
  it("is asked through the shared helper in both places", () => {
    for (const f of [
      "components/oto/sections-template.tsx",
      "app/admin/offers/[id]/page-editor/page.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("hasStickyBarBlock");
      // Not reimplemented alongside it.
      expect(src, f).not.toContain('b.type === "stickybar"');
    }
  });
});

describe("a link to an #id glides rather than jumps", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("scrolls smoothly by default", () => {
    expect(css).toContain("scroll-behavior: smooth");
  });

  it("goes back to an instant jump for anyone who asked for less motion", () => {
    // Long smooth travel is a documented migraine and vestibular trigger.
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(css.slice(at, at + 400)).toContain("scroll-behavior: auto");
  });

  it("stops the target landing under the sticky header", () => {
    expect(css).toContain("scroll-margin-top");
  });

  it("does not override the preference from JavaScript", () => {
    // scrollIntoView({behavior:"smooth"}) wins over the media query, which the
    // stylesheet cannot then undo.
    const bar = readFileSync("components/page/sticky-bar-block.tsx", "utf8");
    expect(bar).not.toContain('behavior: "smooth"');
  });
});

describe("the store's typography cannot inflate the checkout", () => {
  // Site typography writes `:root h1` and `:root p` for the sales pages. Those
  // are 0-1-1 and beat every Tailwind size class (0-1-0), so a checkout that
  // sized itself with classes rendered its product name at whatever the sales
  // pages use — around 90px on this store — and its tax footnote as a
  // paragraph. An inline style is the only declaration that wins without
  // reaching into a setting that belongs to the sales pages.
  it("sizes the checkout title inline", () => {
    const src = readFileSync("components/checkout/checkout-panel.tsx", "utf8");
    const h1 = src.slice(src.indexOf("<h1"), src.indexOf("</h1>"));
    expect(h1).toContain("fontSize");
    // clamp, not a breakpoint: the bad case is a long name in between, where
    // it wraps to four lines and pushes the card fields off a phone.
    expect(h1).toContain("clamp(");
  });

  it("sizes the checkout's small print inline", () => {
    const src = readFileSync("components/checkout/slots.tsx", "utf8");
    // Every <p> in the checkout's pieces carries its own size; the store's
    // paragraph rule reaches all of them.
    const paragraphs = src.match(/<p\b[^>]*>/g) ?? [];
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const tag of paragraphs) expect(tag, tag).toMatch(/FINE|SMALL|fontSize/);
  });
});

describe("the two checkouts ask their questions in the same order", () => {
  // What am I buying, what does it cost, how do I pay. A form that asks for a
  // card above the total asks somebody to commit before it has said to what.
  const order = (src: string, marks: string[]) => marks.map((m) => src.indexOf(m));
  const rising = (xs: number[]) => xs.every((x, i) => x > -1 && (i === 0 || x > xs[i - 1]));

  it("puts the summary before the card fields on the product checkout", () => {
    const src = readFileSync("components/checkout/slots.tsx", "utf8");
    const layout = src.slice(src.indexOf("export function DefaultCheckoutLayout"));
    expect(rising(order(layout, ["OrderSummarySlot", "CouponSlot", "CardFieldsSlot", "DueTodaySlot", "PayButtonSlot"]))).toBe(true);
  });

  it("puts it before the card fields on the offer checkout too", () => {
    const src = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");
    expect(rising(order(src, ["Order summary", "<PaymentElement", "type=\"submit\""]))).toBe(true);
  });

  it("gives the offer checkout a summary at all", () => {
    // It had none: the one page where somebody confirms a subscription showed
    // a total with nothing above it saying what the total was for.
    const src = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");
    expect(src).toContain("Order summary");
  });
});

describe("a button looks like a button", () => {
  // Tailwind v4 changed its reset: `button` gets `cursor: default`, where v3
  // gave it `pointer`. Every button in the store and the admin lost it at once,
  // and it reads worst on the one that takes the money — a pay button that does
  // not respond to the cursor looks like a picture of a pay button.
  const css = readFileSync("app/globals.css", "utf8");

  it("restores the pointer", () => {
    expect(css).toContain("button:not(:disabled)");
    expect(css).toContain("cursor: pointer");
  });

  it("says not-allowed on a disabled one", () => {
    // The difference between "this is broken" and "not yet".
    expect(css).toContain("cursor: not-allowed");
  });
});

describe("the discount field is folded away until asked for", () => {
  const slots = readFileSync("components/checkout/slots.tsx", "utf8");

  it("shows a link rather than an empty box", () => {
    expect(slots).toContain("Have a discount code?");
  });

  it("stays open once a code has stuck", () => {
    // A panel that collapses over an applied discount looks like it removed it.
    expect(slots).toContain("open || Boolean(c.coupon) || Boolean(c.couponError)");
  });

  it("confirms the discount at the control that applied it", () => {
    expect(slots).toContain("applied");
  });

  it("does the same on the offer checkout", () => {
    const offer = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");
    expect(offer).toContain("Have a discount code?");
    expect(offer).toContain("couponOpen");
  });
});
