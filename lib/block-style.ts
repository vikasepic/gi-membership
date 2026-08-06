import type { CSSProperties } from "react";
import { readableInk, tint } from "@/lib/color";
import { imageSrc, type BandTheme } from "@/lib/page-sections";
import {
  DEVICE_MAX,
  columnWidths,
  hasOverride,
  propsFor,
  styleFor,
  type Background,
  type Block,
  type BlockStyle,
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

export function blockColors(block: Block, theme: BandTheme, at: BlockStyle = block.style): BlockColors {
  const s = at;
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
        fill: s.background.color ?? theme.panel,
        onFill: readableInk(s.background.color ?? theme.panel),
        accent: theme.accent,
        rule: theme.rule,
      };
    case "divider":
      return { fg: s.color ?? theme.rule, fill: theme.panel, onFill: theme.fg, accent: theme.accent, rule: s.color ?? theme.rule };
    case "iconlist":
      return {
        fg: s.color ?? theme.fg,
        fill: theme.panel,
        onFill: theme.fg,
        accent: hexOrNull(block.props.iconColor) ?? theme.accent,
        rule: theme.rule,
      };
    default:
      return {
        fg: s.color ?? theme.fg,
        fill: s.background.color ?? theme.panel,
        onFill: readableInk(s.background.color ?? theme.panel),
        accent: theme.accent,
        rule: theme.rule,
      };
  }
}

export const BLOCK_WIDTH: Record<BlockStyle["width"], string> = {
  fit: "fit-content",
  narrow: "38ch",
  normal: "62ch",
  wide: "100%",
  full: "100%",
};

/** Typography, with every unset value left out so the cascade supplies it. */
export function typographyCss(s: BlockStyle): CSSProperties {
  const css: CSSProperties = {};
  if (s.size !== null) css.fontSize = `${s.size}px`;
  if (s.lineHeight !== null) css.lineHeight = s.lineHeight;
  if (s.letterSpacing !== null) css.letterSpacing = `${s.letterSpacing}px`;
  if (s.weight !== null) css.fontWeight = s.weight;
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
    textAlign: s.align,
    ...backgroundCss(s.background, theme),
  };
  if (s.width !== "full") {
    css.maxWidth = BLOCK_WIDTH[s.width];
    // A centred block with a max width needs auto margins, but the stored
    // margin already occupies the shorthand — so the sides are reapplied.
    if (s.align === "center") {
      css.marginLeft = "auto";
      css.marginRight = "auto";
    }
  }
  if (s.background.type !== "none" && s.radius) css.borderRadius = `${s.radius}px`;
  return css;
}

/**
 * Which breakpoints hide this block.
 *
 * Returned as class names rather than inline CSS: a media query cannot be
 * expressed in a style attribute, and this is the one part of a block's look
 * that depends on the viewport rather than on the band.
 */
export function hiddenClasses(block: Block): string {
  // Each flag is read at its own device, so switching to Mobile and unticking
  // "show this block" hides it on the phone — the device you were looking at —
  // rather than wherever the desktop copy of the flag happened to point.
  return [
    styleFor(block, "mobile").hideMobile ? "max-md:hidden" : "",
    styleFor(block, "tablet").hideTablet ? "max-lg:md:hidden" : "",
    block.style.hideDesktop ? "lg:hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
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
 * What one column looks like, beyond how wide it is.
 *
 * Returned separately from the width because the width is arithmetic the row
 * owns and this is a decision someone made about that column.
 */
export function columnCss(block: Block, index: number, theme: BandTheme): CSSProperties {
  const s = block.columnStyles?.[index];
  if (!s) return {};
  const css: CSSProperties = { ...backgroundCss(s.background, theme) };
  const pad = dimCss(s.padding);
  if (pad !== "0px 0px 0px 0px") css.padding = pad;
  if (s.radius) css.borderRadius = `${s.radius}px`;
  // Only where a background was actually set: a corner on a transparent column
  // rounds nothing, and clipping content that overflows would be a surprise.
  if (s.background.type !== "none" && s.radius) css.overflow = "hidden";
  return css;
}

export function rowLayout(block: Block, device: Device): RowLayout {
  const p = propsFor(block, device);
  const count = block.columns?.length ?? 0;
  const gap = typeof p.gap === "number" ? p.gap : 24;
  const widths = effectiveWidths(block, device);

  return {
    container: {
      display: "flex",
      flexWrap: "wrap",
      gap: `${gap}px`,
      alignItems: String(p.verticalAlign ?? "stretch"),
    },
    columns: widths.map((w, i) => ({
      // minWidth:0 or a long unbroken word makes the column refuse to shrink.
      minWidth: 0,
      width: `calc(${w}% - ${Math.round((gap * (100 - w)) / 100 * 100) / 100}px)`,
      // Order, not reversed markup: the columns have to stay where they are in
      // the DOM or the editor's drop targets and the reading order move too.
      order: p.reverse === true ? count - i : i,
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
 * unit; the only bare numbers are line-height and font-weight, which are
 * unitless by definition — so appending "px" here would be wrong every time.
 */
function declarations(css: CSSProperties): string {
  return Object.entries(css)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    // Semicolons and braces would end the declaration and open a new rule. The
    // values reaching here are validated, but this is the boundary where a
    // string becomes a stylesheet, so it is checked at the boundary.
    .map(([k, v]) => `${cssProp(k)}:${String(v).replace(/[;{}]/g, "")}`)
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
 */
export function blockCssAt(block: Block, theme: BandTheme, device: Device = "desktop"): CSSProperties {
  return deviceCss(block, theme, styleFor(block, device));
}

/** The style a block has at a device, ready to be written as a rule. */
function deviceCss(block: Block, theme: BandTheme, s: BlockStyle): CSSProperties {
  return {
    ...wrapperCssFrom(block, s, theme),
    ...typeDefaultCss(block),
    ...typographyCss(s),
    color: blockColors(block, theme, s).fg,
  };
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
  const sel = `.${blockClass(block)}`;
  const out: string[] = [];
  const desktop = declarations(deviceCss(block, theme, block.style));
  if (desktop) out.push(`${sel}{${desktop}}`);

  const r = block.responsive;
  if (r) {
    for (const device of ["tablet", "mobile"] as const) {
      if (Object.keys(r[device]).length === 0) continue;
      const s = styleFor(block, device);
      // Only the properties this device actually changes. Re-stating the whole
      // style would bake the desktop values into the media query, and the next
      // desktop edit would stop reaching the phone.
      const full = deviceCss(block, theme, s);
      const base = deviceCss(block, theme, styleFor(block, device === "mobile" ? "tablet" : "desktop"));
      const diff: CSSProperties = {};
      for (const [k, v] of Object.entries(full)) {
        if (v !== base[k as keyof CSSProperties]) (diff as Record<string, unknown>)[k] = v;
      }
      // A property the wider device sets and this one does not must be undone,
      // not left standing — "no padding on mobile" is a real thing to say.
      for (const k of Object.keys(base)) {
        if (!(k in full)) (diff as Record<string, unknown>)[k] = "revert";
      }
      const decls = declarations(diff);
      if (decls) out.push(`@media (max-width:${DEVICE_MAX[device]}px){${sel}{${decls}}}`);
    }
  }

  if (block.type === "row") out.push(...rowRules(block, sel));

  const custom = customCss(block.style.customCss, sel);
  if (custom) out.push(custom);
  return out.join("");
}

/**
 * The column rules, per width.
 *
 * `> [data-row]` and `> [data-row] > :nth-child(n)` are direct children on
 * purpose: a row nested inside a column would otherwise match its parent's
 * selector and take the outer row's widths.
 */
function rowRules(block: Block, sel: string): string[] {
  const out: string[] = [];
  const at = (device: Device) => rowLayout(block, device);
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

/** Only what changed, so a media query does not freeze the wider values in. */
function diff(next: CSSProperties, prev: CSSProperties): CSSProperties {
  const out: CSSProperties = {};
  for (const [k, v] of Object.entries(next)) {
    if (v !== prev[k as keyof CSSProperties]) (out as Record<string, unknown>)[k] = v;
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
