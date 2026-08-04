import { BLOCK_TYPES, ROW_STRUCTURES, type Block, type BlockType } from "@/lib/blocks";

// What the inspector shows for each block.
//
// Data, not JSX — the same decision `SECTIONS` made, and for the same reasons.
// A schema can be tested (every key it edits really exists, no control writes
// somewhere nothing reads), and the panel stays one generic renderer instead of
// eleven hand-written forms that drift apart.
//
// `scope` says where a control writes. Universal look — spacing, colour,
// background — lives in `style` and is shared by every block. Anything only one
// block understands — an aspect ratio, a slide count — lives in `props`.

export type ControlScope = "props" | "style";

type Base = { key: string; label: string; hint?: string; scope?: ControlScope; when?: (b: Block) => boolean };

export type Control =
  | (Base & { kind: "text"; placeholder?: string })
  | (Base & { kind: "textarea"; rows?: number; mono?: boolean })
  | (Base & { kind: "richtext" })
  | (Base & { kind: "image" })
  | (Base & { kind: "select"; options: [string, string][] })
  | (Base & { kind: "toggle" })
  | (Base & { kind: "number"; min: number; max: number; step: number; unit?: string })
  | (Base & { kind: "color" })
  | (Base & { kind: "dim" })
  | (Base & { kind: "list"; item: { key: string; label: string; kind: "text" | "textarea" }[]; addLabel: string })
  | { kind: "group"; label: string; when?: (b: Block) => boolean };

export const isGroup = (c: Control): c is { kind: "group"; label: string } => c.kind === "group";

/** A control's scope, with the default applied. */
export function scopeOf(c: Control): ControlScope {
  if (isGroup(c)) return "props";
  return c.scope ?? "props";
}

const group = (label: string, when?: (b: Block) => boolean): Control => ({ kind: "group", label, ...(when ? { when } : {}) });
const style = <T extends Control>(c: T): T => ({ ...c, scope: "style" as const });

// --- shared typography, offered by anything that renders words ---------------
const TYPOGRAPHY: Control[] = [
  group("Typography"),
  style({ kind: "number", key: "size", label: "Size", min: 10, max: 96, step: 1, unit: "px", hint: "Unset inherits the page's scale." }),
  style({ kind: "number", key: "lineHeight", label: "Line height", min: 0.9, max: 2.4, step: 0.05 }),
  style({ kind: "number", key: "letterSpacing", label: "Letter spacing", min: -3, max: 8, step: 0.1, unit: "px" }),
  style({ kind: "select", key: "weight", label: "Weight", options: [["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Heavy"]] }),
  style({ kind: "select", key: "transform", label: "Case", options: [["none", "As typed"], ["uppercase", "UPPER"], ["lowercase", "lower"], ["capitalize", "Title"]] }),
  style({ kind: "color", key: "color", label: "Colour", hint: "Unset follows the section's band." }),
];

const RATIOS: [string, string][] = [["16/9", "16:9"], ["4/3", "4:3"], ["1/1", "1:1"], ["3/4", "3:4"], ["21/9", "21:9"]];

export type BlockControls = { content: Control[]; style: Control[] };

export const BLOCK_CONTROLS: Record<BlockType, BlockControls> = {
  heading: {
    content: [
      { kind: "textarea", key: "text", label: "Heading", rows: 2 },
      {
        kind: "select",
        key: "tag",
        label: "Tag",
        hint: "Semantics and size. One h1 per page — the rest describe the outline.",
        options: [["h1", "H1"], ["h2", "H2"], ["h3", "H3"], ["h4", "H4"], ["h5", "H5"], ["h6", "H6"]],
      },
    ],
    style: TYPOGRAPHY,
  },

  text: {
    content: [{ kind: "richtext", key: "html", label: "Text" }],
    style: TYPOGRAPHY,
  },

  image: {
    content: [
      { kind: "image", key: "url", label: "Image" },
      { kind: "text", key: "alt", label: "Alt text", hint: "What the image shows. This is what someone using a screen reader gets instead of the picture." },
      { kind: "text", key: "caption", label: "Caption" },
      { kind: "text", key: "link", label: "Links to", placeholder: "https://…" },
    ],
    style: [
      { kind: "select", key: "ratio", label: "Ratio", options: RATIOS },
      { kind: "number", key: "maxWidth", label: "Max width", min: 10, max: 100, step: 5, unit: "%" },
      style({ kind: "number", key: "radius", label: "Corner", min: 0, max: 60, step: 2, unit: "px" }),
    ],
  },

  video: {
    content: [
      { kind: "select", key: "source", label: "Source", options: [["youtube", "YouTube"], ["vimeo", "Vimeo"], ["file", "File"]] },
      { kind: "text", key: "url", label: "Link", placeholder: "https://youtu.be/…", hint: "Only YouTube, Vimeo and https files are embedded. Anything else shows the poster." },
      { kind: "image", key: "poster", label: "Poster" },
      { kind: "toggle", key: "controls", label: "Controls" },
      { kind: "toggle", key: "autoplay", label: "Autoplay", hint: "Autoplay is always muted — browsers block it otherwise." },
      { kind: "toggle", key: "mute", label: "Muted" },
      { kind: "toggle", key: "loop", label: "Loop" },
    ],
    style: [
      { kind: "select", key: "ratio", label: "Ratio", options: RATIOS },
      style({ kind: "number", key: "radius", label: "Corner", min: 0, max: 60, step: 2, unit: "px" }),
    ],
  },

  button: {
    content: [
      { kind: "text", key: "text", label: "Label" },
      { kind: "text", key: "link", label: "Links to", placeholder: "https://…" },
      { kind: "toggle", key: "fullWidth", label: "Full width" },
    ],
    style: [
      group("Colour"),
      style({ kind: "color", key: "background.color", label: "Background", hint: "Unset uses the band's accent. The label recolours itself to stay readable." }),
      style({ kind: "color", key: "color", label: "Label" }),
      group("Shape"),
      style({ kind: "number", key: "radius", label: "Corner", min: 0, max: 999, step: 4, unit: "px" }),
      group("Typography"),
      style({ kind: "number", key: "size", label: "Size", min: 10, max: 40, step: 1, unit: "px" }),
      style({ kind: "select", key: "weight", label: "Weight", options: [["400", "Regular"], ["600", "Semibold"], ["700", "Bold"]] }),
    ],
  },

  iconlist: {
    content: [
      { kind: "list", key: "items", label: "Lines", item: [{ key: "text", label: "Line", kind: "text" }], addLabel: "Add a line" },
      { kind: "select", key: "layout", label: "Layout", options: [["stacked", "Stacked"], ["inline", "Inline"]] },
    ],
    style: [
      group("Icon"),
      { kind: "color", key: "iconColor", label: "Icon colour", hint: "Unset follows the band accent." },
      { kind: "number", key: "iconSize", label: "Icon size", min: 10, max: 40, step: 1, unit: "px" },
      { kind: "number", key: "gap", label: "Gap", min: 0, max: 40, step: 2, unit: "px" },
      ...TYPOGRAPHY,
    ],
  },

  slides: {
    content: [
      {
        kind: "list",
        key: "items",
        label: "Slides",
        hint: "Only quotes you have permission to publish. Never invented names or results.",
        item: [
          { key: "quote", label: "Quote", kind: "textarea" },
          { key: "name", label: "Name", kind: "text" },
          { key: "role", label: "Role", kind: "text" },
        ],
        addLabel: "Add a slide",
      },
      { kind: "number", key: "perView", label: "Shown at once", min: 1, max: 3, step: 1 },
      { kind: "select", key: "skin", label: "Style", options: [["card", "Card"], ["plain", "Plain"], ["bordered", "Bordered"]] },
    ],
    style: [
      group("Card"),
      style({ kind: "color", key: "background.color", label: "Background" }),
      style({ kind: "number", key: "radius", label: "Corner", min: 0, max: 40, step: 2, unit: "px" }),
      ...TYPOGRAPHY,
    ],
  },

  spacer: {
    content: [{ kind: "number", key: "height", label: "Height", min: 4, max: 240, step: 4, unit: "px" }],
    style: [],
  },

  divider: {
    content: [
      { kind: "number", key: "thickness", label: "Thickness", min: 1, max: 12, step: 1, unit: "px" },
      { kind: "number", key: "width", label: "Width", min: 10, max: 100, step: 5, unit: "%" },
    ],
    style: [style({ kind: "color", key: "color", label: "Colour", hint: "Unset uses the band's hairline." })],
  },

  html: {
    content: [
      {
        kind: "textarea",
        key: "code",
        label: "HTML",
        rows: 10,
        mono: true,
        hint: "Layout markup only. Scripts, frames and forms are removed on save — this page also carries the payment form.",
      },
    ],
    style: [],
  },

  row: {
    content: [
      {
        kind: "select",
        key: "structure",
        label: "Columns",
        options: Object.keys(ROW_STRUCTURES).map((k) => [k, k.split("-").join(" · ")] as [string, string]),
      },
      { kind: "number", key: "gap", label: "Gap", min: 0, max: 80, step: 4, unit: "px" },
      { kind: "select", key: "verticalAlign", label: "Align", options: [["stretch", "Stretch"], ["flex-start", "Top"], ["center", "Middle"], ["flex-end", "Bottom"]] },
    ],
    style: [],
  },
};

// --- Advanced, identical for every block ------------------------------------

const bgIs = (t: string) => (b: Block) => b.style.background.type === t;

export const ADVANCED_CONTROLS: Control[] = [
  group("Layout"),
  style({ kind: "dim", key: "margin", label: "Margin" }),
  style({ kind: "dim", key: "padding", label: "Padding" }),
  style({ kind: "select", key: "width", label: "Width", options: [["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"], ["full", "Full"]] }),
  style({ kind: "select", key: "align", label: "Align", options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] }),

  group("Background"),
  style({ kind: "select", key: "background.type", label: "Type", options: [["none", "None"], ["classic", "Classic"], ["gradient", "Gradient"]] }),
  style({ kind: "color", key: "background.color", label: "Colour", when: bgIs("classic") }),
  style({ kind: "image", key: "background.image", label: "Image", when: bgIs("classic") }),
  style({ kind: "select", key: "background.size", label: "Size", options: [["cover", "Cover"], ["contain", "Contain"], ["auto", "Auto"]], when: bgIs("classic") }),
  style({ kind: "select", key: "background.position", label: "Position", options: [["center", "Centre"], ["top", "Top"], ["bottom", "Bottom"]], when: bgIs("classic") }),
  style({ kind: "select", key: "background.repeat", label: "Repeat", options: [["no-repeat", "No"], ["repeat", "Tile"]], when: bgIs("classic") }),
  style({ kind: "color", key: "background.from", label: "Colour one", when: bgIs("gradient") }),
  style({ kind: "number", key: "background.fromAt", label: "Location", min: 0, max: 100, step: 1, unit: "%", when: bgIs("gradient") }),
  style({ kind: "color", key: "background.to", label: "Colour two", when: bgIs("gradient") }),
  style({ kind: "number", key: "background.toAt", label: "Location", min: 0, max: 100, step: 1, unit: "%", when: bgIs("gradient") }),
  style({ kind: "select", key: "background.shape", label: "Shape", options: [["linear", "Linear"], ["radial", "Radial"]], when: bgIs("gradient") }),
  style({
    kind: "number",
    key: "background.angle",
    label: "Angle",
    min: 0,
    max: 360,
    step: 5,
    unit: "deg",
    when: (b) => b.style.background.type === "gradient" && b.style.background.shape === "linear",
  }),
  style({ kind: "number", key: "radius", label: "Corner", min: 0, max: 80, step: 2, unit: "px", when: (b) => b.style.background.type !== "none" }),

  group("Visibility"),
  style({ kind: "toggle", key: "hideDesktop", label: "Hide on desktop" }),
  style({ kind: "toggle", key: "hideTablet", label: "Hide on tablet" }),
  style({ kind: "toggle", key: "hideMobile", label: "Hide on mobile" }),

  group("Attributes"),
  style({ kind: "text", key: "cssId", label: "CSS id", placeholder: "pricing" }),
  style({ kind: "text", key: "cssClass", label: "CSS class", placeholder: "promo highlight" }),
];

/** The three tabs for one block, with controls that do not apply left out. */
export function controlsFor(block: Block): { content: Control[]; style: Control[]; advanced: Control[] } {
  const defs = BLOCK_CONTROLS[block.type];
  const keep = (list: Control[]) => list.filter((c) => !c.when || c.when(block));
  return {
    content: keep(defs.content),
    style: keep(defs.style),
    advanced: keep(ADVANCED_CONTROLS),
  };
}

/** Read a control's current value, following a dotted key such as background.color. */
export function readControl(block: Block, c: Control): unknown {
  if (isGroup(c)) return undefined;
  const root: Record<string, unknown> = scopeOf(c) === "style" ? (block.style as unknown as Record<string, unknown>) : block.props;
  return c.key.split(".").reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, root);
}

/**
 * A block with one control's value changed.
 *
 * Immutable all the way down the dotted path, because the editor holds this in
 * React state — writing through the path in place would not re-render.
 */
export function writeControl(block: Block, c: Control, value: unknown): Block {
  if (isGroup(c)) return block;
  const path = c.key.split(".");
  const scope = scopeOf(c);
  const root = scope === "style" ? (block.style as unknown as Record<string, unknown>) : block.props;
  const next = setIn(root, path, value);
  return scope === "style"
    ? { ...block, style: next as unknown as Block["style"] }
    : { ...block, props: next };
}

function setIn(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const base = child && typeof child === "object" && !Array.isArray(child) ? (child as Record<string, unknown>) : {};
  return { ...obj, [head]: setIn(base, rest, value) };
}

/** Every block type, in the order the palette offers them. */
export const PALETTE: { type: BlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  { type: "button", label: "Button" },
  { type: "iconlist", label: "List" },
  { type: "slides", label: "Slides" },
  { type: "row", label: "Columns" },
  { type: "spacer", label: "Spacer" },
  { type: "divider", label: "Divider" },
  { type: "html", label: "HTML" },
];

export const BLOCK_LABEL: Record<BlockType, string> = Object.fromEntries(
  BLOCK_TYPES.map((t) => [t, PALETTE.find((p) => p.type === t)?.label ?? t]),
) as Record<BlockType, string>;
