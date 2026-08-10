import {
  MAX_COLUMNS,
  baseStyle,
  findBlock,
  newBlock,
  propsFor,
  setColumnCount,
  type Block,
  type BlockStyle,
  type ColumnStyle,
} from "@/lib/blocks";

/**
 * A cards block, taken apart into real blocks.
 *
 * There are two things people call a template, and conflating them is what made
 * "these are templates, not fixed design" a fair complaint.
 *
 * A PRESET is a bundle of settings on one block. Tiles and Rows are presets:
 * everything they set stays editable afterwards, because settings are all they
 * ever were. What a preset cannot offer is a different set of PARTS — a card is
 * an icon, a title and a body, and no amount of controls on the cards block
 * will let someone put a button under the third one and not the others.
 *
 * So the escape hatch is this: the same design, rebuilt out of blocks that
 * already exist. A container with one column per card, each column holding an
 * image, a heading and a text block. Every part is then a block — droppable,
 * removable, reorderable, styleable — with no new block type, no new editor and
 * no second copy of any template to keep in sync. Every template's take-apart
 * version is "apply the preset, then press this".
 *
 * It only goes one way. Blocks cannot be gathered back into a cards block
 * without guessing which of them were meant to be one card, and a button that
 * silently discarded the button someone added is worse than no button.
 *
 * Nothing here nests: `findBlock` descends one level, so a column holds flat
 * blocks only. That is why the card's own box lives on `columnStyles` rather
 * than on a container inside the column, and why the icon tile is an image
 * block wearing a background rather than a box around one.
 */

/** Cards laid out `across` at a time, in rows of at most MAX_COLUMNS. */
const chunk = <T,>(items: T[], across: number): T[][] => {
  const per = Math.max(1, Math.min(MAX_COLUMNS, across));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out;
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** An emoji or a word reads as an icon; anything with a scheme is a picture. */
const isUrl = (s: string) => /^(https?:\/\/|\/)/i.test(s.trim());

/**
 * The tile behind a card's icon, as a style on the block that draws it.
 *
 * The tile is a fixed square with a fill and a corner. On an image block that
 * is a width, a background and a radius — all three of which every block
 * already has, which is the only reason this conversion needs no new markup.
 */
function tileStyle(p: Record<string, unknown>, block: Block): BlockStyle {
  const box = num(p.iconBox, 44);
  const shape = str(p.iconShape, "rounded");
  const fill = str(p.iconBg);
  return {
    ...baseStyle(),
    width: "custom" as const,
    maxWidthValue: box,
    maxWidthUnit: "px" as const,
    // Beside the copy the tile sits at the start of the line; above it, it
    // follows whatever the card's own alignment is, which is what a preset
    // that centres its cards means by centred.
    blockAlign: str(p.iconPlace, "above") === "beside" ? ("left" as const) : block.style.textAlign,
    radius: shape === "circle" ? 999 : shape === "square" ? 0 : Math.round(box / 4),
    margin: { t: 0, r: 0, b: 12, l: 0, u: "px" as const, link: false },
    ...(fill
      ? { background: { ...baseStyle().background, type: "classic" as const, color: fill } }
      : {}),
  };
}

/**
 * One card's parts, in reading order.
 *
 * A part with nothing in it is not emitted. Someone who took a block apart to
 * add a button to card three does not also want three empty image blocks to
 * delete first, and an empty block here would render as a gap on the live page
 * until they did.
 */
function cardBlocks(item: Record<string, unknown>, p: Record<string, unknown>, block: Block): Block[] {
  const out: Block[] = [];
  const media = str(p.media, "icon");
  const icon = str(item.icon).trim();
  const picture = str(item.image).trim();
  const src = media === "image" ? picture : icon;

  if (media !== "none" && src) {
    if (isUrl(src)) {
      out.push(
        newBlock("image", {
          props: { url: src, alt: "", caption: "", link: "", ratio: "", maxWidth: 100 },
          style: tileStyle(p, block),
        }),
      );
    } else {
      // An emoji is not a picture. It goes in a heading so it stays type — the
      // one thing an image block could not do is let someone change it by
      // typing.
      out.push(
        newBlock("heading", {
          props: { text: src, tag: "p" },
          style: {
            ...tileStyle(p, block),
            textAlign: "center" as const,
            size: num(p.iconSize, 22),
          },
        }),
      );
    }
  }

  if (str(item.title).trim()) {
    out.push(
      newBlock("heading", {
        props: { text: str(item.title), tag: "h3" },
        style: {
          ...baseStyle(),
          textAlign: block.style.textAlign,
          margin: { t: 0, r: 0, b: 8, l: 0, u: "px" as const, link: false },
        },
      }),
    );
  }

  if (str(item.body).trim()) {
    out.push(
      newBlock("text", {
        // The card's body is already stored as HTML the renderer trusts, so it
        // moves across as it is rather than being re-wrapped in a paragraph it
        // may already have.
        props: { html: /<[a-z][\s\S]*>/i.test(str(item.body)) ? str(item.body) : `<p>${str(item.body)}</p>` },
        style: {
          ...baseStyle(),
          textAlign: block.style.textAlign,
          margin: { t: 0, r: 0, b: 0, l: 0, u: "px" as const, link: false },
        },
      }),
    );
  }

  return out;
}

/** The box a card sits in, as the style of the column that replaces it. */
function boxStyle(p: Record<string, unknown>): ColumnStyle | null {
  if (str(p.skin, "boxed") !== "boxed") return null;
  const pad = num(p.cardPadding, 20);
  return {
    ...baseStyle(),
    padding: { t: pad, r: pad, b: pad, l: pad, u: "px", link: true },
    radius: num(p.cardRadius, 12),
    // Deliberately no background: the boxed skin draws its card on the band's
    // own surface, and inventing a colour here would be the conversion changing
    // the design it exists to preserve. The column is a box someone can now
    // give a colour to, which is the point.
  };
}

/**
 * Take a cards block apart. Returns the rows that replace it.
 *
 * More than one row when there are more cards than fit across, because a row
 * holds at most MAX_COLUMNS columns — the same shape someone would have built
 * by hand.
 */
export function explodeCards(block: Block): Block[] {
  if (block.type !== "cards") return [block];
  const p = propsFor(block, "desktop");
  const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
  if (items.length === 0) return [block];

  const across = Math.max(1, Math.min(MAX_COLUMNS, num(p.columns, 3)));
  const gap = num(p.cardGap, 16);
  const box = boxStyle(p);
  const groups = chunk(items, across);

  return groups.map((group, g) => {
    let row = newBlock("row", {
      props: {
        ...newBlock("row").props,
        gap,
        stack: "mobile",
        verticalAlign: "stretch",
        // Grid, not flex: a short card and a tall one beside it should keep the
        // same track width, and that is the difference people notice first
        // between a converted block and the one it came from.
        containerType: "grid",
        gridColumns: String(group.length),
      },
      style: {
        ...baseStyle(),
        // The gap between rows of cards is the gap between cards, or a wrapped
        // grid and a converted one would not line up.
        margin: { t: 0, r: 0, b: g === groups.length - 1 ? 0 : gap, l: 0, u: "px" as const, link: false },
      },
    });
    row = setColumnCount(row, group.length);
    row.columns = group.map((item) => cardBlocks(item, p, block));
    if (box) row.columnStyles = group.map(() => ({ ...box }));
    // An icon beside the copy is a two-column card, which this shape cannot
    // express without nesting. It becomes an icon above — visibly different,
    // which `explodeWarnings` says out loud before the button is pressed.
    return row;
  });
}

/**
 * What converting this block would cost, in words, or null if it costs nothing.
 *
 * Shown before the button is pressed. The conversion is one way, so the one
 * thing it may not do is surprise someone afterwards.
 */
export function explodeWarnings(block: Block): string[] {
  if (block.type !== "cards") return [];
  const p = propsFor(block, "desktop");
  const items = Array.isArray(p.items) ? p.items : [];
  const out: string[] = [];

  if (str(p.iconPlace, "above") === "beside") {
    out.push("Icons move above the text instead of beside it.");
  }
  if (str(p.skin, "boxed") === "list") {
    out.push("The single box around the rows becomes one box per card.");
  }
  if (str(p.title).trim() || str(p.note).trim()) {
    out.push("The card title and closing note are not carried over — copy them out first.");
  }
  if (p.numbered === true) {
    out.push("Automatic numbering stops; the numbers become part of the text you type.");
  }
  if (p.divider === true) {
    out.push("The hairline between cards is dropped — add a Divider block where you want one.");
  }
  if (items.length > Math.max(1, num(p.columns, 3))) {
    out.push("Cards are split across several containers, one per row of the grid.");
  }
  return out;
}


/**
 * Whether this block can be taken apart where it currently sits.
 *
 * A container's column holds flat blocks — `findBlock` descends one level and
 * no further — so a cards block already inside one cannot become a container
 * without nesting. Answered here rather than by letting the conversion run and
 * quietly drop the result, and asked by the button so it can explain itself
 * instead of being mysteriously dead.
 */
export function canExplode(blocks: Block[], id: string): boolean {
  const found = findBlock(blocks, id);
  if (!found || found.block.type !== "cards") return false;
  if (found.parentId !== null) return false;
  const items = propsFor(found.block, "desktop").items;
  return Array.isArray(items) && items.length > 0;
}

/** The page with one cards block replaced by the containers it becomes. */
export function takeApart(blocks: Block[], id: string): Block[] {
  if (!canExplode(blocks, id)) return blocks;
  const found = findBlock(blocks, id)!;
  return [
    ...blocks.slice(0, found.index),
    ...explodeCards(found.block),
    ...blocks.slice(found.index + 1),
  ];
}
