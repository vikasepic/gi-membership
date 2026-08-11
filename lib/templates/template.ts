// The template format, and the two ways a template comes to exist.
//
// A template is an array of `Block` — exactly the JSON a page stores, nothing
// new. Built-ins are constructed here through `newBlock`, the same constructor
// the palette uses, so a template cannot hold a shape the builder cannot make.
// Owner-built designs come the other way: `templateSource` reads the blocks
// back out of the builder as a file for `lib/templates/`, which is why no
// block tree is ever written by hand.

import {
  baseStyle,
  dim,
  emptyBackground,
  newBlock,
  normalizeBlocks,
  setColumnCount,
  type Block,
  type BlockStyle,
  type Background,
  type BlockType,
  type ColumnStyle,
  type ResponsiveStyle,
} from "@/lib/blocks";
import { slugify } from "@/lib/slug";
import type { SectionLayout } from "@/lib/page-sections";

/**
 * The band a design was drawn on.
 *
 * A template is blocks, and blocks live inside the section's own column — so
 * the ground a design stands on has never been the template's to give. That
 * left "set the section background to #e9dde6 yourself" as a step in a
 * document, which is a step nobody performs. Now that a section stores its
 * colour, its width and its air, a design can carry the band it was drawn for
 * and the insert can set it.
 *
 * Every field is optional: a template that says nothing about the band is
 * dropped onto whatever band is already there, which is what the generic
 * starters want.
 */
export type TemplateBand = {
  /** A preset key — "paper", "navy". The ink comes with it. */
  style?: string;
  /** A colour over the preset, for the grounds no preset has. */
  color?: string | null;
  /** How wide the band holds the design, and how much air. */
  layout?: Partial<SectionLayout>;
};

export type Template = {
  id: string;
  name: string;
  /** The heading it files under in the library popup. */
  group: string;
  blocks: Block[];
  /** The band this design was drawn on, applied when it is inserted. */
  band?: TemplateBand;
};

/** A block with its props and style adjusted, the way the palette presets do. */
export function make(
  type: BlockType,
  props: Record<string, unknown> = {},
  style: Partial<BlockStyle> = {},
): Block {
  const b = newBlock(type);
  return { ...b, props: { ...b.props, ...props }, style: { ...b.style, ...style } };
}

/**
 * One column's style — how it sits in the row, and what it paints.
 *
 * Margin starts at zero rather than `baseStyle`'s 16px bottom: that default is
 * for a block in a stack of blocks, and on a column it is a 16px gap under
 * every column that nobody asked for.
 */
export const col = (
  over: Partial<BlockStyle> & { responsive?: ResponsiveStyle } = {},
): ColumnStyle => {
  // Split out rather than passed through: `baseStyle` takes a style, and the
  // overrides are a sibling of the style rather than part of it. Left in, they
  // would be dropped by normalize and "align this column to the top on mobile"
  // would silently not save — the same trap `columnAsBlock` splits them for.
  const { responsive, ...style } = over;
  const base = baseStyle({ margin: dim(0, 0, 0, 0), ...style });
  return responsive ? { ...base, responsive } : base;
};

/**
 * A flat colour behind a block or a column.
 *
 * Through `emptyBackground` rather than a literal, so a template picks up
 * every field a background grows later at its own default — a hand-written
 * object here would be missing them and fail to typecheck the day one is
 * added, which is the good outcome, but it would also silently mean "none"
 * for anything normalize spreads rather than requires.
 */
export const fill = (color: string): Background => ({
  ...emptyBackground(),
  type: "classic",
  color,
});

/**
 * Per-device overrides, with the device you did not mention left alone.
 *
 * `ResponsiveStyle` names both widths because an override is read by layering
 * mobile over tablet over desktop, and a missing key there would be ambiguous
 * between "same as tablet" and "nothing set". Most of a template's overrides
 * only touch one width, so this fills the other with the empty patch — which
 * layers to exactly the desktop value.
 */
export const at = (over: {
  tablet?: { style?: Partial<BlockStyle>; props?: Record<string, unknown> };
  mobile?: { style?: Partial<BlockStyle>; props?: Record<string, unknown> };
}): ResponsiveStyle => ({
  tablet: { style: over.tablet?.style ?? {}, props: over.tablet?.props ?? {} },
  mobile: { style: over.mobile?.style ?? {}, props: over.mobile?.props ?? {} },
});

/** A row holding these columns, widths even, props merged over the row's own. */
export function rowOf(columns: Block[][], props: Record<string, unknown> = {}): Block {
  const r = setColumnCount(newBlock("row"), columns.length);
  return { ...r, columns: columns.map((c) => [...c]), props: { ...r.props, ...props } };
}

/**
 * A section's blocks as a file for `lib/templates/`.
 *
 * Normalized first, so what lands in the file is exactly what a reload would
 * make of it — a template whose stored form drifts on read is a design that
 * changes behind the owner's back. The JSON is the file: `JSON.stringify`
 * output is a valid TypeScript literal, so the export needs no code generator.
 */
export function templateSource(name: string, blocks: Block[]): string {
  const clean = name.trim() || "Untitled";
  const template: Template = {
    id: slugify(clean),
    name: clean,
    group: "Custom",
    blocks: normalizeBlocks(blocks),
  };
  return [
    `// Exported from the builder. Drop this file into lib/templates/ and add it`,
    `// to BUILT_INS in lib/templates/index.ts.`,
    `import type { Template } from "./template";`,
    ``,
    `export const template: Template = ${JSON.stringify(template, null, 2)};`,
    ``,
  ].join("\n");
}
