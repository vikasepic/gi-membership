import type { CSSProperties } from "react";
import { readableInk, tint } from "@/lib/color";
import { familyToken } from "@/lib/fonts-catalogue";
import { imageSrc, type BandTheme } from "@/lib/page-sections";
import {
  DEVICE_MAX,
  baseStyle,
  columnAsBlock,
  columnWidths,
  hasOverride,
  oneOf,
  ownTypography,
  propsFor,
  styleFor,
  type Background,
  type Block,
  type BlockStyle,
  type ColumnLayout,
  type Device,
  type Dim,
} from "@/lib/blocks";

// Turning a block's stored style into CSS.
//
// The rule that matters here: a null in the style means "inherit from the
// band", and it is resolved at RENDER time, not when the block was created.
// The prototype froze colours at creation, so switching a section to the Navy
// preset left every heading as dark ink on a dark ground. Anything that could
// go stale when the band changes has to be derived, not stored.

export function dimCss(d: Dim): string {
  return `${d.t}${d.u} ${d.r}${d.u} ${d.b}${d.u} ${d.l}${d.u}`;
}

/**
 * The border, written onto whichever edges it was asked for.
 *
 * "all" emits the `border` shorthand it always emitted, character for
 * character, so every block and column already saved renders the identical
 * style attribute — which the byte-for-byte goldens check.
 */
function borderCss(
  s: { borderWidth: number; borderColor: string | null; borderSides: BlockStyle["borderSides"] },
  theme: BandTheme,
): CSSProperties {
  if (s.borderWidth <= 0) return {};
  const line = `${s.borderWidth}px solid ${s.borderColor ?? theme.rule}`;
  switch (s.borderSides) {
    case "top":
      return { borderTop: line };
    case "right":
      return { borderRight: line };
    case "bottom":
      return { borderBottom: line };
    case "left":
      return { borderLeft: line };
    case "x":
      return { borderLeft: line, borderRight: line };
    case "y":
      return { borderTop: line, borderBottom: line };
    default:
      return { border: line };
  }
}

/**
 * The cast shadow, or null where there is none to cast.
 *
 * All three numbers zero is nothing — an offset of nothing blurred by nothing
 * draws no pixels whatever the colour — so it returns null rather than a
 * `box-shadow` that costs a repaint and shows nothing.
 *
 * A shadow with no colour of its own follows the band, the same way ink and
 * outlines do. It has to be derived at render rather than frozen when the block
 * was made: a card that cast a dark shadow on paper would otherwise keep
 * casting it after the section was switched to Navy, where it is invisible.
 */
function shadowCss(
  s: { shadowX: number; shadowY: number; shadowBlur: number; shadowColor: string | null },
  theme: BandTheme,
): string | null {
  if (!s.shadowX && !s.shadowY && !s.shadowBlur) return null;
  return `${s.shadowX}px ${s.shadowY}px ${s.shadowBlur}px ${s.shadowColor ?? theme.rule}`;
}

export function backgroundCss(bg: Background, theme: BandTheme): CSSProperties {
  if (bg.type === "classic") {
    const css: CSSProperties = {};
    // null means the band's own panel, the same way a null text colour means
    // the band's ink — so a boxed panel follows the section it sits in.
    css.backgroundColor = bg.color ?? theme.panel;
    if (bg.image) {
      // Quotes and backslashes are stripped rather than escaped: this value
      // lands inside url('…'), and the only safe answer to a quote here is
      // that there isn't one.
      // Through imageSrc, like every other image on a page. A file chosen from
      // the library is stored as a path — "library/1786…webp" — and putting
      // that straight into url() makes it relative to whatever page is being
      // viewed, so it 404s and the background silently does not appear.
      const src = imageSrc(bg.image) ?? "";
      const url = `url('${src.replace(/['"\\]/g, "")}')`;
      const wash = Math.max(0, Math.min(90, bg.overlay ?? 0));
      // The wash rides in FRONT of the image as a flat gradient, so one
      // property carries both and nothing needs an extra element to sit in.
      css.backgroundImage = wash
        ? `linear-gradient(rgba(0,0,0,${wash / 100}), rgba(0,0,0,${wash / 100})), ${url}`
        : url;
      css.backgroundSize = wash ? `auto, ${bg.size}` : bg.size;
      css.backgroundPosition = wash ? `center, ${bg.position}` : bg.position;
      css.backgroundRepeat = wash ? `no-repeat, ${bg.repeat}` : bg.repeat;
    }
    return css;
  }
  if (bg.type === "gradient") {
    const from = bg.from ?? theme.accent;
    const to = bg.to ?? theme.panel;
    return {
      backgroundImage:
        bg.shape === "radial"
          ? `radial-gradient(circle at center, ${from} ${bg.fromAt}%, ${to} ${bg.toAt}%)`
          : `linear-gradient(${bg.angle}deg, ${from} ${bg.fromAt}%, ${to} ${bg.toAt}%)`,
    };
  }
  return {};
}

/**
 * The colours a block actually paints with.
 *
 * Keyed the way the block reads them rather than by control name, so a renderer
 * cannot accidentally use a stored value where it meant a resolved one.
 */
export type BlockColors = {
  /** Text. */
  fg: string;
  /** The block's own fill, where it has one — a button, a slide card. */
  fill: string;
  /** Readable against `fill`. */
  onFill: string;
  /** Icons, bullets, accents inside the block. */
  accent: string;
  /** Hairlines. */
  rule: string;
};

/**
 * A colour from `props`, or null.
 *
 * Style values are validated by normalizeBlocks; props are not, because they
 * differ per block type. Anything from props that reaches a style attribute
 * therefore gets checked here instead.
 */
export const hexOrNull = (v: unknown): string | null =>
  typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : null;

/**
 * Whether the block is already standing on a picture of its own.
 *
 * The wrapper paints the background; several blocks then paint a panel inside
 * it. With no image that panel IS the block's surface and is right. With one,
 * it is an opaque sheet laid over the picture someone just chose — the setting
 * appears to do nothing, and the default colour appears not to have gone.
 */
function ownBackdrop(s: BlockStyle): boolean {
  return s.background.type === "classic" && Boolean(s.background.image);
}

export function blockColors(block: Block, theme: BandTheme, at: BlockStyle = block.style): BlockColors {
  const s = at;
  // A panel of the theme's default over the author's own picture is the picture
  // not appearing. The wrapper is already drawing it.
  const panel = ownBackdrop(s) ? "transparent" : theme.panel;
  switch (block.type) {
    case "button": {
      const fill = s.background.color ?? theme.accent;
      return {
        // A button's label is derived from its own fill, never from the band.
        // The fill is the thing directly behind the text, and it is the value
        // most likely to be overridden.
        fg: s.color ?? readableInk(fill),
        fill,
        onFill: readableInk(fill),
        accent: theme.accent,
        rule: theme.rule,
      };
    }
    case "slides":
      return {
        fg: s.color ?? theme.fg,
        fill: s.background.color ?? panel,
        onFill: readableInk(s.background.color ?? theme.panel),
        accent: theme.accent,
        rule: theme.rule,
      };
    case "divider":
      return { fg: s.color ?? theme.rule, fill: panel, onFill: theme.fg, accent: theme.accent, rule: s.color ?? theme.rule };
    case "iconlist":
      return {
        fg: s.color ?? theme.fg,
        fill: panel,
        onFill: theme.fg,
        accent: hexOrNull(block.props.iconColor) ?? theme.accent,
        rule: theme.rule,
      };
    default:
      return {
        fg: s.color ?? theme.fg,
        // An explicit colour still wins: someone who set both a colour and an
        // image asked for the colour, and the wrapper draws them together.
        fill: s.background.color ?? panel,
        onFill: readableInk(s.background.color ?? theme.panel),
        accent: theme.accent,
        rule: theme.rule,
      };
  }
}

/** The max-width a block asks for, or null to fill its container. */
export function maxWidthCss(s: BlockStyle): string | null {
  if (s.width === "fit") return "fit-content";
  if (s.width === "custom" && s.maxWidthValue) return `${s.maxWidthValue}${s.maxWidthUnit}`;
  return null;
}

/** Typography, with every unset value left out so the cascade supplies it. */
export function typographyCss(s: BlockStyle): CSSProperties {
  const css: CSSProperties = {};
  // Named family first, then the page's own, then something that always
  // exists — a face whose file has not arrived must land on a real fallback
  // rather than on nothing.
  if (s.fontFamily) css.fontFamily = `${familyToken(s.fontFamily)}, var(--font-body), system-ui, sans-serif`;
  if (s.size !== null) css.fontSize = `${s.size}px`;
  if (s.lineHeight !== null) css.lineHeight = s.lineHeight;
  if (s.letterSpacing !== null) css.letterSpacing = `${s.letterSpacing}px`;
  // Truthiness, not `!== null`: the Weight select's "Page default" option
  // writes "" (a select's value is a string), and `normalizeBlocks` only turns
  // that into null on the next save. `font-weight:` with nothing after it is a
  // broken declaration and would take the rest of the rule with it.
  if (s.weight) css.fontWeight = s.weight;
  if (s.transform !== "none") css.textTransform = s.transform;
  return css;
}

/** The wrapper style: box model, alignment, background, corner. */
export function blockWrapperCss(block: Block, theme: BandTheme): CSSProperties {
  return wrapperCssFrom(block, block.style, theme);
}

function wrapperCssFrom(block: Block, s: BlockStyle, theme: BandTheme): CSSProperties {
  const css: CSSProperties = {
    margin: dimCss(s.margin),
    padding: dimCss(s.padding),
    // Where the words sit. Nothing to do with where the box sits — one control
    // used to set both, so asking for a centred column of text centred every
    // line inside it as well, which is the thing nobody wants.
    textAlign: s.textAlign,
    // A button's background belongs to the PILL, not to the box around it —
    // the pill is the thing anybody means by "the button's colour". Painting
    // the wrapper as well put a second rectangle of it behind a rounded
    // button, and left the control ambiguous about which one it drove.
    ...(block.type === "button" ? {} : backgroundCss(s.background, theme)),
  };

  const max = maxWidthCss(s);
  if (max) css.maxWidth = max;

  // Where the box sits. Auto margins only mean anything against a max width —
  // a block already filling its container has nowhere to move — so they are
  // applied regardless and simply do nothing in that case. The stored margin
  // occupies the shorthand above, so the sides are reapplied here.
  if (s.blockAlign === "center") {
    css.marginLeft = "auto";
    css.marginRight = "auto";
  } else if (s.blockAlign === "right") {
    css.marginLeft = "auto";
  }
  if (s.background.type !== "none" && s.radius) css.borderRadius = `${s.radius}px`;
  // An outline follows the band when it names no colour of its own, the same
  // way ink and fills do — so a bordered box stays visible when the section
  // preset underneath it changes.
  if (s.borderWidth > 0) {
    Object.assign(css, borderCss(s, theme));
    if (s.radius) css.borderRadius = `${s.radius}px`;
  }
  const shadow = shadowCss(s, theme);
  if (shadow) {
    css.boxShadow = shadow;
    // A shadow is cast by the box's edge, so it needs the corner even when
    // nothing is painted inside — an unfilled bordered card with a hard offset
    // would otherwise cast a square shadow behind a rounded outline.
    if (s.radius) css.borderRadius = `${s.radius}px`;
  }
  // Position too, or the number does nothing: z-index is ignored on a static
  // box. Only when one was actually set, so nothing that has never been
  // stacked starts creating a stacking context and changing what paints over
  // what elsewhere on the page.
  if (s.zIndex !== null) {
    css.position = "relative";
    css.zIndex = s.zIndex;
  }
  return css;
}

/**
 * Which widths hide this block, as rules off the block's own selector.
 *
 * These were Tailwind classes — `max-md:hidden`, `max-lg:md:hidden`,
 * `lg:hidden` — which made the hide flags the one part of a block's look whose
 * breakpoints were not this file's. Two ways that hurt:
 *
 *  - Tailwind's screens are `rem`, so they scale with the root font size. A
 *    reader who sets their browser text to Large gets a 20px root, `64rem`
 *    becomes 1280px, and a block set to hide on desktop stayed visible for
 *    another 256px while every other rule about it had already switched.
 *  - Even at 16px they were off by one against DEVICE_MAX: `lg:hidden` starts
 *    at 1024 and the typography query starts above 1023, so at 1023.5px a
 *    block hidden on desktop was visible wearing its full desktop type — a
 *    rendering it had at neither neighbouring width.
 *
 * Written as three bands that are exact complements off DEVICE_MAX, so every
 * real number belongs to exactly one and there is one set of boundaries in the
 * file rather than two that can drift.
 */
function hiddenRules(block: Block, sel: string): string[] {
  // Each flag is read at its own device, so switching to Mobile and unticking
  // "show this block" hides it on the phone — the device you were looking at —
  // rather than wherever the desktop copy of the flag happened to point.
  return [
    styleFor(block, "mobile").hideMobile ? `@media (max-width:${DEVICE_MAX.mobile}px)` : "",
    styleFor(block, "tablet").hideTablet
      ? `@media (width > ${DEVICE_MAX.mobile}px) and (max-width:${DEVICE_MAX.tablet}px)`
      : "",
    block.style.hideDesktop ? `@media (width > ${DEVICE_MAX.tablet}px)` : "",
  ]
    .filter(Boolean)
    .map((query) => `${query}{${sel}{display:none}}`);
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type RowLayout = {
  container: CSSProperties;
  columns: CSSProperties[];
};

/**
 * How a row lays out at one width.
 *
 * Flex with wrapping rather than a grid template, because a grid puts every
 * column on one line: "two across, then two more" is a thing people build, and
 * with percentage widths it falls out of wrapping for free.
 *
 * The width arithmetic is the whole trick. A column of W% in a container with
 * gap G cannot simply be W%, or a row of them overflows by G×(k−1). Taking
 * `G × (100−W)/100` off each column makes any subset that adds to 100 come out
 * at exactly 100% — including a single 100% column, which loses nothing.
 */
/**
 * Whether this row is stacked at this width, so its columns are each full width.
 *
 * Worth asking out loud: the panel showing "100" and "100" for a two-column row
 * is correct on a phone and looks exactly like a bug, because nothing on screen
 * says the columns are no longer side by side.
 */
export function stacksAt(block: Block, device: Device): boolean {
  const p = propsFor(block, device);
  const stack = String(p.stack ?? "mobile");
  const stacksHere =
    (device === "mobile" && stack !== "none") || (device === "tablet" && stack === "tablet");
  return stacksHere && !hasOverride(block, device, "widths", "props");
}

export function effectiveWidths(block: Block, device: Device): number[] {
  const p = propsFor(block, device);
  const count = block.columns?.length ?? 0;
  // Stacking is a default, not a lock: an explicit width for this device wins.
  // Without it every row would keep its desktop columns on a 390px phone, which
  // is exactly what people complain about.
  return stacksAt(block, device)
    ? Array.from({ length: count }, () => 100)
    : columnWidths(p, count);
}

/**
 * A column's own style at one width, overrides layered on.
 *
 * Through `columnAsBlock` and `styleFor` rather than a second layering function:
 * a column's overrides have the same shape a block's do precisely so there is
 * only ever one implementation of "mobile sits on tablet sits on desktop".
 */
const columnStyleAt = (row: Block, index: number, device: Device): BlockStyle =>
  styleFor(columnAsBlock(row, index), device);

/**
 * How one column places itself in the row, as declarations.
 *
 * Emitted only where something was actually set. Anything else and a row that
 * has been given a background — the one thing that puts a `columnStyles` entry
 * on it — would start emitting four flex properties it never emitted before,
 * and "the page renders identically" would stop being provable.
 */
function columnLayoutCss(col: ColumnLayout, count: number): CSSProperties {
  const css: CSSProperties = {};

  // A custom width with no number is not a width. The column keeps the one the
  // row already stores for it, the same answer `legacyWidth` gives a block.
  if (col.colWidth === "custom" && typeof col.colWidthValue === "number" && col.colWidthValue > 0) {
    css.width = `${col.colWidthValue}${oneOf(col.colWidthUnit, ["px", "%", "vw"] as const, "px")}`;
  }

  const self = oneOf(col.colAlignSelf, ["", "flex-start", "center", "flex-end", "stretch"] as const, "");
  if (self) css.alignSelf = self;

  // The row hands every column an `order` already — 0…n-1, or n…1 reversed — so
  // first and last only have to clear those, not reach for a magic 99999.
  if (col.colOrder === "start") css.order = -1;
  else if (col.colOrder === "end") css.order = count + 1;
  else if (col.colOrder === "custom" && typeof col.colOrderValue === "number") {
    css.order = Math.round(col.colOrderValue);
  }

  if (col.colSize === "grow") css.flexGrow = 1;
  else if (col.colSize === "shrink") css.flexShrink = 1;
  else if (col.colSize === "custom") {
    if (typeof col.colGrow === "number" && col.colGrow >= 0) css.flexGrow = col.colGrow;
    if (typeof col.colShrink === "number" && col.colShrink >= 0) css.flexShrink = col.colShrink;
  }
  return css;
}

/**
 * The width this column set for itself, or null — the row's share decides.
 *
 * `rowLayout` spreads `columnLayoutCss` last, on purpose, so a column given its
 * own Width overrules the share typed beside the other columns. Nothing said
 * so: the row's "Column widths" field kept showing and accepting 60/40 while
 * the canvas and the page drew 220px, and typing in it did nothing at all.
 *
 * Read back through the same function that emits it rather than re-reading the
 * three `colWidth*` keys here, so the panel can only ever report the width that
 * was actually written.
 */
export function columnOwnWidth(block: Block, index: number, device: Device): string | null {
  if (!block.columnStyles?.[index]) return null;
  const w = columnLayoutCss(columnStyleAt(block, index, device), block.columns?.length ?? 0).width;
  return typeof w === "string" ? w : null;
}

/**
 * What one column looks like, beyond how wide it is.
 *
 * Returned separately from the width because the width is arithmetic the row
 * owns and this is a decision someone made about that column.
 */
export function columnCss(
  block: Block,
  index: number,
  theme: BandTheme,
  device: Device = "desktop",
): CSSProperties {
  if (!block.columnStyles?.[index]) return {};
  const s = columnStyleAt(block, index, device);
  const css: CSSProperties = { ...backgroundCss(s.background, theme) };
  const pad = dimCss(s.padding);
  if (pad !== "0px 0px 0px 0px") css.padding = pad;
  if (s.radius) css.borderRadius = `${s.radius}px`;
  // A column can be outlined too — two boxed figures side by side is a row of
  // two columns, not a block that has to grow an option.
  if (s.borderWidth > 0) Object.assign(css, borderCss(s, theme));
  const shadow = shadowCss(s, theme);
  if (shadow) css.boxShadow = shadow;
  // Only where a background was actually set: a corner on a transparent column
  // rounds nothing, and clipping content that overflows would be a surprise.
  //
  // Never with a shadow: `overflow: hidden` clips the box's own children, not
  // its shadow, but the two together are the shape a card wants and the clip
  // is what stops a rounded column's fill squaring off at the corners.
  if (s.background.type !== "none" && s.radius) css.overflow = "hidden";
  // A column can be told to sit on top of its neighbour, which is what an
  // overlapping card actually is. Without it the only lever was source order,
  // and source order reverses inside the editor's own chrome.
  if (s.zIndex !== null) {
    css.position = "relative";
    css.zIndex = s.zIndex;
  }
  return css;
}

/**
 * The container's flex settings, as the only values we will turn into CSS.
 *
 * Allow-lists rather than `String(...)`: row props are raw jsonb and normalize
 * never validates them, so this function is the boundary where stored text
 * becomes a stylesheet. `declarations` strips `;{}` after us, which stops a
 * value ending the rule — it does not stop `justify-content: url(...)`.
 */
const DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;
const FLEX_PLACEMENT = [
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
] as const;
const OVERFLOWS = ["visible", "hidden", "auto"] as const;
/** The four the panel offers, plus the one CSS default nobody types. */
const ALIGN_ITEMS = ["stretch", "flex-start", "center", "flex-end", "baseline"] as const;
const CONTAINERS = ["flex", "grid"] as const;

/** Whether this container lays its columns out on a grid rather than a flex line. */
export const rowIsGrid = (block: Block, device: Device = "desktop"): boolean =>
  oneOf(propsFor(block, device).containerType, CONTAINERS, "flex") === "grid";

/**
 * A ceiling on how many tracks one container may name.
 *
 * Row props are raw jsonb, and `repeat(9999, …)` in a stylesheet is a browser
 * laying out ten thousand empty tracks on a page nobody can then load.
 */
const MAX_GRID_TRACKS = 12;

/**
 * One track: a length, a keyword, or a minmax() of two of those.
 *
 * A bare `0` is allowed alongside them because zero needs no unit and CSS says
 * so — and `minmax(0,1fr)`, the overflow-safe track this file emits itself, is
 * otherwise rejected by its own validator and silently replaced with equal
 * columns.
 */
const TRACK_SIZE = /^(auto|min-content|max-content|0|\d+(?:\.\d+)?(?:fr|px|%|em|rem|vw|vh))$/i;
const TRACK_MINMAX = /^minmax\(([^,()]+),([^,()]+)\)$/i;

/**
 * A stored track list, or the fallback when it is not one.
 *
 * This is the only free-text value in the whole schema that becomes a CSS
 * value, so it is parsed rather than escaped. `declarations` strips `;{}`
 * afterwards, which stops a value ending the rule — it does not stop
 * `url(...)`, an `expression(...)`, or an unbalanced paren swallowing the rest
 * of the stylesheet. Anything that is not a list of recognised tracks is not a
 * track list, and equal columns are a better answer than a broken page.
 *
 * A bare number is the common case — "3" means three equal columns — so it is
 * read as a count rather than rejected as a length with no unit.
 */
export function gridTracks(raw: unknown, fallback: string): string {
  // Commas may carry spaces: `minmax(100px, 1fr)` is one track, not two.
  const text = typeof raw === "string" ? raw.trim().replace(/\s*,\s*/g, ",") : "";
  if (!text) return fallback;
  if (/^\d{1,2}$/.test(text)) {
    return `repeat(${Math.min(Math.max(Number(text), 1), MAX_GRID_TRACKS)}, minmax(0,1fr))`;
  }
  const tokens = text.split(/\s+/);
  const ok =
    tokens.length <= MAX_GRID_TRACKS &&
    tokens.every((t) => {
      const mm = TRACK_MINMAX.exec(t);
      return mm ? TRACK_SIZE.test(mm[1]) && TRACK_SIZE.test(mm[2]) : TRACK_SIZE.test(t);
    });
  return ok ? tokens.join(" ").toLowerCase() : fallback;
}

/**
 * How wide "Boxed" holds a row's columns.
 *
 * The same measure the band itself uses (`max-w-[1040px]` in sales-page.tsx),
 * so a boxed row inside a band nobody has widened is a no-op — which is the
 * point: Boxed can only ever narrow, so it could not have been the default
 * without re-boxing every row already saved.
 */
export const BAND_MEASURE = 1040;

/**
 * The grid half of a container, as declarations.
 *
 * Written as one `gap` shorthand rather than a `row-gap` and a `column-gap`
 * beside it. The media queries diff against the width above and undo a property
 * this width does not set — and `column-gap: revert` reverts past the `gap` in
 * the desktop rule too, so a phone that only changed the row gap would lose the
 * column gap entirely. One property can only ever be restated, never undone.
 *
 * Stacking still decides the track list: a phone that falls into one column has
 * one track and as many rows as there are columns, which is what the row's
 * `stack` setting has always meant and what people expect it to keep meaning.
 */
function gridContainer(
  p: Record<string, unknown>,
  count: number,
  gap: number,
  stacked: boolean,
): CSSProperties {
  const colGap = typeof p.columnGap === "number" && p.columnGap >= 0 ? p.columnGap : gap;
  const rowGap = typeof p.rowGap === "number" && p.rowGap >= 0 ? p.rowGap : gap;
  const css: CSSProperties = {
    display: "grid",
    gridTemplateColumns: stacked
      ? "minmax(0,1fr)"
      : gridTracks(p.gridColumns, `repeat(${Math.max(count, 1)}, minmax(0,1fr))`),
    gap: `${rowGap}px ${colGap}px`,
    alignItems: oneOf(p.verticalAlign, ALIGN_ITEMS, "stretch"),
  };
  const rows = gridTracks(p.gridRows, "");
  if (rows) css.gridTemplateRows = rows;
  // Column flow only: `row` is the CSS default, so emitting it would be a
  // declaration on every grid container that says nothing.
  //
  // Never where the row has stacked. The single track above only sizes the
  // FIRST item under column flow; the rest are placed into implicit columns
  // sized by grid-auto-columns, so "stack into one" left four columns of 80px
  // side by side on a 390px phone instead of four rows.
  if (!stacked && oneOf(p.autoFlow, ["row", "column"] as const, "row") === "column") {
    css.gridAutoFlow = "column";
  }
  const items = oneOf(p.justifyItems, ["", "start", "center", "end", "stretch"] as const, "");
  if (items) css.justifyItems = items;
  return css;
}

export function rowLayout(block: Block, device: Device): RowLayout {
  const p = propsFor(block, device);
  const count = block.columns?.length ?? 0;
  const gap = typeof p.gap === "number" ? p.gap : 24;
  const widths = effectiveWidths(block, device);

  const direction = oneOf(p.direction, DIRECTIONS, "row");
  const down = direction === "column" || direction === "column-reverse";
  // Every reversal is an `order` flip, including column-reverse — one mechanism,
  // and the one already in the database. `flex-direction: row-reverse` would
  // also move the edge Justify Content packs against, which is not what the old
  // Reverse switch ever meant, and a row saved with it on has to keep emitting
  // the CSS it emits today.
  const flip = direction === "row-reverse" || direction === "column-reverse";
  const justify = oneOf(p.justify, FLEX_PLACEMENT, "flex-start");
  const alignContent = oneOf(p.alignContent, [...FLEX_PLACEMENT, ""] as const, "");
  const overflow = oneOf(p.overflow, OVERFLOWS, "visible");
  // A string, never a number: `declarations` leaves bare numbers unitless, so a
  // numeric min-height would emit `min-height:400` and do nothing at all.
  const minHeight =
    typeof p.minHeight === "number" && Number.isFinite(p.minHeight) && p.minHeight > 0
      ? `${p.minHeight}${p.minHeightUnit === "vh" ? "vh" : "px"}`
      : "";

  const grid = rowIsGrid(block, device);
  const stacked = stacksAt(block, device);

  // Only what was actually set gets a declaration. Emitting a neutral value for
  // each of these instead would put six new properties on every row on every
  // page for nothing, and "renders identically" would stop being provable.
  const container: CSSProperties = grid
    ? gridContainer(p, block.columns?.length ?? 0, gap, stacked)
    : {
        display: "flex",
        // Stacking wins over No wrap. Stacking only ever set the column widths
        // to 100%, and 100% on a `nowrap` line still shrinks — two columns set
        // to stack came out side by side at 171px each on a 390px phone.
        flexWrap: stacked ? "wrap" : oneOf(p.wrap, ["wrap", "nowrap"] as const, "wrap"),
        gap: `${gap}px`,
        alignItems: oneOf(p.verticalAlign, ALIGN_ITEMS, "stretch"),
      };
  // Direction is the flex half of the pair; on a grid the axis is grid-auto-flow
  // and `flex-direction` on a grid container does nothing at all.
  if (down && !grid) container.flexDirection = "column";
  if (justify !== "flex-start") container.justifyContent = justify;
  if (alignContent) container.alignContent = alignContent;
  if (minHeight) container.minHeight = minHeight;
  if (overflow !== "visible") container.overflow = overflow;
  if (p.contentWidth === "boxed") {
    // The measure is the container's own, not a constant it can only read.
    // Boxed used to mean 1040px and nothing else, so on a full-width band the
    // one control that could narrow the content was a number nobody could
    // reach — the same complaint the section's Width panel answered, one level
    // down. Blank still means the page's measure.
    const n = p.contentMaxWidth;
    const unit = p.contentMaxWidthUnit === "%" ? "%" : "px";
    container.maxWidth =
      typeof n === "number" && Number.isFinite(n) && n > 0
        ? `${Math.min(n, unit === "%" ? 100 : 2400)}${unit}`
        : `${BAND_MEASURE}px`;
    container.marginInline = "auto";
  }

  return {
    container,
    columns: widths.map((w, i) => ({
      // minWidth:0 or a long unbroken word makes the column refuse to shrink.
      minWidth: 0,
      // A grid item is as wide as its track, and the track list already said how
      // wide that is. Keeping the flex arithmetic here would make every column
      // narrower than the track it sits in by the gap it does not have to pay
      // for — a grid's gap lives outside the tracks.
      //
      // Down the page the gap runs between the columns, not across them, so
      // there is nothing to subtract — taking it off would leave every stacked
      // column narrower than the width someone typed.
      width: grid ? "auto" : down ? `${w}%` : `calc(${w}% - ${Math.round((gap * (100 - w)) / 100 * 100) / 100}px)`,
      // Order, not reversed markup: the columns have to stay where they are in
      // the DOM or the editor's drop targets and the reading order move too.
      order: flip ? count - i : i,
      // Last, so a column that was given its own width or order overrules the
      // row's — that is the whole point of setting one on the column.
      ...(block.columnStyles?.[i]
        ? columnLayoutCss(columnStyleAt(block, i, device), count)
        : {}),
    })),
  };
}

// ---------------------------------------------------------------------------
// Per-device CSS
// ---------------------------------------------------------------------------

/**
 * The class the emitted rules hang off. Derived from the block id so it is
 * stable across renders and unique on the page without a counter.
 */
export const blockClass = (block: Block) => `bk-${block.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

/** camelCase React property -> the CSS property it stands for. */
function cssProp(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * Declarations as CSS text.
 *
 * Numbers are left bare. Every length in this file is already a string with a
 * unit; the only bare numbers are line-height, font-weight and a column's
 * order, flex-grow and flex-shrink, all unitless by definition — so appending
 * "px" here would be wrong every time.
 */
function declarations(css: CSSProperties): string {
  return Object.entries(css)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    // Semicolons and braces would end the declaration and open a new rule, and
    // `</` would end the <style> ELEMENT — a raw-text element closes at the
    // first `</style`, so everything after it is parsed as markup. Most values
    // reaching here are allow-listed, but `verticalAlign` and anything added
    // beside it are raw jsonb props, and this is the boundary where a string
    // becomes a stylesheet.
    .map(([k, v]) => `${cssProp(k)}:${String(v).replace(/[;{}]|<\//g, "")}`)
    .join(";");
}

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
export type HeadingTag = (typeof HEADING_TAGS)[number];
export const headingTag = (v: unknown): HeadingTag =>
  HEADING_TAGS.includes(v as HeadingTag) ? (v as HeadingTag) : "h2";

/** Sizes for a heading level, used only when the block sets none of its own. */
export const HEADING_SIZE: Record<HeadingTag, string> = {
  h1: "clamp(2.3rem,5.6vw,4.2rem)",
  h2: "clamp(1.7rem,3.4vw,2.4rem)",
  h3: "1.12rem",
  h4: "1.02rem",
  h5: "0.94rem",
  h6: "0.84rem",
};

/**
 * What a block type looks like before anyone styles it.
 *
 * These used to be Tailwind classes on the element itself, which was fine while
 * the user's own values were inline — an attribute beats a class. Now that the
 * user's values are rules too, a class would beat them: `leading-[1.15]` on the
 * heading would quietly win over a line height set on mobile. So the defaults
 * are declarations in the same rule, ahead of the user's, where the cascade
 * settles it correctly.
 */
function typeDefaultCss(block: Block): CSSProperties {
  switch (block.type) {
    case "heading":
      return {
        fontSize: HEADING_SIZE[headingTag(block.props.tag)],
        fontWeight: 600,
        lineHeight: 1.15,
        letterSpacing: "-0.015em",
      };
    case "text":
      return { lineHeight: 1.625 };
    default:
      return {};
  }
}

/**
 * Everything a block's look is, at one device, as a style object.
 *
 * The live page turns this into rules so media queries can carry it. An editor
 * canvas has to apply it directly — it is 390px wide inside a 1900px window, so
 * a `max-width: 767px` query would not match and the phone view would silently
 * show the desktop styling.
 *
 * The wrapper only. A canvas needs `blockTextRules` beside this for the same
 * reason the live page does — see the comment on TEXT_TAGS.
 */
export function blockCssAt(block: Block, theme: BandTheme, device: Device = "desktop"): CSSProperties {
  return {
    // No `ownInk` here: `frameCss` already resolves to the block's own colour
    // when it has one — that split exists so the RULES can name the text
    // without also painting the band's default onto it.
    ...frameCss(block, theme, styleFor(block, device)),
    ...typographyAt(ownTypography(block, device)),
  };
}

/**
 * Everything about a block's look that a narrower width still inherits.
 *
 * The colour is here rather than with the six per-width values because nothing
 * site-wide answers for it on a sales page: the band paints `color` inline on
 * its own `<section>`, so `:root body{color}` never reaches inside one. A
 * colour withdrawn at 1023px and narrower would fall to the band's ink, not to
 * anything the owner chose — so it inherits down the widths the way padding does.
 */
function frameCss(block: Block, theme: BandTheme, s: BlockStyle): CSSProperties {
  return {
    ...wrapperCssFrom(block, s, theme),
    ...typeDefaultCss(block),
    color: blockColors(block, theme, s).fg,
  };
}

/**
 * The colour the block itself was given, or nothing.
 *
 * Kept apart from `frameCss`'s colour, which is the band's own ink whenever the
 * block names none. Only a colour somebody typed may be written onto the text
 * inside the block: painting the band's default there too would beat the
 * `:root h2{color}` a bare heading is supposed to get from Settings.
 */
function ownInk(block: Block, device: Device): CSSProperties {
  const color = styleFor(block, device).color;
  return color ? { color } : {};
}

/**
 * The six values a width only gets if it set them itself.
 *
 * They are exactly the ones lib/site-typography answers for, so a width that
 * says nothing has somewhere better to fall than "whatever the laptop said".
 */
function typographyAt(own: Partial<BlockStyle>): CSSProperties {
  return typographyCss(baseStyle(own));
}

/**
 * The tags a block's own typography has to name as well as inherit to.
 *
 * A block's rule sits on its wrapper `<div>`, and a wrapper reaches the text
 * inside it only by inheritance — which loses to ANY rule that names the tag.
 * Both `:root h2` from Settings and the `h1, h2, h3, h4` in app/globals.css
 * name it, so until this existed the size, weight, family and tracking typed
 * into a heading block's panel never reached the heading: a heading given 48px
 * rendered at whatever Settings said, and at globals' tracking and face.
 *
 * `:where()` contributes nothing to specificity, so this arm is 0-2-0 exactly
 * as the wrapper arm is — the block still beats the site, and the site still
 * beats a block that set nothing.
 *
 * `a` is deliberately absent. A link colour is a site-wide decision by
 * definition, and naming `a` here at 0-2-0 would also outrank `:root a:hover`
 * (0-1-2) and leave every link inside a styled block unresponsive to hover.
 */
const TEXT_TAGS = "h1,h2,h3,h4,h5,h6,p,li,ul,ol,blockquote";

/** One rule, or "" when there is nothing to say. A rule with no body is a bug. */
function ruleFor(selector: string, css: CSSProperties): string {
  const body = declarations(css);
  return body ? `${selector}{${body}}` : "";
}

/**
 * The text half of a block's rules, resolved to one width, with no media query.
 *
 * For an editor canvas. The wrapper there is a `style` attribute — see
 * `blockCssAt` — but an attribute cannot name the block's own children, and
 * those children are exactly where `.site-type h2` from the Settings preview
 * would otherwise win. Without this the builder shows the site's heading size
 * while the page a buyer gets shows the block's.
 */
/**
 * A block's hand-written CSS, scoped to the block, on its own.
 *
 * `blockRules` already folds this in for the live page. The editor canvas
 * renders pinned to a device, so it never calls that — which meant Custom CSS
 * applied to a visitor and to nobody editing. Exported separately rather than
 * inlined there so the two callers share one scoping rule; a second copy of
 * the `selector` substitution is how the editor and the page drift apart.
 */
export function blockCustomRules(block: Block): string {
  return customCss(block.style.customCss, `.${blockClass(block)}.${blockClass(block)}`);
}

export function blockTextRules(block: Block, device: Device): string {
  const sel = `.${blockClass(block)}.${blockClass(block)} :where(${TEXT_TAGS})`;
  return ruleFor(sel, { ...typographyAt(ownTypography(block, device)), ...ownInk(block, device) });
}

/**
 * Everything a block's look needs, as one stylesheet.
 *
 * Emitted as rules rather than a `style` attribute because that is the only
 * form a media query can take — and because rules lose to a `style` attribute,
 * mixing the two would mean every responsive value fighting its own desktop
 * value with `!important`.
 *
 * Tablet is written before mobile so a phone gets both: an override set on
 * tablet and not on mobile applies at 390px too, which is what "mobile
 * inherits tablet" means once it is CSS.
 */
export function blockRules(block: Block, theme: BandTheme): string {
  // The class twice, on purpose — not a typo. One class is 0-1-0, which loses to
  // any site-wide rule written as `:root h1` (0-1-1); repeating it makes the same
  // selector 0-2-0 and puts the block back on top. It still matches exactly the
  // elements one class matched, so nothing here reaches anything new.
  const sel = `.${blockClass(block)}.${blockClass(block)}`;
  // The wrapper and the text it holds, at the same specificity. See TEXT_TAGS.
  const textSel = `${sel},${sel} :where(${TEXT_TAGS})`;
  const out: string[] = [];
  const frame = declarations(frameCss(block, theme, block.style));
  if (frame) out.push(`${sel}{${frame}}`);

  // The desktop typography is scoped to the desktop width instead of riding the
  // unscoped rule with everything else. That is the whole of "a width that sets
  // nothing falls through to the site's own type": at the tablet ceiling and
  // below this rule stops matching, nothing replaces it, and the `:root h2`
  // written from Settings is what is left standing.
  //
  // A width query rather than a `revert` in the narrow ones, because `revert`
  // rolls back the whole author origin — it would discard the site rule too and
  // land on the browser's default.
  //
  // Written as the exact complement of the tablet query below, off the same
  // number, not as a second constant one greater than it. `min-width:1024px`
  // beside `max-width:1023px` left a gap: a viewport at 1023.5 CSS px matched
  // neither, and there is nothing exotic about landing there — 110% zoom on a
  // 1126px window is 1023.6, and a fractional-DPR window gets there on its own.
  // In that band a heading given a size lost it to the site default while the
  // page around it was still desktop in every other respect. `(width > N)` is
  // true exactly when `(max-width:N)` is false, so the two together cover every
  // real number and there is one boundary here rather than two that can drift.
  const desktop = declarations(typographyAt(ownTypography(block, "desktop")));
  if (desktop) out.push(`@media (width > ${DEVICE_MAX.tablet}px){${textSel}{${desktop}}}`);

  // The colour follows the frame's rules, not the six's — but it still has to
  // name the text, or `:root h2{color}` beats it there while the wrapper keeps
  // it. Diffed, so a width that did not change it stays silent.
  const ink = declarations(ownInk(block, "desktop"));
  if (ink) out.push(`${sel} :where(${TEXT_TAGS}){${ink}}`);

  for (const device of ["tablet", "mobile"] as const) {
    const wider = device === "mobile" ? "tablet" : "desktop";
    // Only the frame properties this device actually changes. Re-stating the
    // whole style would bake the wider values into the media query, and the
    // next desktop edit would stop reaching the phone.
    const box = block.responsive
      ? diff(
          frameCss(block, theme, styleFor(block, device)),
          frameCss(block, theme, styleFor(block, wider)),
        )
      : {};
    // Typography is not diffed: nothing above it is in force at this width, so
    // there is nothing to restate and nothing to undo.
    const type = declarations(typographyAt(ownTypography(block, device)));
    const boxCss = declarations(box);
    const query = `@media (max-width:${DEVICE_MAX[device]}px)`;
    // The box stays on the wrapper; only the typography reaches the text.
    const inner = [
      boxCss ? `${sel}{${boxCss}}` : "",
      type ? `${textSel}{${type}}` : "",
      block.responsive ? ruleFor(`${sel} :where(${TEXT_TAGS})`, diff(ownInk(block, device), ownInk(block, wider))) : "",
    ]
      .filter(Boolean)
      .join("");
    if (inner) out.push(`${query}{${inner}}`);
  }

  const capped = mobilePaddingCap(block, sel);
  if (capped) out.push(capped);

  if (block.type === "row") out.push(...rowRules(block, sel, theme));
  if (block.type === "cards") out.push(...cardsRules(block, sel));

  // After the frame and the per-device boxes, so `display:none` wins on source
  // order against whatever `display` those set — and before the custom CSS,
  // which stays the last word.
  out.push(...hiddenRules(block, sel));

  const custom = customCss(block.style.customCss, sel);
  if (custom) out.push(custom);
  return out.join("");
}

/**
 * Side padding that would eat a phone.
 *
 * Padding cascades down and cannot shrink: 160px of side padding set on a
 * laptop is still 160px on a 390px handset, which leaves 70px of column for
 * the text. It was the standard way to pull a block toward the middle, because
 * until the width control could set a measure there was no other way to do it.
 *
 * The cap only applies where the phone INHERITED the value. Setting padding at
 * mobile deliberately is a decision, and a decision the editor quietly
 * overrules is worse than the problem.
 *
 * `min()` rather than a smaller fixed number: it keeps the chosen padding
 * wherever it fits and only gives way on the screens where it does not.
 */
export const MOBILE_SIDE_PADDING_MAX = 24;

/**
 * The ceiling the phone gives way to, as a share of the screen. Named rather
 * than typed into the template because the notice in the panel quotes it: a
 * panel that says one number while the CSS does another is worse than either.
 */
export const MOBILE_SIDE_PADDING_VW = 5;

export function mobilePaddingCap(block: Block, sel: string): string {
  const p = styleFor(block, "mobile").padding;
  // A percentage or em already scales with something; only a fixed length is
  // stuck at its desktop size.
  if (p.u !== "px") return "";
  if (hasOverride(block, "mobile", "padding")) return "";

  const decls: string[] = [];
  const vw = `${MOBILE_SIDE_PADDING_VW}vw`;
  if (p.l > MOBILE_SIDE_PADDING_MAX) decls.push(`padding-left:min(${p.l}px,${vw})`);
  if (p.r > MOBILE_SIDE_PADDING_MAX) decls.push(`padding-right:min(${p.r}px,${vw})`);
  if (decls.length === 0) return "";
  return `@media (max-width:${DEVICE_MAX.mobile}px){${sel}{${decls.join(";")}}}`;
}

/**
 * What to tell the person who set that padding.
 *
 * The cap keeps the page usable, but a phone that quietly ignores a number you
 * typed is a phone you stop trusting. This says what happened and where to
 * change it, in the panel where the number lives.
 */
export function mobilePaddingNotice(block: Block): string | null {
  const p = styleFor(block, "mobile").padding;
  if (p.u !== "px" || hasOverride(block, "mobile", "padding")) return null;
  const worst = Math.max(p.l, p.r);
  if (worst <= MOBILE_SIDE_PADDING_MAX) return null;
  return `${worst}px of side padding would leave almost no room on a phone, so it is capped at ${MOBILE_SIDE_PADDING_VW}% of the screen there. Set a padding on mobile to choose your own.`;
}

/**
 * The column rules, per width.
 *
 * `> [data-row]` and `> [data-row] > :nth-child(n)` are direct children on
 * purpose: a row nested inside a column would otherwise match its parent's
 * selector and take the outer row's widths.
 */
function rowRules(block: Block, sel: string, theme: BandTheme): string[] {
  const out: string[] = [];
  // A column's decoration belongs in the rule, not on the element: it holds
  // per-device overrides now, and a background set on mobile cannot reach the
  // live page from a style attribute — an attribute has no media query, and it
  // would outrank the one this emits anyway.
  const at = (device: Device): RowLayout => {
    const layout = rowLayout(block, device);
    return {
      container: layout.container,
      columns: layout.columns.map((col, i) => ({ ...col, ...columnCss(block, i, theme, device) })),
    };
  };
  const write = (layout: RowLayout, prev: RowLayout | null): string => {
    const parts: string[] = [];
    const box = prev ? diff(layout.container, prev.container) : layout.container;
    const boxDecls = declarations(box);
    if (boxDecls) parts.push(`${sel} > [data-row]{${boxDecls}}`);
    layout.columns.forEach((col, i) => {
      const d = prev?.columns[i] ? diff(col, prev.columns[i]) : col;
      const decls = declarations(d);
      if (decls) parts.push(`${sel} > [data-row] > :nth-child(${i + 1}){${decls}}`);
    });
    return parts.join("");
  };

  const desktop = at("desktop");
  out.push(write(desktop, null));

  let wider = desktop;
  for (const device of ["tablet", "mobile"] as const) {
    const here = at(device);
    const body = write(here, wider);
    if (body) out.push(`@media (max-width:${DEVICE_MAX[device]}px){${body}}`);
    wider = here;
  }
  return out.filter(Boolean);
}

/**
 * How many cards stand across at one width.
 *
 * Clamped rather than trusted: block props are raw jsonb and normalize never
 * validates them, so an import or a hand-written row is one bad value away from
 * `repeat(NaN,…)`, which drops the grid to a single column with no explanation.
 */
export function cardsAcross(block: Block, device: Device): number {
  const raw = Number(propsFor(block, device).columns);
  // Six, the same ceiling a row of columns has. Four is the right limit for
  // cards with words in them and the wrong one for a strip of logos, which is
  // a grid of six small pictures and nothing else — capped at four it wrapped
  // 4 + 2 and stopped reading as one row of marks.
  return Math.min(Math.max(Number.isFinite(raw) ? Math.round(raw) : 3, 1), 6);
}

const cardsTrackAt = (block: Block, device: Device) => `repeat(${cardsAcross(block, device)}, minmax(0,1fr))`;

const acrossIsPerDevice = (block: Block) =>
  hasOverride(block, "tablet", "columns", "props") || hasOverride(block, "mobile", "columns", "props");

/**
 * The `--cards` track list to put in the style attribute, or null when the
 * stylesheet owns it instead.
 *
 * "Across" holds a value per device and a media query cannot live in an
 * attribute — and an attribute would outrank the media query anyway. So a block
 * whose Across differs on tablet or mobile hands the property over to
 * `cardsRules` entirely rather than fighting its own inline value. A block
 * nobody made responsive keeps the attribute it has always had.
 *
 * Pinned to a device it always inlines: no rules are emitted there, because a
 * 390px canvas inside a 1900px window never fires a media query.
 */
export function cardsTrack(block: Block, at?: Device): string | null {
  if (!at && acrossIsPerDevice(block)) return null;
  return cardsTrackAt(block, at ?? "desktop");
}

/** Set on the block's own wrapper, so it inherits down to the grid inside. */
function cardsRules(block: Block, sel: string): string[] {
  if (!acrossIsPerDevice(block)) return [];
  let wider = cardsTrackAt(block, "desktop");
  const out = [`${sel}{--cards:${wider}}`];
  for (const device of ["tablet", "mobile"] as const) {
    const here = cardsTrackAt(block, device);
    if (here !== wider) out.push(`@media (max-width:${DEVICE_MAX[device]}px){${sel}{--cards:${here}}}`);
    wider = here;
  }
  return out;
}

/** Only what changed, so a media query does not freeze the wider values in. */
function diff(next: CSSProperties, prev: CSSProperties): CSSProperties {
  const out: CSSProperties = {};
  for (const [k, v] of Object.entries(next)) {
    if (v !== prev[k as keyof CSSProperties]) (out as Record<string, unknown>)[k] = v;
  }
  // A property the wider width set and this one does not must be undone, not
  // left standing. It cost nothing while a row emitted the same four
  // declarations everywhere; now that direction, justify, min height and
  // overflow are only emitted when someone sets them, a row that is a column on
  // a laptop and a row on a phone would keep `flex-direction:column` on the
  // phone forever. The block-level rules above already work this way.
  for (const k of Object.keys(prev)) {
    if (!(k in next)) (out as Record<string, unknown>)[k] = "revert";
  }
  return out;
}

/**
 * Hand-written CSS, kept inside the thing it was written for.
 *
 * `selector` stands for the block, the way Elementor's does. Bare declarations
 * — no braces at all — are wrapped in it, because "font-size: 20px" is what
 * most people type first and it should mean what it looks like it means.
 *
 * The scoping is not a security boundary; the author is an admin who could
 * write the same rule at page level. It is there so a stray selector cannot
 * repaint the rest of the page from inside one block, which is a debugging
 * nightmare rather than an attack.
 */
export function customCss(code: string, selector: string): string {
  const src = code.trim();
  if (!src) return "";
  // A closing brace inside a value would end the rule early and let whatever
  // follows apply to the whole page.
  const safe = src.includes("</") ? src.replace(/<\//g, "") : src;
  if (!safe.includes("{")) return `${selector}{${safe.replace(/[{}]/g, "")}}`;
  return safe.replace(/\bselector\b/g, selector);
}

/** A tinted version of the band accent, for soft fills inside a block. */
export function softAccent(theme: BandTheme, alpha = 0.1): string {
  return tint(theme.accent, alpha);
}
