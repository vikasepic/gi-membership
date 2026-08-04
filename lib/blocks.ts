// The block tree.
//
// A section keeps its typed fields — a proof section still stores quotes with
// names, which is what lets it refuse invented testimonials. Blocks are the
// free-form half, stored at `content.blocks` on the same row, so adding them
// needed no migration and cannot disturb a page that has none.
//
// Everything here is pure and immutable: the editor holds the tree in React
// state and the renderer is a server component, so a mutation in place would
// either not re-render or leak between requests.

export const BLOCK_TYPES = [
  "heading",
  "text",
  "image",
  "video",
  "button",
  "iconlist",
  "slides",
  "spacer",
  "divider",
  "html",
  "row",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type Unit = "px" | "em" | "%" | "rem";
export type Dim = { t: number; r: number; b: number; l: number; u: Unit; link: boolean };

export type BackgroundType = "none" | "classic" | "gradient";
export type Background = {
  type: BackgroundType;
  color: string | null;
  image: string;
  size: "cover" | "contain" | "auto";
  position: "center" | "top" | "bottom";
  repeat: "no-repeat" | "repeat";
  from: string | null;
  fromAt: number;
  to: string | null;
  toAt: number;
  shape: "linear" | "radial";
  angle: number;
};

/**
 * `null` means "inherit from the band".
 *
 * This is the whole reason a section preset can repaint what is standing on it.
 * A colour frozen at the moment a block was created is a colour that survives
 * the switch to a dark band and becomes dark ink on a dark ground.
 */
export type BlockStyle = {
  margin: Dim;
  padding: Dim;
  width: "narrow" | "normal" | "wide" | "full";
  align: "left" | "center" | "right";
  size: number | null;
  lineHeight: number | null;
  letterSpacing: number | null;
  weight: number | null;
  transform: "none" | "uppercase" | "lowercase" | "capitalize";
  color: string | null;
  background: Background;
  radius: number;
  cssId: string;
  cssClass: string;
  hideDesktop: boolean;
  hideTablet: boolean;
  hideMobile: boolean;
};

export type Block = {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  style: BlockStyle;
  /** Rows only: one array of blocks per column. */
  columns?: Block[][];
};

/** Where a block is being put. */
export type DropTarget =
  | { zone: "root"; index: number }
  | { zone: "column"; rowId: string; column: number; index: number };

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export const dim = (t = 0, r = 0, b = 0, l = 0, u: Unit = "px", link = false): Dim => ({ t, r, b, l, u, link });

export const emptyBackground = (): Background => ({
  type: "none",
  color: null,
  image: "",
  size: "cover",
  position: "center",
  repeat: "no-repeat",
  from: null,
  fromAt: 0,
  to: null,
  toAt: 100,
  shape: "linear",
  angle: 135,
});

export const baseStyle = (over: Partial<BlockStyle> = {}): BlockStyle => ({
  margin: dim(0, 0, 16, 0),
  padding: dim(0, 0, 0, 0),
  width: "normal",
  align: "left",
  size: null,
  lineHeight: null,
  letterSpacing: null,
  weight: null,
  transform: "none",
  color: null,
  background: emptyBackground(),
  radius: 0,
  cssId: "",
  cssClass: "",
  hideDesktop: false,
  hideTablet: false,
  hideMobile: false,
  ...over,
});

/** The columns each row structure produces. */
export const ROW_STRUCTURES = {
  "1": [1],
  "1-1": [1, 1],
  "1-1-1": [1, 1, 1],
  "1-1-1-1": [1, 1, 1, 1],
  "2-1": [2, 1],
  "1-2": [1, 2],
} as const;
export type RowStructure = keyof typeof ROW_STRUCTURES;

const DEFAULT_PROPS: Record<BlockType, Record<string, unknown>> = {
  heading: { text: "Your heading", tag: "h2" },
  text: { html: "<p>Write something here.</p>" },
  image: { url: "", alt: "", caption: "", link: "", ratio: "16/9", maxWidth: 100 },
  video: { source: "youtube", url: "", poster: "", controls: true, mute: true, autoplay: false, loop: false, ratio: "16/9" },
  button: { text: "Get instant access", link: "", fullWidth: false },
  iconlist: { items: [], layout: "stacked", iconSize: 16, gap: 8, iconColor: null },
  slides: { items: [], skin: "card", perView: 1, arrows: true, dots: true },
  spacer: { height: 40 },
  divider: { thickness: 1, width: 100 },
  html: { code: "" },
  row: { structure: "1-1", verticalAlign: "stretch", gap: 24 },
};

/** A stable id. Prefixed so a malformed id in stored JSON is obvious. */
function newId(): string {
  const g = globalThis.crypto;
  return `b_${g && "randomUUID" in g ? g.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}

export function newBlock(type: BlockType, over: Partial<Block> = {}): Block {
  const block: Block = {
    id: newId(),
    type,
    props: { ...DEFAULT_PROPS[type] },
    style: baseStyle(type === "row" ? { width: "wide" } : {}),
    ...over,
  };
  if (type === "row" && !block.columns) {
    const structure = String(block.props.structure ?? "1-1") as RowStructure;
    block.columns = (ROW_STRUCTURES[structure] ?? ROW_STRUCTURES["1-1"]).map(() => []);
  }
  return block;
}

// ---------------------------------------------------------------------------
// Reading stored JSON
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** null stays null — it is the value that means "inherit". */
const colorOrNull = (v: unknown): string | null =>
  typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : null;

function normalizeDim(v: unknown, fallback: Dim): Dim {
  if (!isRecord(v)) return fallback;
  return {
    t: num(v.t, fallback.t),
    r: num(v.r, fallback.r),
    b: num(v.b, fallback.b),
    l: num(v.l, fallback.l),
    u: oneOf(v.u, ["px", "em", "%", "rem"] as const, fallback.u),
    link: v.link === true,
  };
}

function normalizeBackground(v: unknown): Background {
  const d = emptyBackground();
  if (!isRecord(v)) return d;
  return {
    type: oneOf(v.type, ["none", "classic", "gradient"] as const, d.type),
    color: colorOrNull(v.color),
    image: str(v.image),
    size: oneOf(v.size, ["cover", "contain", "auto"] as const, d.size),
    position: oneOf(v.position, ["center", "top", "bottom"] as const, d.position),
    repeat: oneOf(v.repeat, ["no-repeat", "repeat"] as const, d.repeat),
    from: colorOrNull(v.from),
    fromAt: num(v.fromAt, d.fromAt),
    to: colorOrNull(v.to),
    toAt: num(v.toAt, d.toAt),
    shape: oneOf(v.shape, ["linear", "radial"] as const, d.shape),
    angle: num(v.angle, d.angle),
  };
}

function normalizeStyle(v: unknown): BlockStyle {
  const d = baseStyle();
  if (!isRecord(v)) return d;
  const nullableNum = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    margin: normalizeDim(v.margin, d.margin),
    padding: normalizeDim(v.padding, d.padding),
    width: oneOf(v.width, ["narrow", "normal", "wide", "full"] as const, d.width),
    align: oneOf(v.align, ["left", "center", "right"] as const, d.align),
    size: nullableNum(v.size),
    lineHeight: nullableNum(v.lineHeight),
    letterSpacing: nullableNum(v.letterSpacing),
    weight: nullableNum(v.weight),
    transform: oneOf(v.transform, ["none", "uppercase", "lowercase", "capitalize"] as const, d.transform),
    color: colorOrNull(v.color),
    background: normalizeBackground(v.background),
    radius: num(v.radius, d.radius),
    cssId: str(v.cssId).trim(),
    cssClass: str(v.cssClass).trim(),
    hideDesktop: v.hideDesktop === true,
    hideTablet: v.hideTablet === true,
    hideMobile: v.hideMobile === true,
  };
}

/**
 * How deep a row may nest inside a row.
 *
 * Elementor allows more; two is enough for any sales-page layout and it makes
 * the tree provably finite. Stored JSON is untrusted input — a page whose rows
 * reference each other would otherwise render until the request dies.
 */
export const MAX_DEPTH = 2;

/**
 * Turn whatever is in the database into a tree we can render.
 *
 * Anything unrecognised is dropped rather than repaired: a block with no known
 * type has no renderer, and guessing one publishes something nobody wrote.
 */
export function normalizeBlocks(value: unknown, depth = 0): Block[] {
  if (!Array.isArray(value) || depth > MAX_DEPTH) return [];
  const out: Block[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const type = raw.type;
    if (typeof type !== "string" || !(BLOCK_TYPES as readonly string[]).includes(type)) continue;
    const t = type as BlockType;
    const block: Block = {
      id: str(raw.id).trim() || newId(),
      type: t,
      props: { ...DEFAULT_PROPS[t], ...(isRecord(raw.props) ? raw.props : {}) },
      style: normalizeStyle(raw.style),
    };
    if (t === "row") {
      const structure = oneOf(
        block.props.structure,
        Object.keys(ROW_STRUCTURES) as RowStructure[],
        "1-1",
      );
      block.props.structure = structure;
      const want = ROW_STRUCTURES[structure].length;
      const stored = Array.isArray(raw.columns) ? raw.columns : [];
      block.columns = Array.from({ length: want }, (_, i) => normalizeBlocks(stored[i], depth + 1));
    }
    out.push(block);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tree operations — all immutable
// ---------------------------------------------------------------------------

export type Found = {
  block: Block;
  /** The array the block actually lives in. */
  siblings: Block[];
  index: number;
  /** The row it is nested in, if any. */
  parentId: string | null;
  column: number | null;
};

export function findBlock(blocks: Block[], id: string): Found | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.id === id) return { block: b, siblings: blocks, index: i, parentId: null, column: null };
    if (b.columns) {
      for (let c = 0; c < b.columns.length; c++) {
        const col = b.columns[c];
        for (let j = 0; j < col.length; j++) {
          if (col[j].id === id) {
            return { block: col[j], siblings: col, index: j, parentId: b.id, column: c };
          }
        }
      }
    }
  }
  return null;
}

/** Every block, top level and nested, in reading order. */
export function walkBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    out.push(b);
    if (b.columns) for (const col of b.columns) out.push(...walkBlocks(col));
  }
  return out;
}

const clampIndex = (i: number, len: number) => Math.max(0, Math.min(i, len));

export function insertBlock(blocks: Block[], block: Block, target: DropTarget): Block[] {
  if (target.zone === "root") {
    const next = [...blocks];
    next.splice(clampIndex(target.index, next.length), 0, block);
    return next;
  }
  return blocks.map((b) => {
    if (b.id !== target.rowId || !b.columns) return b;
    // A row inside a column inside a row is where this stops being a layout
    // and starts being a puzzle — and MAX_DEPTH has to hold on insert too, or
    // normalizeBlocks silently deletes what the editor just accepted.
    if (block.type === "row") return b;
    const columns = b.columns.map((col, c) => {
      if (c !== target.column) return col;
      const next = [...col];
      next.splice(clampIndex(target.index, next.length), 0, block);
      return next;
    });
    return { ...b, columns };
  });
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) =>
      b.columns ? { ...b, columns: b.columns.map((col) => col.filter((x) => x.id !== id)) } : b,
    );
}

export function updateBlock(blocks: Block[], id: string, patch: (b: Block) => Block): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return patch(b);
    if (!b.columns) return b;
    return { ...b, columns: b.columns.map((col) => col.map((x) => (x.id === id ? patch(x) : x))) };
  });
}

/**
 * Move a block to a new place.
 *
 * Removing first and then inserting is what makes "drag it two places down"
 * land where the cursor is: after the removal every index above the old one
 * has shifted by one, and inserting against the original index puts it one
 * slot short of where it was dropped.
 */
export function moveBlock(blocks: Block[], id: string, target: DropTarget): Block[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  // Dropping a row into a column is refused rather than silently ignored at
  // insert time, so the caller can leave the block where it was.
  if (found.block.type === "row" && target.zone === "column") return blocks;

  const sameList =
    (target.zone === "root" && found.parentId === null) ||
    (target.zone === "column" && found.parentId === target.rowId && found.column === target.column);

  const without = removeBlock(blocks, id);
  const index = sameList && target.index > found.index ? target.index - 1 : target.index;
  return insertBlock(without, found.block, { ...target, index } as DropTarget);
}

/** A copy with fresh ids, so the duplicate is a separate block all the way down. */
export function duplicateBlock(blocks: Block[], id: string): Block[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  const copy = reid(found.block);
  const target: DropTarget =
    found.parentId === null
      ? { zone: "root", index: found.index + 1 }
      : { zone: "column", rowId: found.parentId, column: found.column ?? 0, index: found.index + 1 };
  // insertBlock refuses a row into a column; a duplicate of a nested block is
  // never a row, so this is safe.
  return insertBlock(blocks, copy, target);
}

function reid(b: Block): Block {
  return {
    ...b,
    id: newId(),
    props: { ...b.props },
    style: { ...b.style, margin: { ...b.style.margin }, padding: { ...b.style.padding }, background: { ...b.style.background } },
    ...(b.columns ? { columns: b.columns.map((col) => col.map(reid)) } : {}),
  };
}

/** True when a section's canvas has nothing worth rendering. */
export function blocksAreEmpty(blocks: Block[]): boolean {
  return walkBlocks(blocks).length === 0;
}

/**
 * True when a block would put nothing on the page.
 *
 * Distinct from `blocksAreEmpty`, which asks whether the canvas has anything on
 * it at all — a row someone placed but has not filled counts as content there,
 * because the editor must still show it. Here the question is what a buyer
 * sees, and a wrapper with padding and no content is a gap in the page that
 * nobody put there on purpose.
 *
 * A spacer and a divider are never empty: both exist precisely to occupy space.
 */
export function blockRendersNothing(block: Block): boolean {
  const p = block.props;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  switch (block.type) {
    case "heading":
      return !text(p.text);
    case "text":
      return !text(p.html).replace(/<[^>]*>/g, "").trim();
    case "html":
      return !text(p.code);
    case "image":
      return !text(p.url);
    case "video":
      return !text(p.url) && !text(p.poster);
    case "button":
      return !text(p.text);
    case "iconlist":
    case "slides":
      return list(p.items) === 0;
    case "row":
      return (block.columns ?? []).every((col) => col.every(blockRendersNothing));
    case "spacer":
    case "divider":
      return false;
  }
}

/**
 * Which slot a pointer at `clientY` is aiming at.
 *
 * Above or below the block, decided by its midpoint. Elementor does the same,
 * and the alternative — thin gaps between blocks as the only drop targets — is
 * what makes a builder feel like it is refusing the drop.
 */
export function edgeIndex(clientY: number, top: number, height: number, index: number): number {
  return clientY < top + height / 2 ? index : index + 1;
}

/**
 * Where a click on the palette puts the new block.
 *
 * Directly after whatever is selected, including inside a column — someone
 * looking at a block expects the next one to land under it, not at the far
 * bottom of the page. With nothing selected it goes at the end.
 *
 * A row is the exception: it cannot nest inside a column, so it goes to the
 * end of the canvas rather than silently not appearing.
 */
export function addTarget(blocks: Block[], selectedId: string | null, type: BlockType): DropTarget {
  const found = selectedId ? findBlock(blocks, selectedId) : null;
  if (!found) return { zone: "root", index: blocks.length };
  if (found.parentId !== null) {
    if (type === "row") return { zone: "root", index: blocks.length };
    return { zone: "column", rowId: found.parentId, column: found.column ?? 0, index: found.index + 1 };
  }
  return { zone: "root", index: found.index + 1 };
}
