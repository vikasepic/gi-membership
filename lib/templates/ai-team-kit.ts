// The parts the 90-Day AI Team Build modules are made of.
//
// Measured off "90-Day AI Team Build Sales Letter.psd" (Oct 2026), a 1600px
// canvas. Every module is ONE container that paints its own ground edge to
// edge and boxes its content at the width the design drew it, so several
// modules can share a page section (a band set to full width with no air)
// and each still looks like its own section.
//
// Type is the PSD's: headings Inter Bold 55/68, body Poppins 18/34. A block's
// size and line height only hold on desktop (lib/block-style.ts); below that
// the site's own scale would take over, so every text block here states its
// tablet and phone sizes too.

import { at, col, fill, make, rowOf } from "./template";
import { baseStyle, dim, type Block, type BlockStyle, type ColumnStyle } from "@/lib/blocks";

export const AI = {
  navy: "#11325b",
  orange: "#c8653d",
  plum: "#832a63",
  pink: "#ead8e4",
  blush: "#f5ebf3",
  mist: "#f6f6f6",
  fog: "#fafafa",
  ash: "#f4f4f4",
  ink: "#000000",
  text: "#1f1f1f",
  rule: "#b2b2b2",
  white: "#ffffff",
} as const;

/** px / font-size, as the unitless line height a block stores. */
const lh = (size: number, px: number) => Math.round((px / size) * 1000) / 1000;

/** One size at one width: the font size and its line height in px. */
export type Size = readonly [size: number, line: number];
/** Desktop, tablet, phone. */
export type Scale = readonly [Size, Size, Size];

export const TYPE = {
  h2: [[55, 68], [42, 52], [32, 40]],
  h1: [[42, 68.3], [36, 50], [30, 40]],
  lead: [[22, 34], [20, 32], [18, 28]],
  body: [[18, 34], [17, 30], [16, 28]],
  small: [[16, 34], [16, 30], [15, 27]],
  label: [[20, 34], [19, 30], [18, 28]],
} as const satisfies Record<string, Scale>;

const typeAt = ([size, line]: Size): Partial<BlockStyle> => ({ size, lineHeight: lh(size, line) });

/** A block's size at each width. Spread into a block that sets `responsive`. */
function sized(scale: Scale, tablet: Partial<BlockStyle> = {}, mobile: Partial<BlockStyle> = {}) {
  return at({
    tablet: { style: { ...typeAt(scale[1]), ...tablet } },
    mobile: { style: { ...typeAt(scale[2]), ...mobile } },
  });
}

export const box = (t: number, r: number, b: number, l: number) => dim(t, r, b, l);

type TextOpts = {
  scale?: Scale;
  color?: string;
  weight?: number;
  font?: "Inter" | "Poppins";
  align?: "left" | "center" | "right";
  /** Space under the block, px, per width. */
  mb?: number | readonly [number, number, number];
  /** The design's measure, px. Unset fills the column. */
  max?: number;
  /** The gap between paragraphs, as lines of this block's own leading. */
  gap?: number;
  /** Extra hand-written CSS; `selector` is the block. */
  css?: string;
  style?: Partial<BlockStyle>;
};

const mbs = (mb: TextOpts["mb"]): readonly [number, number, number] =>
  typeof mb === "number" ? [mb, mb, mb] : (mb ?? [0, 0, 0]);

/**
 * Paragraphs that keep their own spacing. `.rich p` puts 0.75rem between
 * paragraphs; the design puts a whole line, so the gap is restated in em and
 * scales with the size at every width. Breaks marked `class="d"` are the
 * design's own line ends, kept where the measure is the design's (desktop)
 * and dropped where the text reflows.
 */
function textCss(gapEm: number | null, extra = ""): string {
  const rules = [
    gapEm === null ? "" : `selector p{margin:0}selector p:not(:last-child){margin-bottom:${gapEm}em}`,
    "@media (max-width:1399px){selector br.d{display:none}}",
    extra,
  ];
  return rules.filter(Boolean).join("");
}

function textBlock(type: "heading" | "text", props: Record<string, unknown>, o: TextOpts, scale: Scale): Block {
  const [d, t, m] = mbs(o.mb);
  const [size, line] = scale[0];
  const style: Partial<BlockStyle> = {
    fontFamily: o.font ?? (type === "heading" ? "Inter" : "Poppins"),
    weight: o.weight ?? (type === "heading" ? 700 : 400),
    color: o.color ?? AI.ink,
    textAlign: o.align ?? "left",
    ...typeAt(scale[0]),
    margin: box(0, 0, d, 0),
    // Stated either way: a new text block arrives as a centred 680px measure.
    ...(o.max
      ? { width: "custom" as const, maxWidthValue: o.max, maxWidthUnit: "px" as const }
      : { width: "auto" as const, maxWidthValue: null }),
    blockAlign: o.align === "center" ? ("center" as const) : ("left" as const),
    ...o.style,
    // After the spread, so a block's own CSS adds to the paragraph reset
    // rather than replacing it. The store's `:root p{margin-bottom}` would
    // otherwise put 16-20px under the block's last line.
    customCss: textCss(type === "text" ? lh(size, line * (o.gap ?? 1)) : null, `${o.css ?? ""}${o.style?.customCss ?? ""}`),
  };
  // The store's own heading tracking is -0.02em, tighter than the PSD's Inter:
  // a heading that should end at "Inside" pulled the next word up. The
  // design's tracking, measured off its line widths, on a laptop only.
  if (type === "heading" && style.letterSpacing === undefined)
    style.letterSpacing = Math.round(size * (props.tag === "h1" ? -0.003 : -0.009) * 10) / 10;
  return {
    ...make(type, props, style),
    responsive: sized(scale, { margin: box(0, 0, t, 0) }, { margin: box(0, 0, m, 0) }),
  };
}

/** A section heading. `\n` or `<br class="d" />` in the text are the design's line ends. */
export const heading = (text: string, o: TextOpts & { tag?: "h1" | "h2" | "h3" } = {}): Block =>
  textBlock("heading", { text, tag: o.tag ?? "h2" }, o, o.scale ?? TYPE.h2);

/** Copy. `html` is one or more `<p>`. */
export const copy = (html: string, o: TextOpts = {}): Block =>
  textBlock("text", { html }, o, o.scale ?? TYPE.body);

/** Paragraphs from plain strings, each its own `<p>`. */
export const paras = (...lines: string[]) => lines.map((l) => `<p>${l}</p>`).join("");

/** An image at the size the design drew it, never wider than its column. */
export function picture(
  url: string,
  alt: string,
  o: { width?: number; ratio?: string; radius?: number; mb?: number; align?: "left" | "center" | "right"; css?: string } = {},
): Block {
  return make(
    "image",
    { url, alt, ratio: o.ratio ?? "auto", maxWidth: 100 },
    {
      margin: box(0, 0, o.mb ?? 0, 0),
      radius: o.radius ?? 0,
      ...(o.width ? { width: "custom" as const, maxWidthValue: o.width, maxWidthUnit: "px" as const } : {}),
      blockAlign: o.align ?? "left",
      customCss: o.css ?? "",
    },
  );
}

/** A column's look, with its own per-width overrides. */
export const column = (over: Partial<ColumnStyle> = {}) => col(over);

/**
 * A row of columns inside a module — a card, a grid, a split.
 *
 * `widths` are percentages; `gap` is px. Stacks on phones unless told not to.
 */
export function split(
  columns: Block[][],
  o: {
    widths?: number[];
    gap?: number;
    align?: "stretch" | "flex-start" | "center" | "flex-end";
    stack?: "mobile" | "tablet" | "none";
    columns?: ColumnStyle[];
    style?: Partial<BlockStyle>;
    tablet?: { props?: Record<string, unknown>; style?: Partial<BlockStyle> };
    mobile?: { props?: Record<string, unknown>; style?: Partial<BlockStyle> };
  } = {},
): Block {
  const r = rowOf(columns, {
    gap: o.gap ?? 24,
    verticalAlign: o.align ?? "stretch",
    stack: o.stack ?? "mobile",
    ...(o.widths ? { widths: o.widths } : {}),
  });
  return {
    ...r,
    style: baseStyle({ margin: dim(0, 0, 0, 0), ...o.style }),
    columnStyles: o.columns ?? columns.map(() => col()),
    // Only when a width changes something: an empty override is dropped on save.
    ...(o.tablet || o.mobile ? { responsive: at({ tablet: o.tablet ?? {}, mobile: o.mobile ?? {} }) } : {}),
  };
}

/**
 * One design section: its ground edge to edge, its content boxed at `max`.
 *
 * Padding is [top, bottom] per width; the sides are 24px everywhere, which is
 * the gutter a phone needs and nothing at 1600px, where the box is narrower
 * than the window anyway.
 */
export function section(o: {
  bg: string;
  max: number;
  pad: readonly [number, number];
  tablet?: readonly [number, number];
  mobile?: readonly [number, number];
  blocks: Block[];
  css?: string;
  /** Column look (a card is a column with a fill). */
  inner?: ColumnStyle;
  /** Content edge to edge instead of boxed. */
  full?: boolean;
}): Block {
  const [t, b] = o.pad;
  const [tt, tb] = o.tablet ?? [Math.round(t * 0.75), Math.round(b * 0.75)];
  const [mt, mb] = o.mobile ?? [Math.round(t * 0.6), Math.round(b * 0.6)];
  const r = rowOf([o.blocks], {
    gap: 0,
    contentWidth: o.full ? "full" : "boxed",
    contentMaxWidth: o.full ? null : o.max,
  });
  return {
    ...r,
    style: baseStyle({
      margin: dim(0, 0, 0, 0),
      padding: box(t, 24, b, 24),
      background: fill(o.bg),
      customCss: o.css ?? "",
    }),
    columnStyles: [o.inner ?? col()],
    responsive: at({
      tablet: { style: { padding: box(tt, 24, tb, 24) } },
      mobile: { style: { padding: box(mt, 20, mb, 20) } },
    }),
  };
}

/** A filled, rounded column — the cards the design is full of. */
export const card = (o: {
  bg: string;
  radius: number;
  pad: readonly [number, number, number, number];
  tablet?: readonly [number, number, number, number];
  mobile?: readonly [number, number, number, number];
  shadow?: { blur: number; color: string; y?: number };
  border?: { width: number; color: string; sides?: BlockStyle["borderSides"] };
}): ColumnStyle => {
  const [t, r, b, l] = o.pad;
  const tab = o.tablet ?? o.pad;
  const mob = o.mobile ?? [Math.min(t, 32), Math.min(r, 22), Math.min(b, 32), Math.min(l, 22)];
  return col({
    background: fill(o.bg),
    radius: o.radius,
    padding: box(t, r, b, l),
    ...(o.shadow ? { shadowX: 0, shadowY: o.shadow.y ?? 0, shadowBlur: o.shadow.blur, shadowColor: o.shadow.color } : {}),
    ...(o.border ? { borderWidth: o.border.width, borderColor: o.border.color, borderSides: o.border.sides ?? "all" } : {}),
    responsive: at({
      tablet: { style: { padding: box(tab[0], tab[1], tab[2], tab[3]) } },
      mobile: { style: { padding: box(mob[0], mob[1], mob[2], mob[3]) } },
    }),
  });
};

/** A thin rule, as the design draws them between list items. */
export const rule = (color: string = AI.rule, o: { mt?: number; mb?: number; ml?: number; max?: number } = {}): Block =>
  make("divider", { thickness: 1, width: 100 }, {
    color,
    margin: box(o.mt ?? 0, 0, o.mb ?? 0, o.ml ?? 0),
    ...(o.max ? { width: "custom" as const, maxWidthValue: o.max, maxWidthUnit: "px" as const } : {}),
  });

/**
 * The tick in a thin circle the design puts in front of every listed thing.
 * Font Awesome's regular circle-check (CC BY 4.0), which is the mark the
 * designer used; the builder's own check-circle is a filled disc.
 */
export const TICK = {
  v: "0 0 512 512",
  d: "M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z",
};
