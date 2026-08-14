import {
  FIXED_CHECKOUT_TYPES,
  baseStyle,
  dim,
  emptyBackground,
  newBlock,
  normalizeBlocks,
  type Block,
} from "@/lib/blocks";

/**
 * The checkout the store laid out — but only if it can still take money.
 *
 * Everything else in this app renders whatever the editor saved. This page does
 * not, and the reason is worth being blunt about: a sales page missing a block
 * is a worse sales page, while a checkout missing its card fields is a shop
 * with the till taken out. It fails silently, it fails for everyone, and it
 * fails on the one page where failure costs money rather than attention.
 *
 * So the layout is checked before it is trusted, and a layout without all four
 * essential parts is refused whole. The caller then renders the arrangement
 * that shipped — a checkout that works and is not the one somebody drew, which
 * is the better of the two ways to be wrong here.
 *
 * The editor stops you deleting these in the first place. This is the second
 * line, for the ways a row can arrive that the editor never saw: an import, a
 * copied page, a direct write, a block type retired in a later version.
 */

/** Every block in the tree, containers unwrapped. */
export function flattenBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      out.push(b);
      // A row holds its children in columns; a checkout's two zones ARE a row,
      // so a check that did not look inside one would refuse every real layout.
      if (Array.isArray(b.columns)) for (const col of b.columns) walk(col);
    }
  };
  walk(blocks);
  return out;
}

/** Which of the parts a checkout cannot do without are missing from this tree. */
export function missingFixedBlocks(blocks: Block[]): string[] {
  const present = new Set(flattenBlocks(blocks).map((b) => b.type));
  return FIXED_CHECKOUT_TYPES.filter((t) => !present.has(t));
}

/**
 * The layout to render, or null to fall back.
 *
 * Null on three separate counts, all of which mean the same thing to the page:
 * nothing saved, nothing in it, or something essential missing.
 */
export function usableCheckoutLayout(blocks: unknown): Block[] | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const normalized = normalizeBlocks(blocks);
  if (normalized.length === 0) return null;
  if (missingFixedBlocks(normalized).length > 0) return null;
  return normalized;
}

/**
 * The checkout as it ships, as blocks — the starting point in the editor.
 *
 * Deliberately the same arrangement the hand-written page has always had, so
 * opening the editor for the first time shows the checkout that is already
 * live rather than an empty canvas beside a working page nobody can find the
 * source of.
 *
 * Two columns: what they are buying and why to trust us on the left, nothing
 * but the transaction on the right.
 */
export function checkoutStarterBlocks(): Record<string, Block[]> {
  // A gap under everything. A new block arrives with no margin at all, which is
  // right for a canvas somebody is arranging by hand and wrong for a starting
  // point — a checkout with its fields touching reads as broken before anybody
  // has typed a word.
  const b = (type: string, props: Record<string, unknown> = {}, gap = 18) => {
    const block = newBlock(type as Parameters<typeof newBlock>[0]);
    return {
      ...block,
      props: { ...block.props, ...props },
      style: { ...block.style, margin: dim(0, 0, gap, 0) },
    };
  };

  const row = b("row", { structure: "1-1" }, 0);

  return {
    panel: [
      {
        ...row,
        // The money column is a panel, the selling column is not. That contrast
        // is what makes one side read as a form to fill in — and it is a column
        // style, so it comes apart with two clicks if a store wants it flat.
        columnStyles: [
          null,
          {
            ...baseStyle(),
            padding: dim(24, 24, 24, 24, "px", true),
            radius: 24,
            borderWidth: 1,
            background: { ...emptyBackground(), type: "classic", color: "#ffffff" },
          },
        ],
        columns: [
          [
            b("heading", { text: "You are one step away.", tag: "h2" }),
            b("text", {
              html: "<p>Instant access the moment payment clears. No password to create — we email you a link that signs you in.</p>",
            }),
            b("buyerdetails", { title: "Your details" }),
            b("orderbump", { title: "One more thing" }),
          ],
          [
            b("ordersummary", { title: "Your order" }),
            b("coupon"),
            b("cardfields", { heading: "Payment" }),
            b("duetoday"),
            b("paybutton", {}, 0),
          ],
        ],
      },
    ],
    after: [],
  };
}
