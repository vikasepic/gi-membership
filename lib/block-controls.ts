import {
  BLOCK_TYPES,
  MAX_COLUMNS,
  clearAt,
  propsFor,
  setAt,
  setColumnCount,
  setPropsAt,
  styleFor,
  type Block,
  type BlockType,
  type ColumnLayout,
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
  /**
   * `invert` shows the opposite of what is stored.
   *
   * `hideMobile` is true when a block is hidden, so a switch on it is on when
   * the block is gone. A switch whose "on" means "off" cannot be coloured
   * honestly and cannot be read at a glance — so the label says "Show on
   * mobile" and the value is flipped on the way in and out.
   */
  | (Base & { kind: "toggle"; invert?: boolean })
  /** The nine named spots, or a percentage pair. See PositionPicker. */
  | (Base & { kind: "position" })
  | (Base & { kind: "number"; min: number; max: number; step: number; unit?: string })
  | (Base & { kind: "color" })
  | (Base & { kind: "dim" })
  | (Base & { kind: "list"; item: { key: string; label: string; kind: "text" | "textarea" | "image" }[]; addLabel: string })
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

// Which half of the container schema a row is showing. Read off desktop props
// deliberately: Container is not per-device, so there is one answer.
const isGrid = (b: Block) => b.props.containerType === "grid";
const notGrid = (b: Block) => !isGrid(b);

// --- shared typography, offered by anything that renders words ---------------
const TYPOGRAPHY: Control[] = [
  group("Typography"),
  // Options are filled in by controlsFor from what is actually installed —
  // offering a family the site does not have produces text in the fallback and
  // no explanation.
  style({
    kind: "select",
    key: "fontFamily",
    label: "Font",
    options: [["", "Page default"]],
    hint: "Add fonts in Site settings → Typography.",
  }),
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
      // The same style.blockAlign the Advanced tab writes. Duplicated on
      // purpose: nobody looks under Advanced to centre a button, and a control
      // nobody finds is a control that does not exist.
      style({
        kind: "select",
        key: "blockAlign",
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
          { key: "image", label: "Image", kind: "image" },
        ],
        addLabel: "Add a card",
      },
      // Both fields stay on every card. A switch that emptied the one it turns
      // off would make trying the other look like a way to lose what you typed.
      {
        kind: "select",
        key: "media",
        label: "Media",
        hint: "Which of the two fields on each card is shown in the tile.",
        options: [["icon", "Icon"], ["image", "Image"], ["none", "None"]],
      },
      { kind: "text", key: "title", label: "Card title", hint: "Only shown by the one-card skin — the small heading above the rows." },
      { kind: "textarea", key: "note", label: "Closing note", rows: 3, hint: "A panel under the rows, in the same card." },
      // Per device: three across is a grid on a laptop and three slivers on a
      // phone, and the container query underneath only knows how wide the band
      // is, not which screen is reading it.
      { kind: "number", key: "columns", label: "Across", min: 1, max: 4, step: 1, responsive: true },
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
      {
        kind: "toggle",
        key: "divider",
        label: "Rule between cards",
        hint: "A hairline instead of a box, for a list read top to bottom. With more than one across it draws across the rows too.",
      },

      group("Spacing"),
      // Both empty by default, and empty is not zero. Each skin pads its cards
      // differently on purpose and Plain pads not at all, so there is no one
      // figure that could stand here without repainting every card ever saved.
      { kind: "number", key: "cardPadding", label: "Card padding", min: 0, max: 96, step: 2, unit: "px", hint: "Unset follows the skin." },
      { kind: "number", key: "cardGap", label: "Gap between cards", min: 0, max: 96, step: 2, unit: "px", hint: "Unset follows the skin." },
      { kind: "number", key: "cardRadius", label: "Card corner", min: 0, max: 64, step: 1, unit: "px", hint: "Unset follows the skin." },

      group("Icon tile", (b) => b.props.media !== "none"),
      { kind: "select", key: "iconShape", label: "Shape", options: [["square", "Square"], ["rounded", "Rounded"], ["circle", "Circle"]], when: (b) => b.props.media !== "none" },
      { kind: "select", key: "iconPlace", label: "Position", options: [["above", "Above"], ["beside", "Beside"]], when: (b) => b.props.media !== "none" },
      { kind: "number", key: "iconBox", label: "Tile size", min: 16, max: 160, step: 2, unit: "px", when: (b) => b.props.media !== "none" },
      { kind: "number", key: "iconSize", label: "Icon size", min: 8, max: 160, step: 2, unit: "px", when: (b) => b.props.media !== "none" },
      { kind: "color", key: "iconBg", label: "Tile colour", hint: "Unset follows the section's accent.", when: (b) => b.props.media !== "none" },
      // Only reaches a pasted SVG that draws itself in currentColor, and an
      // image never. Said here rather than discovered by trying it on a PNG.
      { kind: "color", key: "iconColor", label: "Icon colour", hint: "Only an SVG using currentColor takes this.", when: (b) => b.props.media === "icon" },
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
      // Hidden on a grid: the track list is the widths there, and two controls
      // claiming to set one thing is a container drawn one way and edited
      // another — the same reason `structure` was folded into `widths`.
      { kind: "widths", key: "widths", label: "Column widths", when: notGrid, responsive: true, hint: "% of the row" },
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

      group("Layout"),
      // Structural for the same reason the column count is: the two halves of
      // this schema below are different settings, and a container that was a
      // grid on a laptop and a flex line on a phone would show the panel one
      // set and render the other. What varies per device is the tracks.
      {
        kind: "select",
        key: "containerType",
        label: "Container",
        options: [["flex", "Flex"], ["grid", "Grid"]],
        hint: "Grid places the same columns on a track list instead of a flowing line.",
      },
      // Reversed is still the painting order and not the markup order, so the
      // words on the page stay in the order they are read out and the drop
      // targets stay where they were dropped.
      {
        kind: "select",
        key: "direction",
        label: "Direction",
        when: notGrid,
        responsive: true,
        options: [
          ["row", "Row"],
          ["column", "Column"],
          ["row-reverse", "Row reversed"],
          ["column-reverse", "Column reversed"],
        ],
        hint: "Reversed changes the order they are painted in, not the order they are written in.",
      },
      {
        kind: "select",
        key: "justify",
        label: "Justify content",
        responsive: true,
        options: [
          ["flex-start", "Start"],
          ["center", "Centre"],
          ["flex-end", "End"],
          ["space-between", "Space between"],
          ["space-around", "Space around"],
          ["space-evenly", "Space evenly"],
        ],
        hint: "Along the direction above. It only has room to do anything once the columns leave some.",
      },
      // The same property Align used to be, renamed rather than joined by a
      // second control: two keys writing align-items is a row drawn one way and
      // edited as another. Start/End rather than Top/Bottom because in a column
      // direction align-items runs across the page, not down it.
      {
        kind: "select",
        key: "verticalAlign",
        label: "Align items",
        responsive: true,
        options: [["stretch", "Stretch"], ["flex-start", "Start"], ["center", "Centre"], ["flex-end", "End"]],
      },
      { kind: "number", key: "gap", label: "Gap", min: 0, max: 80, step: 4, unit: "px", responsive: true },
      {
        kind: "select",
        key: "wrap",
        label: "Wrap",
        when: notGrid,
        responsive: true,
        options: [["wrap", "Wrap"], ["nowrap", "No wrap"]],
        hint: "No wrap keeps every column on one line, however narrow that makes them.",
      },
      {
        kind: "select",
        key: "alignContent",
        label: "Align content",
        responsive: true,
        // Hidden with wrapping off because that is the only time it does
        // anything: align-content places the LINES, and there is one line.
        when: (b) => isGrid(b) || b.props.wrap !== "nowrap",
        options: [
          ["", "Default"],
          ["flex-start", "Start"],
          ["center", "Centre"],
          ["flex-end", "End"],
          ["space-between", "Space between"],
          ["space-around", "Space around"],
          ["space-evenly", "Space evenly"],
        ],
        hint: "Where the wrapped lines sit, once there is more than one.",
      },

      // Only shown on a grid, because none of it has any effect on a flex line
      // — a control that silently does nothing is worse than no control.
      group("Grid", isGrid),
      {
        kind: "text",
        key: "gridColumns",
        label: "Columns",
        when: isGrid,
        responsive: true,
        placeholder: "3",
        hint: "A count for equal columns, or a track list: 200px 1fr 400px. Anything else falls back to equal ones.",
      },
      {
        kind: "text",
        key: "gridRows",
        label: "Rows",
        when: isGrid,
        responsive: true,
        placeholder: "auto",
        hint: "Same again, down the page. Empty lets the rows size themselves.",
      },
      { kind: "number", key: "columnGap", label: "Column gap", min: 0, max: 80, step: 4, unit: "px", when: isGrid, responsive: true, hint: "Unset uses the Gap above." },
      { kind: "number", key: "rowGap", label: "Row gap", min: 0, max: 80, step: 4, unit: "px", when: isGrid, responsive: true, hint: "Unset uses the Gap above." },
      {
        kind: "select",
        key: "autoFlow",
        label: "Auto flow",
        when: isGrid,
        responsive: true,
        options: [["row", "Row"], ["column", "Column"]],
        hint: "Which way anything past the named tracks is filled in.",
      },
      // The other axis of Align items above, which is align-items on a grid as
      // well — so it is not repeated here, or one property would have two
      // controls and the container would be drawn one way and edited another.
      {
        kind: "select",
        key: "justifyItems",
        label: "Justify items",
        when: isGrid,
        responsive: true,
        options: [["", "Default"], ["start", "Start"], ["center", "Centre"], ["end", "End"], ["stretch", "Stretch"]],
        hint: "Where the contents sit inside each cell, across the page.",
      },

      group("Size"),
      {
        kind: "number",
        key: "minHeight",
        label: "Min height",
        min: 0,
        max: 1200,
        step: 10,
        responsive: true,
        hint: "Unset is as tall as what is in it.",
      },
      {
        kind: "select",
        key: "minHeightUnit",
        label: "Unit",
        responsive: true,
        options: [["px", "px"], ["vh", "vh"]],
        hint: "vh is per-cent of the screen's height, so a full-screen band is 100.",
      },
      {
        kind: "select",
        key: "contentWidth",
        label: "Content width",
        responsive: true,
        options: [["full", "Full"], ["boxed", "Boxed"]],
        hint: "Boxed holds the columns to the page's measure and centres them.",
      },
      {
        kind: "select",
        key: "overflow",
        label: "Overflow",
        responsive: true,
        options: [["visible", "Default"], ["hidden", "Hidden"], ["auto", "Auto"]],
        hint: "Hidden clips anything sticking out — needed before a corner can round a column.",
      },
    ],
    style: [],
  },
};

// --- Advanced, identical for every block ------------------------------------

const bgIs = (t: string) => (b: Block) => b.style.background.type === t;
const colIs = <K extends keyof ColumnLayout>(key: K, v: ColumnLayout[K]) => (b: Block) =>
  b.style.col?.[key] === v;

/**
 * What a column can be given.
 *
 * The same background machinery every block already has, plus the two things a
 * column is for: room around its contents, and a corner. Deliberately not the
 * whole Advanced tab — a column has no typography of its own, and offering it
 * would suggest otherwise.
 */
export const COLUMN_CONTROLS: Control[] = [
  group("Background"),
  style({
    kind: "select",
    key: "background.type",
    label: "Type",
    hint: "Classic is a colour, an image, or both. Gradient is two colours.",
    options: [["none", "None"], ["classic", "Classic"], ["gradient", "Gradient"]],
  }),
  style({ kind: "color", key: "background.color", label: "Colour", when: bgIs("classic") }),
  style({ kind: "image", key: "background.image", label: "Image", when: bgIs("classic") }),
  style({ kind: "select", key: "background.size", label: "Size", options: [["cover", "Cover"], ["contain", "Contain"], ["auto", "Auto"]], when: bgIs("classic") }),
  style({ kind: "position", key: "background.position", label: "Position", when: bgIs("classic") }),
  style({ kind: "select", key: "background.repeat", label: "Repeat", options: [["no-repeat", "No"], ["repeat", "Tile"]], when: bgIs("classic") }),
  style({ kind: "number", key: "background.overlay", label: "Darken", min: 0, max: 90, step: 5, unit: "%", when: bgIs("classic") }),
  style({ kind: "color", key: "background.from", label: "Colour one", when: bgIs("gradient") }),
  style({ kind: "color", key: "background.to", label: "Colour two", when: bgIs("gradient") }),
  style({ kind: "number", key: "background.angle", label: "Angle", min: 0, max: 360, step: 15, unit: "°", when: bgIs("gradient") }),
  // An image behind words needs the words to stay readable, and a wash is how
  // that is done without editing the picture.
  style({ kind: "number", key: "background.overlay", label: "Darken", min: 0, max: 90, step: 5, unit: "%", when: bgIs("classic") }),

  group("Spacing"),
  style({ kind: "dim", key: "padding", label: "Padding" }),
  style({ kind: "number", key: "radius", label: "Corner", min: 0, max: 60, step: 2, unit: "px" }),

  // How the column sits in its row, as opposed to what is drawn on it. Every
  // default here emits no CSS, so a column that already had a background keeps
  // rendering exactly what it rendered before these existed.
  group("Layout"),
  style({
    kind: "select",
    key: "col.width",
    label: "Width",
    options: [["full", "Full"], ["custom", "Custom"]],
    hint: "Full keeps the share of the row set beside the other columns.",
  }),
  style({ kind: "number", key: "col.widthValue", label: "Size", min: 1, max: 2000, step: 1, when: colIs("width", "custom") }),
  style({
    kind: "select",
    key: "col.widthUnit",
    label: "Unit",
    options: [["px", "px"], ["%", "%"], ["vw", "vw"]],
    when: colIs("width", "custom"),
    hint: "% is of the row, so it holds up on a phone. vw is of the window.",
  }),
  style({
    kind: "select",
    key: "col.alignSelf",
    label: "Align self",
    options: [
      ["", "Inherit"],
      ["flex-start", "Start"],
      ["center", "Center"],
      ["flex-end", "End"],
      ["stretch", "Stretch"],
    ],
    hint: "Inherit follows the row's own vertical alignment.",
  }),
  style({
    kind: "select",
    key: "col.order",
    label: "Order",
    options: [["", "Default"], ["start", "First"], ["end", "Last"], ["custom", "Custom"]],
    hint: "Moves the column on screen only — it stays where it is for a reader.",
  }),
  style({ kind: "number", key: "col.orderValue", label: "Position", min: -99, max: 99, step: 1, when: colIs("order", "custom") }),
  style({
    kind: "select",
    key: "col.size",
    label: "Size",
    options: [["none", "None"], ["grow", "Grow"], ["shrink", "Shrink"], ["custom", "Custom"]],
    hint: "Grow takes the space left over. Shrink gives space up first.",
  }),
  style({ kind: "number", key: "col.grow", label: "Grow", min: 0, max: 10, step: 1, when: colIs("size", "custom") }),
  style({ kind: "number", key: "col.shrink", label: "Shrink", min: 0, max: 10, step: 1, when: colIs("size", "custom") }),
];

export const ADVANCED_CONTROLS: Control[] = [
  group("Layout"),
  style({ kind: "dim", key: "margin", label: "Margin" }),
  style({ kind: "dim", key: "padding", label: "Padding" }),
  // Two choices, because there are two things anyone wants: the whole column,
  // or a number. "Hug content" is a third answer to a question nobody asked of
  // a paragraph. It is added back by `forBlock` for the few blocks already
  // saved with it, so a select never shows a value it cannot express.
  style({
    kind: "select",
    key: "width",
    label: "Width",
    options: [["auto", "Fill"], ["custom", "Custom"]],
    hint: "Fill takes the whole column. Custom sets a maximum.",
  }),
  style({
    kind: "number",
    key: "maxWidthValue",
    label: "Max width",
    min: 1,
    max: 2000,
    step: 1,
    when: (b) => b.style.width === "custom",
  }),
  style({
    kind: "select",
    key: "maxWidthUnit",
    label: "Unit",
    options: [["%", "%"], ["px", "px"]],
    when: (b) => b.style.width === "custom",
    hint: "% is of the column it sits in, so it holds up on a phone.",
  }),
  style({
    kind: "select",
    key: "blockAlign",
    label: "Block position",
    options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]],
    hint: "Where the box sits. Centre is margin auto — it needs a max width to move.",
  }),
  style({
    kind: "select",
    key: "textAlign",
    label: "Text",
    options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]],
    hint: "Where the words sit inside the box.",
  }),

  group("Background"),
  style({
    kind: "select",
    key: "background.type",
    label: "Type",
    // Every colour and image field below is hidden until this says Classic, so
    // a block showing "None" looks like a block with no image option at all.
    hint: "Classic is a colour, an image, or both. Gradient is two colours.",
    options: [["none", "None"], ["classic", "Classic"], ["gradient", "Gradient"]],
  }),
  style({ kind: "color", key: "background.color", label: "Colour", when: bgIs("classic") }),
  style({ kind: "image", key: "background.image", label: "Image", when: bgIs("classic") }),
  style({ kind: "select", key: "background.size", label: "Size", options: [["cover", "Cover"], ["contain", "Contain"], ["auto", "Auto"]], when: bgIs("classic") }),
  style({ kind: "position", key: "background.position", label: "Position", when: bgIs("classic") }),
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
  style({ kind: "toggle", key: "hideDesktop", label: "Show on desktop", invert: true }),
  style({ kind: "toggle", key: "hideTablet", label: "Show on tablet", invert: true }),
  style({ kind: "toggle", key: "hideMobile", label: "Show on mobile", invert: true }),

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
export function controlsFor(
  block: Block,
  /** Families installed on this site, for the Font select. */
  fonts: readonly string[] = [],
): { content: Control[]; style: Control[]; advanced: Control[] } {
  const defs = BLOCK_CONTROLS[block.type];
  const keep = (list: Control[]) => list.filter((c) => !c.when || c.when(block));
  const shape = (c: Control) => withFonts(forBlock(c, block), fonts);
  return {
    content: keep(defs.content).map(shape),
    style: keep(defs.style).map(shape),
    advanced: keep(ADVANCED_CONTROLS).map(shape),
  };
}

/** The Font select, filled in with what the site actually has. */
function withFonts(c: Control, fonts: readonly string[]): Control {
  if (isGroup(c) || c.kind !== "select" || c.key !== "fontFamily") return c;
  return { ...c, options: [["", "Page default"], ...fonts.map((f) => [f, f] as [string, string])] };
}

/**
 * The two places a control's shape depends on the block in front of it.
 *
 * Done when the control is handed out rather than by defining a second control:
 * two entries sharing one key is a collision, and the one that renders last
 * silently wins.
 *
 *  - A max width in per-cent cannot sensibly run to 2000, or the slider spends
 *    nineteen twentieths of its travel on values that overflow the column.
 *  - "Hug content" is offered only to a block already set to it.
 */
function forBlock(c: Control, block: Block): Control {
  if (isGroup(c)) return c;
  if (c.kind === "number" && c.key === "maxWidthValue") {
    return block.style.maxWidthUnit === "%" ? { ...c, max: 100 } : { ...c, max: 1600 };
  }
  if (c.kind === "select" && c.key === "width" && block.style.width === "fit") {
    return { ...c, options: [...c.options, ["fit", "Hug content"]] };
  }
  return c;
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

/**
 * Finished looks for a Cards block, one press each.
 *
 * PRESENTATION ONLY, and that is the contract rather than a description: a
 * template names no content key, so applying one to a filled block cannot lose
 * a title, a body, an icon or a picture. A chooser is a thing people press to
 * see what happens, so pressing it has to be safe.
 *
 * Two things a template deliberately does NOT set:
 * - a colour. Every colour here defaults to null so the band paints it, and a
 *   template that froze white or a tint would be the one card set on the page
 *   that ignores its section.
 * - `media` and `numbered`. Which of the two artwork fields is shown, and
 *   whether the cards are a numbered sequence, are things somebody decided
 *   about this content. A layout is not entitled to overrule them.
 */
export type CardTemplate = {
  id: string;
  label: string;
  hint: string;
  /** Desktop props. Empty means the template changes nothing. */
  props: Record<string, unknown>;
  /** Per device — Across is the only value that differs by width. */
  at?: Partial<Record<Exclude<Device, "desktop">, Record<string, unknown>>>;
};

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "tiles",
    label: "Tiles",
    hint: "Boxed cards in a grid, icon above the copy. Four across, two on a tablet, one on a phone.",
    props: {
      skin: "boxed",
      columns: 4,
      cardPadding: 20,
      cardGap: 16,
      cardRadius: 12,
      divider: false,
      iconShape: "rounded",
      iconPlace: "above",
      // Back to null rather than to a figure: null is what "the size it has
      // always been" means here, and a template's job is to undo the last one.
      iconBox: null,
      iconSize: null,
      iconBg: null,
      iconColor: null,
      numberStyle: "eyebrow",
    },
    at: { tablet: { columns: 2 }, mobile: { columns: 1 } },
  },
  {
    id: "rows",
    label: "Rows",
    hint: "One column, no box, a round icon beside the copy and a hairline between.",
    props: {
      skin: "plain",
      columns: 1,
      // No box means no padding of its own; the air comes from the gap, which
      // the divider then mirrors underneath the rule.
      cardPadding: null,
      cardGap: 28,
      cardRadius: null,
      divider: true,
      iconShape: "circle",
      iconPlace: "beside",
      iconBox: null,
      iconSize: null,
      iconBg: null,
      iconColor: null,
      numberStyle: "inline",
    },
  },
  {
    // The way out. A row of two previews with no third choice reads as "pick
    // one", and there has to be a way to look at both and keep what is there.
    id: "keep",
    label: "Keep what I have",
    hint: "Changes nothing.",
    props: {},
  },
];

/**
 * Apply a template, or return the block untouched.
 *
 * Across is cleared at tablet and mobile unless the template sets it there.
 * Otherwise "two across on a tablet" survives from the template before it — an
 * override nothing on screen mentions, on a value the panel shows as one.
 */
export function applyCardTemplate(block: Block, id: string): Block {
  const t = CARD_TEMPLATES.find((x) => x.id === id);
  if (!t || Object.keys(t.props).length === 0) return block;
  let out: Block = { ...block, props: { ...block.props, ...t.props } };
  for (const device of ["tablet", "mobile"] as const) {
    const at = t.at?.[device];
    out = at ? setPropsAt(out, device, at) : clearAt(out, device, "columns", "props");
  }
  return out;
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
  // "Container", not "Columns": the block is a flex container with a direction,
  // a justify and a min height of its own, and columns are only what is in it.
  // The stored type stays "row" — renaming that would orphan every block saved.
  { type: "row", label: "Container" },
  { type: "cards", label: "Cards" },
  { type: "stats", label: "Figures" },
  { type: "pricing", label: "Price table" },
  { type: "pricecard", label: "Price card" },
  { type: "faq", label: "FAQ" },
  { type: "spacer", label: "Spacer" },
  { type: "divider", label: "Divider" },
  { type: "html", label: "HTML" },
];

/**
 * Which selects are better as a row of buttons than as a dropdown.
 *
 * A dropdown hides its options until you open it, so choosing between three
 * alignments means click, read three words, click again. Four or fewer options
 * fit as buttons, and two of them — alignment and case — are faster still as
 * pictures, because you stop reading once you have learnt the shapes.
 */
/** Icons for the two where a picture beats a word. Keyed on the control's key. */
const TEXT_ALIGN_ICONS = {
  left: "M3 5h18v2H3V5Zm0 4h12v2H3V9Zm0 4h18v2H3v-2Zm0 4h12v2H3v-2Z",
  center: "M3 5h18v2H3V5Zm3 4h12v2H6V9Zm-3 4h18v2H3v-2Zm3 4h12v2H6v-2Z",
  right: "M3 5h18v2H3V5Zm6 4h12v2H9V9Zm-6 4h18v2H3v-2Zm6 4h12v2H9v-2Z",
};

export const SEGMENT_ICONS: Record<string, Record<string, string>> = {
  align: TEXT_ALIGN_ICONS,
  textAlign: TEXT_ALIGN_ICONS,
  // A box against its container, not lines of text — otherwise the two
  // controls sit next to each other wearing the same picture and the whole
  // point of separating them is lost at a glance.
  blockAlign: {
    left: "M3 4h2v16H3V4Zm4 4h9v8H7V8Z",
    center: "M11 4h2v16h-2V4ZM6 8h12v8H6V8Z",
    right: "M19 4h2v16h-2V4ZM8 8h9v8H8V8Z",
  },
};

export const SEGMENT_MAX = 4;

/**
 * A row of buttons only where the words actually fit in one.
 *
 * Counting options was not enough. "On tablet and mobile" and "Never — keep
 * them side by side" are three options and became a four-line block of wrapped
 * text taller than the rest of the panel put together; "Stretch / Top / Middle
 * / Bottom" is four short ones and still ran out of room, so Bottom rendered as
 * "Bottc". A dropdown holds any length, which is the whole reason to keep it
 * for the long ones.
 *
 * Icons are exempt: a glyph is a glyph however long its name is.
 */
const SEGMENT_LABEL_MAX = 8;
const SEGMENT_TOTAL_MAX = 20;

export function asSegment(c: Control): boolean {
  if (isGroup(c) || c.kind !== "select") return false;
  if (SEGMENT_ICONS[c.key.split(".").pop() ?? ""]) return true;
  if (c.options.length > SEGMENT_MAX) return false;
  const labels = c.options.map(([, l]) => l);
  return (
    labels.every((l) => l.length <= SEGMENT_LABEL_MAX) &&
    labels.reduce((n, l) => n + l.length, 0) <= SEGMENT_TOTAL_MAX
  );
}


/**
 * The controls of one tab, split into the sections its group markers describe.
 *
 * The markers were already there and rendered as a bare heading in a flat
 * scroll. Partitioning on them is what lets a section collapse, which is the
 * difference between a block with twenty settings being a panel and being a
 * wall. Anything before the first marker is its own opening section.
 */
export function sections(controls: Control[]): { title: string | null; controls: Control[] }[] {
  const out: { title: string | null; controls: Control[] }[] = [];
  for (const c of controls) {
    if (isGroup(c)) out.push({ title: c.label, controls: [] });
    else {
      if (out.length === 0) out.push({ title: null, controls: [] });
      out[out.length - 1].controls.push(c);
    }
  }
  // A marker with nothing under it would render as an empty box someone opens
  // once and never again.
  return out.filter((s) => s.controls.length > 0);
}

/**
 * The palette, grouped.
 *
 * Seventeen names in one flat list is a list you read every time. Three groups
 * and a search box means you either know where it lives or you type its name,
 * and neither involves reading the other fourteen.
 */
export const PALETTE_GROUPS: { title: string; types: string[] }[] = [
  { title: "Basic", types: ["Heading", "Text", "Image", "Video", "Buy button", "Button", "List", "Slides"] },
  { title: "Layout", types: ["Container", "Divider", "Spacer"] },
  { title: "Sales", types: ["Cards", "Figures", "Price card", "Price table", "FAQ", "HTML"] },
];

/** One glyph per block type, so you learn the shapes and stop reading. */
export const BLOCK_ICON: Record<BlockType, string> = {
  heading: "M4 4h2v7h8V4h2v16h-2v-7H6v7H4V4Z",
  text: "M3 5h18v2H3V5Zm0 5h18v2H3v-2Zm0 5h12v2H3v-2Z",
  image: "M4 5h16v14H4V5Zm2 2v7l3.5-3.5L13 14l3-3 2 2V7H6Z",
  video: "M4 5h16v14H4V5Zm6 3.5v7l6-3.5-6-3.5Z",
  button: "M3 8h18v8H3V8Zm2 2v4h14v-4H5Z",
  iconlist: "M4 6h2v2H4V6Zm4 0h12v2H8V6ZM4 11h2v2H4v-2Zm4 0h12v2H8v-2ZM4 16h2v2H4v-2Zm4 0h12v2H8v-2Z",
  slides: "M3 6h18v12H3V6Zm2 2v8h5V8H5Zm7 0v8h7V8h-7Z",
  row: "M3 5h8v14H3V5Zm10 0h8v14h-8V5Z",
  divider: "M3 11h18v2H3v-2Z",
  spacer: "M12 3 8 8h3v8H8l4 5 4-5h-3V8h3l-4-5Z",
  cards: "M3 5h8v6H3V5Zm10 0h8v6h-8V5ZM3 13h8v6H3v-6Zm10 0h8v6h-8v-6Z",
  stats: "M4 18h3V9H4v9Zm6.5 0h3V4h-3v14ZM17 18h3v-6h-3v6Z",
  pricing: "M3 5h18v2H3V5Zm0 4h18v10H3V9Zm2 2v6h14v-6H5Z",
  pricecard: "M4 5h16v3H4V5Zm0 5h16v9H4v-9Zm2 2v5h12v-5H6Z",
  faq: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm1.7-6.2-.9.9c-.6.6-.8 1-.8 2.3h-2v-.5c0-1 .4-1.8 1-2.5l1.2-1.3c.4-.3.6-.8.6-1.3a2 2 0 1 0-4 0H8a4 4 0 1 1 8 0c0 .8-.3 1.6-.9 2.2Z",
  html: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z",
};

/** The palette in groups, matched by label so the order of PALETTE still rules. */
export function groupedPalette(query = ""): { title: string; items: typeof PALETTE }[] {
  const q = query.trim().toLowerCase();
  const match = (p: (typeof PALETTE)[number]) => !q || p.label.toLowerCase().includes(q);
  const placed = new Set<string>();
  const out = PALETTE_GROUPS.map((g) => {
    const items = g.types
      .map((label) => PALETTE.find((p) => p.label === label))
      .filter((p): p is (typeof PALETTE)[number] => Boolean(p));
    items.forEach((p) => placed.add(p.label));
    return { title: g.title, items: items.filter(match) };
  });
  // Anything added to PALETTE and not to a group still has to appear, or a new
  // block type would be invisible until someone remembered this file.
  const rest = PALETTE.filter((p) => !placed.has(p.label)).filter(match);
  if (rest.length > 0) out.push({ title: "More", items: rest });
  return out.filter((g) => g.items.length > 0);
}

export const BLOCK_LABEL: Record<BlockType, string> = Object.fromEntries(
  // The LAST palette entry for a type wins, so a button reads as "Button" in
  // the inspector rather than "Buy button" whichever way it was added.
  BLOCK_TYPES.map((t) => [t, [...PALETTE].reverse().find((p) => p.type === t)?.label ?? t]),
) as Record<BlockType, string>;
