import {
  BLOCK_TYPES,
  MAX_COLUMNS,
  clearAt,
  propsFor,
  setAt,
  setColumnCount,
  styleFor,
  type Block,
  type BlockType,
  type Device,
} from "@/lib/blocks";

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

type Base = {
  key: string;
  label: string;
  hint?: string;
  scope?: ControlScope;
  when?: (b: Block) => boolean;
  /**
   * Whether this control holds a value per device.
   *
   * Every `style` control does — spacing and type are what a phone changes.
   * Props are layout for some blocks and content for others, and a heading that
   * said something different on mobile would be a page nobody could proofread,
   * so props opt in one at a time.
   */
  responsive?: boolean;
};

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
  // Rows only. Both need the block itself — how many columns there are, and how
  // wide each one is — which a key and a value cannot express.
  | (Base & { kind: "columns"; max: number })
  | (Base & { kind: "widths" })
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

/**
 * Every ratio in that list crops. This one does not.
 *
 * A screenshot, a mockup, a chart — anything where the edges are the content —
 * has no correct entry in a list of fixed shapes, and picking the nearest one
 * quietly cuts something off. First in the list because it is the honest
 * default for an image nobody has thought about yet.
 *
 * Only offered for an image. A video needs a box before it loads, so an embed
 * with no ratio would collapse to nothing and then jump.
 */
const IMAGE_RATIOS: [string, string][] = [["auto", "Original — no crop"], ...RATIOS];

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
      { kind: "select", key: "ratio", label: "Ratio", options: IMAGE_RATIOS },
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
      {
        kind: "select",
        key: "action",
        label: "What it does",
        hint: "Buy uses this page's own checkout — a link on the sales page, one click after checkout. The label stays yours.",
        options: [["buy", "Buy"], ["link", "Go to a link"]],
      },
      { kind: "text", key: "link", label: "Links to", placeholder: "https://…", when: (b) => b.props.action !== "buy" },
      {
        kind: "select",
        key: "variant",
        label: "Style",
        hint: "An outline button is the one for a reader who is not ready yet — it must not compete with the buy.",
        options: [["solid", "Solid"], ["outline", "Outline"]],
      },
      { kind: "toggle", key: "fullWidth", label: "Full width" },
    ],
    style: [
      group("Layout"),
      // The same style.align the Advanced tab writes. Duplicated on purpose:
      // nobody looks under Advanced to centre a button, and a control nobody
      // finds is a control that does not exist.
      style({
        kind: "select",
        key: "align",
        label: "Align",
        options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]],
        when: (b) => !b.props.fullWidth,
      }),
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

  stats: {
    content: [
      {
        kind: "list",
        key: "items",
        label: "Figures",
        hint: "Only figures you can stand behind, and could evidence if asked.",
        item: [
          { key: "value", label: "Figure", kind: "text" },
          { key: "label", label: "Label", kind: "text" },
          { key: "detail", label: "Detail", kind: "textarea" },
        ],
        addLabel: "Add a figure",
      },
      { kind: "select", key: "layout", label: "Layout", options: [["strip", "Strip"], ["card", "Stacked card"]] },
    ],
    style: [...TYPOGRAPHY],
  },

  pricing: {
    content: [
      {
        kind: "list",
        key: "items",
        label: "Lines",
        hint: "For a comparison, what they would otherwise pay. For a value stack, what each part is worth.",
        item: [
          { key: "label", label: "Line", kind: "text" },
          { key: "amount", label: "Amount", kind: "text" },
          { key: "note", label: "Note", kind: "text" },
        ],
        addLabel: "Add a line",
      },
      { kind: "toggle", key: "highlightLast", label: "Highlight the last line", hint: "For a comparison, where yours goes last." },
      { kind: "text", key: "totalLabel", label: "Total row" },
      { kind: "text", key: "totalAmount", label: "Total amount" },
    ],
    style: [...TYPOGRAPHY],
  },

  faq: {
    content: [
      {
        kind: "list",
        key: "items",
        label: "Questions",
        hint: "The objections worth answering before the price lands.",
        item: [
          { key: "q", label: "Question", kind: "text" },
          { key: "a", label: "Answer", kind: "textarea" },
        ],
        addLabel: "Add a question",
      },
      {
        kind: "select",
        key: "layout",
        label: "Layout",
        hint: "Closed until asked, or all open in two columns.",
        options: [["accordion", "Open and close"], ["open", "All open, two columns"]],
      },
    ],
    style: [...TYPOGRAPHY],
  },

  cards: {
    content: [
      {
        kind: "list",
        key: "items",
        label: "Cards",
        item: [
          { key: "title", label: "Title", kind: "text" },
          { key: "body", label: "Body", kind: "textarea" },
          { key: "amount", label: "Amount", kind: "text" },
          { key: "icon", label: "Icon (SVG or image URL)", kind: "textarea" },
        ],
        addLabel: "Add a card",
      },
      { kind: "text", key: "title", label: "Card title", hint: "Only shown by the one-card skin — the small heading above the rows." },
      { kind: "textarea", key: "note", label: "Closing note", rows: 3, hint: "A panel under the rows, in the same card." },
      { kind: "number", key: "columns", label: "Across", min: 1, max: 4, step: 1 },
      {
        kind: "toggle",
        key: "numbered",
        label: "Numbered",
        hint: "Only when they are a real sequence — numbering a set of alternatives claims an order that is not there.",
      },
      {
        kind: "select",
        key: "skin",
        label: "Skin",
        hint: "Boxed for a set of things, plain for a sequence — a page where every section is boxed reads as one section repeated.",
        options: [["boxed", "Boxed"], ["tinted", "Tinted"], ["bordered", "Outlined"], ["plain", "Plain"], ["list", "One card, compact rows"]],
      },
      { kind: "select", key: "numberStyle", label: "Number", options: [["eyebrow", "Small, above"], ["inline", "Before the title"], ["circle", "Circle"]] },
    ],
    style: [...TYPOGRAPHY],
  },

  pricecard: {
    content: [
      { kind: "text", key: "eyebrow", label: "Eyebrow", hint: "e.g. “After trial”." },
      { kind: "text", key: "price", label: "Price", hint: "Leave empty to show the offer's real price. A typed price is a claim; the offer's price is a fact." },
      { kind: "text", key: "period", label: "Per", hint: "e.g. “/per month”." },
      { kind: "text", key: "altPrice", label: "Second price", hint: "Leave empty to show this placement's real second price, if it has one. A typed figure outlives the price it was copied from." },
      { kind: "text", key: "altPeriod", label: "Second per" },
      { kind: "text", key: "badge", label: "Badge", hint: "e.g. “40% off”. Only if it is true." },
      { kind: "text", key: "ctaLabel", label: "Button" },
      { kind: "textarea", key: "note", label: "Small print", rows: 2, hint: "{trial} becomes the offer's real trial length — “{trial} free, cancel any time”." },
      { kind: "text", key: "secureNote", label: "Security line" },
    ],
    style: [...TYPOGRAPHY],
  },

  row: {
    content: [
      // Structural, so not per device: the columns are where content lives, and
      // a phone that had fewer of them would have nowhere to put it. What
      // changes per device is how wide they are and what order they come in.
      { kind: "columns", key: "columnCount", label: "Columns", max: MAX_COLUMNS },
      { kind: "widths", key: "widths", label: "Column widths", responsive: true, hint: "% of the row" },
      {
        kind: "select",
        key: "stack",
        label: "Stack into one",
        options: [
          ["mobile", "On mobile"],
          ["tablet", "On tablet and mobile"],
          ["none", "Never — keep them side by side"],
        ],
        hint: "Setting widths for a device overrides this",
      },
      { kind: "toggle", key: "reverse", label: "Reverse the order", responsive: true },
      { kind: "number", key: "gap", label: "Gap", min: 0, max: 80, step: 4, unit: "px", responsive: true },
      {
        kind: "select",
        key: "verticalAlign",
        label: "Align",
        responsive: true,
        options: [["stretch", "Stretch"], ["flex-start", "Top"], ["center", "Middle"], ["flex-end", "Bottom"]],
      },
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
  style({ kind: "select", key: "width", label: "Width", options: [["fit", "Hug content"], ["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"], ["full", "Full"]] }),
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

  group("Custom CSS"),
  style({
    kind: "textarea",
    key: "customCss",
    label: "CSS",
    rows: 6,
    mono: true,
    hint: "`selector` = this block",
  }),
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
export function readControl(block: Block, c: Control, device: Device = "desktop"): unknown {
  if (isGroup(c)) return undefined;
  const root: Record<string, unknown> =
    scopeOf(c) === "style"
      ? (styleFor(block, deviceOf(c, device)) as unknown as Record<string, unknown>)
      : propsFor(block, deviceOf(c, device));
  return c.key.split(".").reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, root);
}

/**
 * The device a control actually writes at.
 *
 * A control that does not hold a value per device always writes desktop, so
 * switching to Mobile and typing into it edits the one value there is rather
 * than quietly forking the block's content by screen size.
 */
export function deviceOf(c: Control, device: Device): Device {
  if (isGroup(c) || device === "desktop") return "desktop";
  return scopeOf(c) === "style" || c.responsive === true ? device : "desktop";
}

/**
 * A block with one control's value changed.
 *
 * Immutable all the way down the dotted path, because the editor holds this in
 * React state — writing through the path in place would not re-render.
 */
export function writeControl(block: Block, c: Control, value: unknown, device: Device = "desktop"): Block {
  if (isGroup(c)) return block;
  // The column count is the one control that changes the block's shape rather
  // than one of its values, and it has to move content rather than drop it.
  if (c.kind === "columns") return setColumnCount(block, Number(value));

  const at = deviceOf(c, device);
  const path = c.key.split(".");
  const scope = scopeOf(c);

  // A dotted key still lands as ONE top-level override: `background.color` on
  // mobile stores the whole background, because a sparse patch has no room for
  // half of one and half a background is not a thing CSS can express either.
  const current =
    scope === "style"
      ? (styleFor(block, at) as unknown as Record<string, unknown>)
      : propsFor(block, at);
  const next = setIn(current, path, value);
  return setAt(block, at, scope, { [path[0]]: next[path[0]] });
}

/**
 * Give a control back to the wider device.
 *
 * Only meaningful on a control that holds a value per device, away from
 * desktop — everything else has nowhere to fall back to.
 */
export function clearControl(block: Block, c: Control, device: Device): Block {
  if (isGroup(c)) return block;
  const at = deviceOf(c, device);
  if (at === "desktop") return block;
  return clearAt(block, at, c.key.split(".")[0], scopeOf(c));
}

function setIn(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const base = child && typeof child === "object" && !Array.isArray(child) ? (child as Record<string, unknown>) : {};
  return { ...obj, [head]: setIn(base, rest, value) };
}

/** Every block type, in the order the palette offers them. */
/**
 * What you can add, and what it starts as.
 *
 * `props` presets a block rather than introducing a type. "Buy button" and
 * "Button" are the same block with a different starting `action`: a second
 * block type would mean a second renderer, a second control list and a second
 * thing every converter has to know about, to express one dropdown.
 */
export const PALETTE: { type: BlockType; label: string; props?: Record<string, unknown> }[] = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  // First, because on a sales page it is the one you almost always want. The
  // plain Button is for anchors and secondary links.
  { type: "button", label: "Buy button", props: { action: "buy", text: "Get instant access" } },
  { type: "button", label: "Button", props: { action: "link" } },
  { type: "iconlist", label: "List" },
  { type: "slides", label: "Slides" },
  { type: "row", label: "Columns" },
  { type: "cards", label: "Cards" },
  { type: "stats", label: "Figures" },
  { type: "pricing", label: "Price table" },
  { type: "pricecard", label: "Price card" },
  { type: "faq", label: "FAQ" },
  { type: "spacer", label: "Spacer" },
  { type: "divider", label: "Divider" },
  { type: "html", label: "HTML" },
];

export const BLOCK_LABEL: Record<BlockType, string> = Object.fromEntries(
  // The LAST palette entry for a type wins, so a button reads as "Button" in
  // the inspector rather than "Buy button" whichever way it was added.
  BLOCK_TYPES.map((t) => [t, [...PALETTE].reverse().find((p) => p.type === t)?.label ?? t]),
) as Record<BlockType, string>;
