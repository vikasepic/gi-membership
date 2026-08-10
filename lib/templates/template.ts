// The template format, and the two ways a template comes to exist.
//
// A template is an array of `Block` — exactly the JSON a page stores, nothing
// new. Built-ins are constructed here through `newBlock`, the same constructor
// the palette uses, so a template cannot hold a shape the builder cannot make.
// Owner-built designs come the other way: `templateSource` reads the blocks
// back out of the builder as a file for `lib/templates/`, which is why no
// block tree is ever written by hand.

import {
  newBlock,
  normalizeBlocks,
  setColumnCount,
  type Block,
  type BlockStyle,
  type BlockType,
} from "@/lib/blocks";
import { slugify } from "@/lib/slug";

export type Template = {
  id: string;
  name: string;
  /** The heading it files under in the library popup. */
  group: string;
  blocks: Block[];
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
