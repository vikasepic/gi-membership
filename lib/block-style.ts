import type { CSSProperties } from "react";
import { readableInk, tint } from "@/lib/color";
import type { BandTheme } from "@/lib/page-sections";
import type { Background, Block, BlockStyle, Dim } from "@/lib/blocks";

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
    if (bg.color) css.backgroundColor = bg.color;
    if (bg.image) {
      // Quotes and backslashes are stripped rather than escaped: this value
      // lands inside url('…'), and the only safe answer to a quote here is
      // that there isn't one.
      css.backgroundImage = `url('${bg.image.replace(/['"\\]/g, "")}')`;
      css.backgroundSize = bg.size;
      css.backgroundPosition = bg.position;
      css.backgroundRepeat = bg.repeat;
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

export function blockColors(block: Block, theme: BandTheme): BlockColors {
  const s = block.style;
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
  const s = block.style;
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
export function hiddenClasses(s: BlockStyle): string {
  return [
    s.hideMobile ? "max-md:hidden" : "",
    s.hideTablet ? "max-lg:md:hidden" : "",
    s.hideDesktop ? "lg:hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** A tinted version of the band accent, for soft fills inside a block. */
export function softAccent(theme: BandTheme, alpha = 0.1): string {
  return tint(theme.accent, alpha);
}
