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
  // Added so converting the typed sections is lossless. A facts card, a value
  // stack, a price comparison and an FAQ are shapes the sections already had;
  // without blocks that hold them, moving to the builder would have quietly
  // flattened them into paragraphs.
  "stats",
  "pricing",
  "faq",
  // A grid of titled cards. Decomposing these into heading + text blocks threw
  // away the design — the box, the numbered eyebrow, the columns — and left a
  // sales page reading as a flat column of prose.
  "cards",
  // The price panel. It appears twice on the reference page and it is where
  // the money actually is.
  "pricecard",
  // The storefront's three living parts.
  //
  // They are blocks rather than fixed sections so the home page can decide what
  // it has and in what order — which is the whole point — but they cannot be
  // built out of other blocks: each one reads the catalogue and the viewer's
  // ownership, and the ownership check is what stops the store offering someone
  // a thing they already pay for. That check lives in code and stays there.
  //
  // They render to nothing anywhere the data is not supplied, which is every
  // sales page. See STOREFRONT_TYPES.
  "catalog",
  "memberships",
  "featured",
  // A pointer at a design kept elsewhere, so editing that design changes every
  // page pointing at it. It draws NOTHING itself — the resolve step replaces it
  // with the blocks it names before anything renders.
  //
  // A type rather than a field on every block, and the template brief's rule
  // about not adding block types is met rather than broken: this one is
  // structural, not a design. The alternatives are worse — a reference on the
  // section row makes a whole band global or none of it, and a `globalId` on
  // every block puts a field on thousands of blocks that almost none use.
  "global",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Blocks that draw live store data rather than what someone typed.
 *
 * Offered on the home page and nowhere else: a product's own sales page
 * embedding the whole catalogue is a way out of the page you are selling from,
 * and a memberships list on an upsell competes with the offer being made.
 */
export const STOREFRONT_TYPES: readonly BlockType[] = ["catalog", "memberships", "featured"];

export type Unit = "px" | "em" | "%" | "rem";
export type Dim = { t: number; r: number; b: number; l: number; u: Unit; link: boolean };

export type BackgroundType = "none" | "classic" | "gradient";
export type Background = {
  /**
   * A dark wash over the image, 0–90.
   *
   * Words on a photograph are readable or they are not, and the answer changes
   * with the photograph. Editing the picture to fix it means a second copy of
   * the file that only works on one background.
   */
  overlay: number;
  type: BackgroundType;
  color: string | null;
  image: string;
  size: "cover" | "contain" | "auto";
  /**
   * Where the picture sits, as a CSS background-position.
   *
   * A string rather than three keywords: nine named spots is what people
   * actually reach for, and a face in the top-left corner cannot be described
   * by "top" alone. A percentage pair is allowed too, for the picture that
   * needs to sit somewhere none of the nine names.
   *
   * Validated on the way in, because this lands in a style declaration.
   */
  position: string;
  repeat: "no-repeat" | "repeat";
  from: string | null;
  fromAt: number;
  to: string | null;
  toAt: number;
  shape: "linear" | "radial";
  angle: number;
};

/**
 * How one column sits in the row that holds it — the `col*` keys of `BlockStyle`.
 *
 * Only columns read them; every other block stores them and nothing looks. They
 * live on `BlockStyle` rather than in their own place on the row because a
 * column is edited through `columnAsBlock`, and the whole point of that trick
 * is that the ordinary control machinery — `writeControl`, `styleFor`, the
 * per-device overrides, `STYLE_KEYS` — needs no special case. A key outside
 * `baseStyle()` would be dropped by `normalizeOverride`, so "align this column
 * to the top on mobile only" would silently not save.
 *
 * Nine flat keys rather than one nested object, which is what they were first.
 * An override is sparse PER TOP-LEVEL KEY, so a nested object made all nine one
 * fact: setting align-self on tablet snapshotted the other eight beside it, and
 * the next desktop edit to the width then never reached tablet again. Clearing
 * one of them threw the other eight away with it. They are four unrelated
 * decisions and they have to be four unrelated keys.
 *
 * Every default here is the value that emits no declaration at all: a column
 * nobody has touched has to produce exactly the CSS it produced before any of
 * this existed.
 */
export type ColumnLayout = {
  /** `full` leaves the width the row's own arithmetic gives this column. */
  colWidth: "full" | "custom";
  colWidthValue: number | null;
  colWidthUnit: "px" | "%" | "vw";
  /** Empty means "whatever the row aligns its columns to". */
  colAlignSelf: "" | "flex-start" | "center" | "flex-end" | "stretch";
  /** Empty means "wherever it sits in the row". */
  colOrder: "" | "start" | "end" | "custom";
  colOrderValue: number | null;
  colSize: "none" | "grow" | "shrink" | "custom";
  colGrow: number | null;
  colShrink: number | null;
};

export const emptyColumnLayout = (): ColumnLayout => ({
  colWidth: "full",
  colWidthValue: null,
  colWidthUnit: "px",
  colAlignSelf: "",
  colOrder: "",
  colOrderValue: null,
  colSize: "none",
  colGrow: null,
  colShrink: null,
});

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
  /**
   * How wide the block's box is allowed to be.
   *
   * `auto` fills whatever contains it, `fit` hugs the content, `custom` takes
   * the number and unit below. The old preset scale (narrow/normal/wide/full)
   * is gone: "wide" and "full" both rendered 100%, so there was no step between
   * a reading measure and the whole page — which is exactly the gap people
   * filled with side padding, and side padding is what breaks on a phone.
   */
  width: "auto" | "fit" | "custom";
  /** The number beside the unit. Null until a custom width is set. */
  maxWidthValue: number | null;
  /**
   * `ch` is not offered in the editor and exists only to read blocks saved
   * under the old preset scale, which stored measures in it. Converting those
   * to px on read would be a visible change on every page: `ch` scales with
   * font size, so the same 62ch is a reading measure on a paragraph and no
   * constraint at all on a 40px heading. They stay as they are until someone
   * sets a new width, and then it is theirs to choose.
   */
  maxWidthUnit: "%" | "px" | "ch";
  /** Where the words sit inside the box. */
  textAlign: "left" | "center" | "right";
  /** Where the box sits inside its container. Centre is `margin: 0 auto`. */
  blockAlign: "left" | "center" | "right";
  /**
   * A family name, or empty for the page's own.
   *
   * Empty rather than null-as-Inter on purpose: a block that names its font is
   * a block that keeps that font when the site's default changes, and most
   * blocks should follow the site.
   */
  fontFamily: string;
  size: number | null;
  lineHeight: number | null;
  letterSpacing: number | null;
  weight: number | null;
  transform: "none" | "uppercase" | "lowercase" | "capitalize";
  color: string | null;
  background: Background;
  radius: number;
  /**
   * A line around the box. Zero is no line, which is what everything had.
   *
   * A block could be filled and rounded and never outlined, so an outlined box
   * — a stat in a card, a quiet panel that is a rule rather than a fill — had
   * no answer but Custom CSS. Custom CSS is the wrong material for it: it is
   * invisible to every control, so the panel then disagrees with the page
   * about what the block looks like.
   */
  borderWidth: number;
  /** Null takes the band's own hairline, so an outline follows its section. */
  borderColor: string | null;
  /**
   * Which edges the border is drawn on.
   *
   * "all" is what a border has always been and stays the default, so nothing
   * saved moves. The other values exist because a rule BETWEEN things is the
   * commonest use of a border and a box was the only shape available: the
   * hairlines separating figures in a counter strip, the cross through a
   * two-by-two grid, the coloured edge under a card. Each of those was a box
   * drawn on four sides where one was wanted.
   */
  borderSides: "all" | "top" | "right" | "bottom" | "left" | "x" | "y";
  /**
   * A cast shadow, as four flat numbers rather than one nested value.
   *
   * Flat because the inspector's controls are keyed one to a field: a nested
   * `{x,y,blur,colour}` would need a control kind of its own that nothing else
   * would ever use, and the four keys read the same in the panel.
   *
   * All-zero is no shadow, which is what every block had before this existed —
   * an offset of nothing blurred by nothing is invisible either way, so there
   * is no state this rules out.
   *
   * Blur zero with an offset is the hard-edged shadow — a second card peeking
   * out from behind the first. That shape had no answer but Custom CSS, which
   * is invisible to every control, so the panel then disagreed with the page.
   */
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  /** Null takes the band's ink at low opacity, so a shadow follows its section. */
  shadowColor: string | null;
  /**
   * What sits on top of what, when two things overlap.
   *
   * Null means "wherever paint order puts it", which is what everything did
   * before this existed. It has to be settable because paint order is not
   * something an author can see or reason about — and worse, it does not
   * survive the trip into the editor: the builder wraps every block in its own
   * positioned chrome, and a positioned element paints above a non-positioned
   * one whatever the source order says. So a card lying over a photograph
   * looked right on the page and inverted in the builder, with no control
   * anywhere to say which was meant.
   *
   * A number here also makes the block a positioned element, because z-index
   * on a static box does nothing at all.
   */
  zIndex: number | null;
  cssId: string;
  cssClass: string;
  /** Hand-written CSS for this block. `selector` stands for the block itself. */
  customCss: string;
  hideDesktop: boolean;
  hideTablet: boolean;
  hideMobile: boolean;
  // Plus the nine `col*` keys of ColumnLayout: columns only, read by rowLayout
  // and ignored everywhere else.
} & ColumnLayout;

/**
 * The three widths a page is edited at.
 *
 * They are the widths the page already responds at — tablet is below `lg`
 * (1024px) and mobile below `md` (768px) — so a value set here lands on the
 * same boundary the layout was built around. A fourth breakpoint would be a
 * fourth thing to keep in sync with Tailwind for no gain.
 */
export const DEVICES = ["desktop", "tablet", "mobile"] as const;
export type Device = (typeof DEVICES)[number];

/** Widest viewport each device stands for. Desktop has no ceiling. */
export const DEVICE_MAX: Record<Device, number | null> = {
  desktop: null,
  tablet: 1023,
  mobile: 767,
};

/**
 * What each tab of the device switch governs, in words, off the same numbers.
 *
 * One control appears in two panels — the block inspector and Site settings →
 * Typography — and until this existed each wrote its own copy for it. The site
 * panel said "Desktop only" about a rule it emits with no media query at all,
 * which is the opposite of what it does. The shared reading is "this width and
 * narrower": desktop is the base every narrower width starts from, and a
 * narrower tab overrides it.
 *
 * Derived from DEVICE_MAX so the sentence and the query cannot drift.
 */
export const DEVICE_RANGE: Record<Device, string> = {
  desktop: "every width",
  tablet: `${DEVICE_MAX.tablet}px and narrower`,
  mobile: `${DEVICE_MAX.mobile}px and narrower`,
};

/** How wide the editor canvas renders each device. */
export const DEVICE_CANVAS: Record<Device, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 390,
};

/**
 * What a device changes about a block, relative to the one above it.
 *
 * Both halves, because layout is not all in `style`: how many columns sit side
 * by side, in what order and at what widths lives in `props`, and those are the
 * things that most need to differ on a phone.
 *
 * Sparse is the whole point. A tablet that stored a full copy would go on
 * rendering last week's value after the desktop one changed — an override has
 * to remember only what someone actually set on that device.
 *
 * Mobile layers on tablet, not on desktop, matching the CSS the renderer emits:
 * a narrower screen is also a tablet screen.
 */
export type OverrideScope = "style" | "props";

export type DeviceOverride = {
  style: Partial<BlockStyle>;
  props: Record<string, unknown>;
};

export type ResponsiveStyle = {
  tablet: DeviceOverride;
  mobile: DeviceOverride;
};

export type Block = {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  style: BlockStyle;
  /** Per-device overrides. Absent means the block looks the same everywhere. */
  responsive?: ResponsiveStyle;
  /** Rows only: one array of blocks per column. */
  columns?: Block[][];
  /**
   * Rows only: one style per column, for the columns that have been given one.
   *
   * A column was a bare array with nowhere to put anything, so a column could
   * not have a background, a padding or a corner — the three things people
   * reach for the moment they put two columns side by side. It is a sparse
   * array on purpose: a row nobody has styled stores nothing, and an old row
   * reads back exactly as it did.
   */
  columnStyles?: (ColumnStyle | null)[];
};

/**
 * A column's style, and what it changes about itself on a narrower screen.
 *
 * The overrides ride on the column rather than on the row because there is one
 * per column: a row's own `responsive` is already spoken for by the row's
 * widths, gap and direction, and pushing three columns' worth of overrides into
 * it would need a key per column index anyway. Same shape as `Block.responsive`
 * so `styleFor` reads it without knowing it is a column.
 */
export type ColumnStyle = BlockStyle & { responsive?: ResponsiveStyle };

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
  position: "center center",
  repeat: "no-repeat",
  from: null,
  fromAt: 0,
  to: null,
  toAt: 100,
  shape: "linear",
  angle: 135,
  overlay: 0,
});

export const baseStyle = (over: Partial<BlockStyle> = {}): BlockStyle => ({
  margin: dim(0, 0, 16, 0),
  padding: dim(0, 0, 0, 0),
  width: "auto",
  maxWidthValue: null,
  maxWidthUnit: "px",
  textAlign: "left",
  blockAlign: "left",
  fontFamily: "",
  size: null,
  lineHeight: null,
  letterSpacing: null,
  weight: null,
  transform: "none",
  color: null,
  background: emptyBackground(),
  radius: 0,
  borderWidth: 0,
  borderColor: null,
  borderSides: "all",
  shadowX: 0,
  shadowY: 0,
  shadowBlur: 0,
  shadowColor: null,
  zIndex: null,
  cssId: "",
  cssClass: "",
  customCss: "",
  hideDesktop: false,
  hideTablet: false,
  hideMobile: false,
  ...emptyColumnLayout(),
  ...over,
});

/** A preset named as fractions, as the percentages a row is actually built from. */
export function widthsOf(structure: RowStructure): number[] {
  const parts = ROW_STRUCTURES[structure];
  const total = parts.reduce((a, b) => a + b, 0);
  return toHundred(parts.map((w) => (w / total) * 100));
}

/** The columns each row structure produces. */
export const ROW_STRUCTURES = {
  "1": [1],
  "1-1": [1, 1],
  "1-1-1": [1, 1, 1],
  "1-1-1-1": [1, 1, 1, 1],
  "3-2": [3, 2],
  "2-1": [2, 1],
  "1-2": [1, 2],
} as const;
export type RowStructure = keyof typeof ROW_STRUCTURES;

const DEFAULT_PROPS: Record<BlockType, Record<string, unknown>> = {
  heading: { text: "Your heading", tag: "h2" },
  text: { html: "<p>Write something here.</p>" },
  image: { url: "", alt: "", caption: "", link: "", ratio: "16/9", maxWidth: 100 },
  video: { source: "youtube", url: "", poster: "", controls: true, mute: true, autoplay: false, loop: false, ratio: "16/9" },
  // `action: "buy"` hands the label to the page's own buy control — a link on
  // the offer's sales page, a one-click accept after checkout. The label stays
  // editable; the money path never is.
  button: { text: "Get instant access", link: "", fullWidth: false, variant: "solid", action: "link" },
  iconlist: { items: [], layout: "stacked", iconSize: 16, gap: 8, iconColor: null },
  slides: { items: [], skin: "card", perView: 1, arrows: true, dots: true },
  spacer: { height: 40 },
  divider: { thickness: 1, width: 100 },
  html: { code: "" },
  // No `widths` here on purpose: a default array would be present on every row
  // read out of the database and would outrank the `structure` those rows were
  // actually saved with, flattening every 3-2 into a 50/50. Widths are derived
  // by columnWidths until someone sets them. `stack` is what makes columns fall
  // into one on a phone by default, which is what almost every row wants.
  //
  // Everything from `direction` down is the container's own flex settings, and
  // every one of them starts at the value that emits what a row emitted before
  // they existed: the container was already `display:flex; flex-wrap:wrap` with
  // no justify, no min height and no overflow, so `row` / `wrap` / `flex-start`
  // / null / "visible" / "full" are not preferences, they are "as it was". A
  // number or a corner here instead would repaint every row ever saved the
  // moment this line shipped, because normalize spreads these over stored props.
  //
  // `containerType` decides which half of the list below is read at all, and it
  // starts at "flex" for the same reason: a stored row has to keep being the
  // flex container it has always been, so every grid key beneath it is dead
  // weight until somebody presses Grid.
  row: {
    verticalAlign: "stretch",
    gap: 24,
    stack: "mobile",
    direction: "row",
    justify: "flex-start",
    wrap: "wrap",
    alignContent: "",
    minHeight: null,
    minHeightUnit: "px",
    overflow: "visible",
    contentWidth: "full",
    // Null, so a row that has always been boxed at the page measure keeps
    // being boxed at the page measure. A number here would renarrow every
    // stored row the moment this shipped.
    contentMaxWidth: null,
    contentMaxWidthUnit: "px",
    containerType: "flex",
    gridColumns: "",
    gridRows: "",
    columnGap: null,
    rowGap: null,
    autoFlow: "row",
    justifyItems: "",
  },
  stats: { items: [], layout: "strip" },
  pricing: { items: [], highlightLast: true, totalLabel: "", totalAmount: "" },
  faq: { items: [], layout: "accordion" },
  // Everything after `note` is presentation with no value of its own: null
  // means "whatever the card already looked like". A number here instead of
  // null would repaint every card ever saved the moment this line shipped,
  // because normalize spreads these defaults over every stored block.
  catalog: { title: "", limit: 0, columns: 3, showPrice: true },
  memberships: { title: "", showOwned: true },
  featured: { title: "", note: "" },
  cards: {
    items: [],
    columns: 3,
    numbered: false,
    skin: "boxed",
    numberStyle: "eyebrow",
    title: "",
    // The caption above a grid of cards — a strip of logos and what it is.
    // Separate from `title`, which only the list skin has ever drawn.
    caption: "",
    note: "",
    media: "icon",
    iconShape: "rounded",
    iconPlace: "above",
    iconBox: null,
    iconSize: null,
    iconBg: null,
    iconColor: null,
    cardPadding: null,
    cardGap: null,
    cardTextGap: null,
    cardRadius: null,
    // False, not null: a rule between cards is either there or it is not, and
    // there is no skin whose corner it could be following instead.
    divider: false,
  },
  pricecard: {
    eyebrow: "",
    // Blank means "use the real price from the offer". A typed price is a
    // claim; the offer's price is a fact.
    price: "",
    period: "",
    altPrice: "",
    altPeriod: "",
    badge: "",
    ctaLabel: "",
    action: "buy",
    note: "",
    secureNote: "",
  },
  // The id of the design this stands in for, and nothing else. A pointer has
  // no typography and no spacing of its own — whatever it points at brings
  // those with it.
  global: { globalId: "" },
};

/** A stable id. Prefixed so a malformed id in stored JSON is obvious. */
function newId(): string {
  const g = globalThis.crypto;
  return `b_${g && "randomUUID" in g ? g.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A new block of running text starts at a readable measure, centred.
 *
 * Not a preference — a paragraph set the full width of a section is the thing
 * people were reaching for side padding to fix, and side padding is inherited
 * by the phone and cannot shrink. Everything else fills its column, because a
 * picture or a button has no measure to keep.
 *
 * 680px rather than a `ch` value: the unit picker offers % and px, and a
 * default nobody can see the unit of is a default nobody can adjust.
 */
const TEXT_MEASURE: Partial<Record<BlockType, Partial<BlockStyle>>> = {
  text: { width: "custom", maxWidthValue: 680, maxWidthUnit: "px", blockAlign: "center" },
};

/**
 * What a block holds the moment it is dropped, so the design is visible before
 * a word is typed.
 *
 * Separate from DEFAULT_PROPS, and that separation is the whole point:
 * normalizeBlock spreads DEFAULT_PROPS over every block it READS, so a line of
 * placeholder prose there would appear on a live sales page anywhere the key
 * happened to be absent. This map is applied by newBlock alone — at creation,
 * never on read — so nothing already stored can grow copy nobody wrote.
 *
 * Every line is unmistakably a placeholder. This store's rule is that it never
 * fabricates a trust signal, and starter content is where that rule is easiest
 * to break by accident: a plausible testimonial with a plausible name, or a
 * round number beside "customers", is a claim the moment someone forgets to
 * replace it. So a quote reads as an instruction, a figure is "00", and an
 * amount is a dash. Someone who ships one of these ships something obviously
 * unfinished rather than something quietly false.
 *
 * Prices are the exception that stays empty: a price card reads the real price
 * from the offer, and a typed figure would override a fact with a guess.
 */
const STARTER_PROPS: Partial<Record<BlockType, Record<string, unknown>>> = {
  cards: {
    items: [
      { title: "The first thing", body: "One sentence about what this is and why it matters.", icon: "", image: "" },
      { title: "The second thing", body: "One sentence about what this is and why it matters.", icon: "", image: "" },
      { title: "The third thing", body: "One sentence about what this is and why it matters.", icon: "", image: "" },
    ],
  },
  faq: {
    items: [
      { q: "A question someone asks before buying", a: "The answer, in plain words. Short is better than complete." },
      { q: "The objection you hear most", a: "Name it honestly. A question dodged here is a sale lost later." },
    ],
  },
  iconlist: {
    items: [
      { text: "Something they get" },
      { text: "Something else they get" },
      { text: "The one that matters most" },
    ],
  },
  stats: {
    // "00" rather than a number that could survive to a live page. A figure is
    // the single easiest placeholder to leave in, and the hardest to spot.
    items: [
      { value: "00", label: "What this number counts", detail: "" },
      { value: "00", label: "What this number counts", detail: "" },
    ],
  },
  pricing: {
    // A dash, not an amount. An amount here is a price claim, and this store
    // refuses a page that states a figure the checkout will not charge.
    items: [
      { label: "What is included", amount: "—" },
      { label: "The next thing included", amount: "—" },
    ],
  },
  slides: {
    // Reads as an instruction, not as a customer. A placeholder testimonial
    // with a plausible name is a fabricated trust signal the moment it ships.
    items: [
      {
        quote: "What a buyer said, in their own words. Replace this with something real or delete the block.",
        name: "Their name",
        role: "What they do",
      },
    ],
  },
};

export function newBlock(type: BlockType, over: Partial<Block> = {}): Block {
  const block: Block = {
    id: newId(),
    type,
    props: { ...DEFAULT_PROPS[type], ...(STARTER_PROPS[type] ?? {}) },
    style: baseStyle(TEXT_MEASURE[type] ?? {}),
    ...over,
  };
  if (type === "row" && !block.columns) {
    const widths = block.props.widths;
    const count = Array.isArray(widths) && widths.length > 0 ? widths.length : 2;
    block.columns = Array.from({ length: count }, () => []);
    if (!Array.isArray(widths)) block.props = { ...block.props, widths: evenWidths(count) };
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

export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
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

/** The nine named spots, in reading order. */
export const BG_POSITIONS = [
  "left top",
  "center top",
  "right top",
  "left center",
  "center center",
  "right center",
  "left bottom",
  "center bottom",
  "right bottom",
] as const;

/** "42% 80%" — a spot none of the nine names. */
const CUSTOM_POSITION = /^(\d{1,3})% (\d{1,3})%$/;

/**
 * A background-position we are willing to put in a style attribute.
 *
 * Anything unrecognised falls back rather than being escaped: this is a value
 * with a small, knowable set of legal forms, so accepting only those is simpler
 * and safer than trying to make an arbitrary string safe.
 */
export function normalizePosition(v: unknown, fallback = "center center"): string {
  const value = String(v ?? "").trim();
  if ((BG_POSITIONS as readonly string[]).includes(value)) return value;
  // What the three old keywords meant, so pages saved before this keep looking
  // the way they did.
  if (value === "center") return "center center";
  if (value === "top") return "center top";
  if (value === "bottom") return "center bottom";
  const custom = CUSTOM_POSITION.exec(value);
  if (custom && Number(custom[1]) <= 100 && Number(custom[2]) <= 100) return value;
  return fallback;
}

export function normalizeBackground(v: unknown): Background {
  const d = emptyBackground();
  if (!isRecord(v)) return d;
  return {
    type: oneOf(v.type, ["none", "classic", "gradient"] as const, d.type),
    color: colorOrNull(v.color),
    image: str(v.image),
    size: oneOf(v.size, ["cover", "contain", "auto"] as const, d.size),
    position: normalizePosition(v.position, d.position),
    repeat: oneOf(v.repeat, ["no-repeat", "repeat"] as const, d.repeat),
    from: colorOrNull(v.from),
    fromAt: num(v.fromAt, d.fromAt),
    to: colorOrNull(v.to),
    toAt: num(v.toAt, d.toAt),
    shape: oneOf(v.shape, ["linear", "radial"] as const, d.shape),
    angle: num(v.angle, d.angle),
    // Clamped rather than trusted: 100 would black the picture out entirely,
    // which is a way to lose an image without noticing you have.
    overlay: Math.max(0, Math.min(90, num(v.overlay, 0))),
  };
}

/**
 * Width, from either the current fields or the preset scale they replaced.
 *
 * The presets were only ever numbers: narrow and normal were measures in `ch`,
 * and wide and full were both 100% — identical output from two different words.
 * Each maps to what it already rendered, so no stored page changes.
 */
function legacyWidth(
  v: Record<string, unknown>,
  d: BlockStyle,
): Pick<BlockStyle, "width" | "maxWidthValue" | "maxWidthUnit"> {
  const PRESETS: Record<string, Pick<BlockStyle, "width" | "maxWidthValue" | "maxWidthUnit">> = {
    fit: { width: "fit", maxWidthValue: null, maxWidthUnit: "px" },
    narrow: { width: "custom", maxWidthValue: 38, maxWidthUnit: "ch" },
    normal: { width: "custom", maxWidthValue: 62, maxWidthUnit: "ch" },
    wide: { width: "auto", maxWidthValue: null, maxWidthUnit: "px" },
    full: { width: "auto", maxWidthValue: null, maxWidthUnit: "px" },
  };
  if (typeof v.width === "string" && v.width in PRESETS) return PRESETS[v.width];

  const width = oneOf(v.width, ["auto", "fit", "custom"] as const, d.width);
  const raw = v.maxWidthValue;
  const value = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
  return {
    width,
    // A custom width with no number is just auto — better than a max-width of
    // zero, which would collapse the block to nothing.
    maxWidthValue: width === "custom" ? value : null,
    maxWidthUnit: oneOf(v.maxWidthUnit, ["%", "px", "ch"] as const, d.maxWidthUnit),
  };
}

/**
 * A column's layout, from whatever is in the database.
 *
 * Numbers stay null rather than falling back to a default, because null is what
 * "nobody set this" means downstream and a zero here is a real answer: `grow: 0`
 * and `order: 0` both mean something a column may have been given on purpose.
 */
function normalizeColumnLayout(v: Record<string, unknown>): ColumnLayout {
  const d = emptyColumnLayout();
  const n = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    colWidth: oneOf(v.colWidth, ["full", "custom"] as const, d.colWidth),
    colWidthValue: n(v.colWidthValue),
    colWidthUnit: oneOf(v.colWidthUnit, ["px", "%", "vw"] as const, d.colWidthUnit),
    colAlignSelf: oneOf(v.colAlignSelf, ["", "flex-start", "center", "flex-end", "stretch"] as const, d.colAlignSelf),
    colOrder: oneOf(v.colOrder, ["", "start", "end", "custom"] as const, d.colOrder),
    colOrderValue: n(v.colOrderValue),
    colSize: oneOf(v.colSize, ["none", "grow", "shrink", "custom"] as const, d.colSize),
    colGrow: n(v.colGrow),
    colShrink: n(v.colShrink),
  };
}

function normalizeStyle(v: unknown): BlockStyle {
  const d = baseStyle();
  if (!isRecord(v)) return d;
  const nullableNum = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    margin: normalizeDim(v.margin, d.margin),
    padding: normalizeDim(v.padding, d.padding),
    ...legacyWidth(v, d),
    // One control used to set both, so an old block carries the same value into
    // each and renders exactly as it did.
    textAlign: oneOf(v.textAlign ?? v.align, ["left", "center", "right"] as const, d.textAlign),
    blockAlign: oneOf(v.blockAlign ?? v.align, ["left", "center", "right"] as const, d.blockAlign),
    // Sanitised here as well as at render: it is written into a style attribute.
    fontFamily: str(v.fontFamily).replace(/[^A-Za-z0-9 \-]/g, "").trim().slice(0, 60),
    size: nullableNum(v.size),
    lineHeight: nullableNum(v.lineHeight),
    letterSpacing: nullableNum(v.letterSpacing),
    weight: nullableNum(v.weight),
    transform: oneOf(v.transform, ["none", "uppercase", "lowercase", "capitalize"] as const, d.transform),
    color: colorOrNull(v.color),
    background: normalizeBackground(v.background),
    radius: num(v.radius, d.radius),
    // Clamped: this lands in a style attribute, and a 400px border is not a
    // border, it is a block nobody can see past.
    borderWidth: Math.max(0, Math.min(24, num(v.borderWidth, d.borderWidth))),
    borderColor: colorOrNull(v.borderColor),
    borderSides: oneOf(
      v.borderSides,
      ["all", "top", "right", "bottom", "left", "x", "y"] as const,
      d.borderSides,
    ),
    // Offsets may go either way — a shadow up and to the left is what an
    // overlapping card casts — so these clamp symmetrically. Blur cannot.
    shadowX: Math.max(-64, Math.min(64, num(v.shadowX, d.shadowX))),
    shadowY: Math.max(-64, Math.min(64, num(v.shadowY, d.shadowY))),
    shadowBlur: Math.max(0, Math.min(128, num(v.shadowBlur, d.shadowBlur))),
    shadowColor: colorOrNull(v.shadowColor),
    // Null stays null: "nobody set this" and "sit at 0" are different answers,
    // and 0 is a real one — it is how you put something back UNDER a sibling
    // that has been given a positive one.
    zIndex: typeof v.zIndex === "number" && Number.isFinite(v.zIndex) ? v.zIndex : null,
    cssId: str(v.cssId).trim(),
    cssClass: str(v.cssClass).trim(),
    customCss: str(v.customCss),
    hideDesktop: v.hideDesktop === true,
    hideTablet: v.hideTablet === true,
    hideMobile: v.hideMobile === true,
    ...normalizeColumnLayout(v),
  };
}

/** Every key of a style, so a sparse override can be checked against them. */
export const STYLE_KEYS = Object.keys(baseStyle()) as (keyof BlockStyle)[];

/**
 * A device override: only the keys someone actually set, each validated.
 *
 * The style half runs the full-style normalizer over `{...desktop, ...patch}`
 * and keeps only the keys the patch mentioned. Validation lives in one place —
 * a second, looser normalizer for overrides is how a value that desktop would
 * have rejected gets in through the tablet door.
 */
function normalizeOverride(v: unknown, desktop: BlockStyle): DeviceOverride {
  const empty: DeviceOverride = { style: {}, props: {} };
  if (!isRecord(v)) return empty;

  // Written before overrides could carry props: the whole object was the style
  // patch. Read on, because reading is where old rows are brought forward.
  const legacy = !("style" in v) && !("props" in v);
  const rawStyle = legacy ? v : v.style;
  const rawProps = legacy ? undefined : v.props;

  const style: Partial<BlockStyle> = {};
  if (isRecord(rawStyle)) {
    const keys = STYLE_KEYS.filter((k) => k in rawStyle);
    if (keys.length > 0) {
      const full = normalizeStyle({ ...desktop, ...rawStyle });
      for (const k of keys) (style as Record<string, unknown>)[k] = full[k];
    }
  }
  // Props are per block type, so they are validated where they are read — the
  // same deal desktop props already have. What is enforced here is the shape.
  const props: Record<string, unknown> = isRecord(rawProps) ? { ...rawProps } : {};
  return { style, props };
}

const isBare = (o: DeviceOverride) =>
  Object.keys(o.style).length === 0 && Object.keys(o.props).length === 0;

function normalizeResponsive(v: unknown, desktop: BlockStyle): ResponsiveStyle | undefined {
  if (!isRecord(v)) return undefined;
  const tablet = normalizeOverride(v.tablet, desktop);
  const mobile = normalizeOverride(v.mobile, desktop);
  // No override is stored as no key at all, so a block that was never touched
  // on tablet does not carry an empty object into the database forever.
  if (isBare(tablet) && isBare(mobile)) return undefined;
  return { tablet, mobile };
}

/** The style a block has at a given width, after the overrides are layered. */
export function styleFor(block: Block, device: Device): BlockStyle {
  const r = block.responsive;
  if (!r || device === "desktop") return block.style;
  const tablet = { ...block.style, ...r.tablet.style };
  return device === "tablet" ? tablet : { ...tablet, ...r.mobile.style };
}

/**
 * The six keys a width no longer inherits from the width above it.
 *
 * They are exactly the ones lib/site-typography now answers for. A block that
 * says nothing about its size on a phone used to be handed the desktop size,
 * which meant the site's own mobile heading size could never reach any block
 * whose desktop size had been touched once — the setting would look broken on
 * the pages it matters most on.
 *
 * Everything else on BlockStyle keeps inheriting, because there is no global
 * for it to fall to. A padding that stopped inheriting would fall to zero, not
 * to a site default, and every block with side padding would lose it on tablet.
 *
 * `color` is deliberately NOT here, though site typography has a colour field.
 * A sales band paints `color` inline on its own `<section>`, so `:root body`
 * never reaches inside one: a colour withdrawn at 1023px and narrower would
 * fall to the band's ink rather than to anything the owner chose, and a red
 * heading set on a laptop would go black on a phone with nobody having asked.
 *
 * The break lives in the CSS emission, not in `styleFor`: the panels, the
 * padding notice and the editor canvas all ask "what does this block look like
 * on a phone", and the honest answer to that is still the layered one.
 */
export const SITE_DEFAULTED_KEYS = [
  "fontFamily",
  "size",
  "lineHeight",
  "letterSpacing",
  "weight",
  "transform",
] as const satisfies readonly (keyof BlockStyle)[];

const ownSeven = (patch: Partial<BlockStyle>): Partial<BlockStyle> => {
  const out: Partial<BlockStyle> = {};
  for (const k of SITE_DEFAULTED_KEYS) if (k in patch) (out as Record<string, unknown>)[k] = patch[k];
  return out;
};

/**
 * The site-defaulted values this exact width sets, rather than the ones it
 * would inherit.
 *
 * Mobile still layers on tablet — a phone is also a narrow screen, and the
 * tablet media query matches it anyway — but neither layers on desktop.
 */
export function ownTypography(block: Block, device: Device): Partial<BlockStyle> {
  // The desktop style is total, so every key is its own.
  if (device === "desktop") return ownSeven(block.style);
  const r = block.responsive;
  if (!r) return {};
  const tablet = ownSeven(r.tablet.style);
  return device === "tablet" ? tablet : { ...tablet, ...ownSeven(r.mobile.style) };
}

/**
 * The style this width actually renders — the one a panel may show a person.
 *
 * `styleFor` layers every key, including the six that stopped being inherited,
 * because the frame emitter, the hide flags and the padding cap all still want
 * the layered answer. The inspector wants a different one: it sits beside a
 * canvas drawn from `ownTypography`, and for those six keys the two disagree.
 *
 * A heading given 48px on a laptop and nothing on a phone renders the SITE's
 * mobile heading size — that is the whole point of the break — but the Size
 * field on the Mobile tab was reading `styleFor` and saying 48. Nothing was
 * wrong with the page; the panel was the only thing lying about it, and the
 * lie is invisible on any block migration 0042 touched, so it only shows up on
 * work done since and accumulates.
 *
 * Unset is `baseStyle`'s value for the key, which is exactly what the emitter
 * fills in — `typographyAt` builds its declarations from `baseStyle(own)` —
 * so a blank field here means the same thing a missing declaration does there.
 */
export function renderedStyle(block: Block, device: Device): BlockStyle {
  if (device === "desktop") return block.style;
  const own = ownTypography(block, device);
  const unset = baseStyle();
  const out = { ...styleFor(block, device) } as Record<string, unknown>;
  for (const k of SITE_DEFAULTED_KEYS) out[k] = k in own ? own[k] : unset[k];
  return out as BlockStyle;
}

/** The props a block has at a given width. */
export function propsFor(block: Block, device: Device): Record<string, unknown> {
  const r = block.responsive;
  if (!r || device === "desktop") return block.props;
  const tablet = { ...block.props, ...r.tablet.props };
  return device === "tablet" ? tablet : { ...tablet, ...r.mobile.props };
}

/** Whether this exact device sets this key itself, rather than inheriting it. */
export function hasOverride(
  block: Block,
  device: Device,
  key: string,
  scope: OverrideScope = "style",
): boolean {
  if (device === "desktop") return false;
  return !!block.responsive && key in block.responsive[device][scope];
}

const emptyOverride = (): DeviceOverride => ({ style: {}, props: {} });
const emptyResponsive = (): ResponsiveStyle => ({ tablet: emptyOverride(), mobile: emptyOverride() });

/** Write one or more values at one device, leaving the other widths alone. */
export function setAt(
  block: Block,
  device: Device,
  scope: OverrideScope,
  patch: Record<string, unknown>,
): Block {
  if (device === "desktop") {
    return scope === "style"
      ? { ...block, style: { ...block.style, ...patch } as BlockStyle }
      : { ...block, props: { ...block.props, ...patch } };
  }
  const r = block.responsive ?? emptyResponsive();
  return {
    ...block,
    responsive: { ...r, [device]: { ...r[device], [scope]: { ...r[device][scope], ...patch } } },
  };
}

export const setStyleAt = (block: Block, device: Device, patch: Partial<BlockStyle>): Block =>
  setAt(block, device, "style", patch);

export const setPropsAt = (block: Block, device: Device, patch: Record<string, unknown>): Block =>
  setAt(block, device, "props", patch);

/**
 * Drop an override so the value falls back to the wider device again.
 *
 * The reason this exists as its own operation: setting tablet back to the
 * desktop value LOOKS the same and is not — it pins the value, so the next
 * desktop edit silently stops reaching tablet.
 */
export function clearAt(
  block: Block,
  device: Device,
  key: string,
  scope: OverrideScope = "style",
): Block {
  if (device === "desktop" || !block.responsive) return block;
  const scoped: Record<string, unknown> = { ...block.responsive[device][scope] };
  delete scoped[key];
  const responsive = {
    ...block.responsive,
    [device]: { ...block.responsive[device], [scope]: scoped },
  };
  const out = { ...block };
  if (isBare(responsive.tablet) && isBare(responsive.mobile)) delete out.responsive;
  else out.responsive = responsive;
  return out;
}

export const clearStyleAt = (block: Block, device: Device, key: keyof BlockStyle): Block =>
  clearAt(block, device, key, "style");

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** As many columns as a sales page has any business holding. */
export const MAX_COLUMNS = 6;

/** Percentages that add up to exactly 100, to two places. */
function toHundred(parts: number[]): number[] {
  if (parts.length === 0) return [];
  const out = parts.map((p) => Math.max(1, Math.round(p * 100) / 100));
  const drift = 100 - out.reduce((a, b) => a + b, 0);
  // Rounding drift goes on the widest column, where a hundredth of a percent
  // is least visible. Left uncorrected it accumulates and the last column wraps.
  let widest = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[widest]) widest = i;
  out[widest] = Math.round((out[widest] + drift) * 100) / 100;
  return out;
}

export const evenWidths = (count: number): number[] =>
  toHundred(Array.from({ length: count }, () => 100 / count));

/**
 * How wide each column is, as a percentage.
 *
 * Derived rather than stored until someone edits it: `structure` is what every
 * existing row has, and the converter builds rows by naming a structure. A
 * widths array written eagerly at construction would be overwritten by the
 * props spread that follows and describe the wrong shape.
 */
export function columnWidths(props: Record<string, unknown>, count: number): number[] {
  if (count <= 0) return [];
  const raw = props.widths;
  if (Array.isArray(raw) && raw.length === count && raw.every((n) => typeof n === "number" && n > 0)) {
    return toHundred(raw as number[]);
  }
  const key = String(props.structure ?? "");
  const preset = key in ROW_STRUCTURES ? ROW_STRUCTURES[key as RowStructure] : null;
  const base = preset && preset.length === count ? [...preset] : Array.from({ length: count }, () => 1);
  const total = base.reduce((a, b) => a + b, 0);
  return toHundred(base.map((w) => (w / total) * 100));
}

/**
 * One column resized, with the rest absorbing the difference.
 *
 * Proportionally, so a 60/20/20 row asked for 40 in the first column becomes
 * 40/30/30 rather than 40/20/20 with a gap on the end. Widths that do not add
 * up to 100 are not a thing the renderer can draw.
 */
/**
 * The style of one column, as a block the ordinary control machinery can read.
 *
 * A synthetic block rather than a second set of readers and writers: every
 * control already knows how to read and write `.style`, and teaching them about
 * columns as well is how the two drift apart.
 */
export function columnAsBlock(row: Block, index: number): Block {
  const stored = row.columnStyles?.[index];
  // Split rather than passed whole: the overrides are stored inside the column's
  // style object, and leaving them there as well would put a `responsive` key
  // inside every style patch `writeControl` writes back.
  const { responsive, ...style } = (stored ?? baseStyle()) as ColumnStyle;
  return {
    id: `${row.id}#${index}`,
    type: "row",
    props: {},
    style,
    ...(responsive ? { responsive } : {}),
  };
}

/**
 * Write a column's style back onto its row.
 *
 * `responsive` is rejoined here and omitted when there is none, because a
 * column that was never touched on a phone must store no key for it — the same
 * sparseness rule blocks obey, and the reason an untouched row stores nothing.
 */
export function setColumnStyle(
  row: Block,
  index: number,
  style: BlockStyle,
  responsive?: ResponsiveStyle,
): Block {
  const count = row.columns?.length ?? 0;
  const next = Array.from({ length: count }, (_, i) =>
    i === index ? { ...style, ...(responsive ? { responsive } : {}) } : (row.columnStyles?.[i] ?? null),
  );
  return { ...row, columnStyles: next };
}

/** "rowId#2" — the id a selected column carries. */
export function splitColumnId(id: string): { rowId: string; index: number } | null {
  const at = id.lastIndexOf("#");
  if (at < 0) return null;
  const index = Number(id.slice(at + 1));
  return Number.isInteger(index) && index >= 0 ? { rowId: id.slice(0, at), index } : null;
}

export function setColumnWidth(widths: number[], index: number, value: number): number[] {
  const n = widths.length;
  if (n <= 1) return [100];
  if (index < 0 || index >= n) return toHundred(widths);
  const w = Math.max(5, Math.min(95, value));
  const rest = 100 - w;
  const others = widths.filter((_, j) => j !== index);
  const sum = others.reduce((a, b) => a + b, 0);
  const scaled = others.map((o) => (sum > 0 ? (o / sum) * rest : rest / others.length));
  let k = 0;
  return toHundred(widths.map((_, j) => (j === index ? w : scaled[k++])));
}

/**
 * A row with a different number of columns.
 *
 * Content is never dropped: everything in the columns being removed moves into
 * the last one that survives. Losing a paragraph because a select went from
 * three to two is not a thing an editor may do.
 *
 * Widths reset to even, and any per-device widths are cleared with them — an
 * override written for three columns describes a shape that no longer exists.
 * A dropped column's `columnStyles` entry goes for the same reason: three to
 * two and back to three used to hand the new empty column the deleted one's
 * background, padding and order. `normalizeBlocks` trims the array to the
 * count on reload, so keeping it also made the panel and a refresh disagree
 * about the same row.
 */
export function setColumnCount(block: Block, count: number): Block {
  if (block.type !== "row") return block;
  const want = Math.max(1, Math.min(MAX_COLUMNS, Math.round(count)));
  const cols = block.columns ?? [];
  if (want === cols.length) return block;

  const columns: Block[][] =
    want > cols.length
      ? [...cols.map((c) => [...c]), ...Array.from({ length: want - cols.length }, () => [] as Block[])]
      : cols.slice(0, want).map((c) => [...c]);
  if (want < cols.length) {
    columns[want - 1] = [...columns[want - 1], ...cols.slice(want).flat()];
  }

  let out: Block = {
    ...block,
    columns,
    ...(block.columnStyles ? { columnStyles: block.columnStyles.slice(0, want) } : {}),
    props: { ...block.props, widths: evenWidths(want) },
  };
  for (const device of ["tablet", "mobile"] as const) out = clearAt(out, device, "widths", "props");
  return out;
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
 * `reverse` was a boolean of its own before Direction existed.
 *
 * Folded into `direction` on read rather than left beside it: two keys
 * describing one fact is how a row ends up drawn one way and edited as
 * another — the same reason `structure` is deleted once `widths` exist.
 *
 * `stored` is what was actually in the database, not the props with the
 * defaults already spread over them: `direction` now has a default, so asking
 * the merged object whether it was set would answer yes for every row ever
 * saved and the migration would never fire. A stored `reverse: false` is
 * carried across too, because on a device override it means "not reversed
 * here" and dropping it would let the desktop's reversal reach the phone.
 */
function foldReverse(props: Record<string, unknown>, stored: Record<string, unknown>): void {
  if (stored.direction === undefined && typeof stored.reverse === "boolean") {
    props.direction = stored.reverse ? "row-reverse" : "row";
  }
  delete props.reverse;
}

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
    const responsive = normalizeResponsive(raw.responsive, block.style);
    if (responsive) block.responsive = responsive;
    if (t === "row") {
      // The stored columns decide how many there are. `structure` only names a
      // preset — once someone picks a count or drags a width it no longer
      // describes the row, and reading the count from it would truncate the
      // columns it does not know about, taking their content with them.
      const stored = Array.isArray(raw.columns) ? raw.columns : [];
      const widths = block.props.widths;
      const preset = ROW_STRUCTURES[
        oneOf(block.props.structure, Object.keys(ROW_STRUCTURES) as RowStructure[], "1-1")
      ].length;
      const want = Math.max(
        1,
        Math.min(
          MAX_COLUMNS,
          Array.isArray(widths) && widths.length > 0 ? widths.length : Math.max(stored.length, preset),
        ),
      );
      block.columns = Array.from({ length: want }, (_, i) => normalizeBlocks(stored[i], depth + 1));
      // Only kept where something was actually set: an array of defaults would
      // double the size of every row on every page for nothing.
      const rawStyles = Array.isArray(raw.columnStyles) ? raw.columnStyles : [];
      if (rawStyles.some(isRecord)) {
        block.columnStyles = Array.from({ length: want }, (_, i) => {
          const raw = rawStyles[i];
          if (!isRecord(raw)) return null;
          const style: ColumnStyle = normalizeStyle(raw);
          // Validated the same way a block's are, so an align-self set on mobile
          // survives the trip through jsonb instead of being read back as part
          // of the desktop style.
          const r = normalizeResponsive(raw.responsive, style);
          if (r) style.responsive = r;
          return style;
        });
      }
      // Anything the stored columns hold beyond `want` would otherwise vanish.
      if (stored.length > want) {
        const spill = stored.slice(want).flatMap((c) => normalizeBlocks(c, depth + 1));
        block.columns[want - 1] = [...block.columns[want - 1], ...spill];
      }
      // Widths replace the preset rather than sitting beside it. Two sources for
      // one fact is how a row ends up drawn one way and edited as another —
      // `structure` cannot describe a row someone has since resized.
      block.props.widths = columnWidths(block.props, want);
      delete block.props.structure;
      foldReverse(block.props, isRecord(raw.props) ? raw.props : {});
      // The overrides carry props too, and "reversed on mobile only" was the
      // commonest thing that switch was used for.
      for (const device of ["tablet", "mobile"] as const) {
        const over = block.responsive?.[device].props;
        if (over) foldReverse(over, over);
      }
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

/**
 * A copy with fresh ids, all the way down.
 *
 * Exported because paste needs exactly this: a block copied from another page
 * carries the ids it had there, and two blocks with one id means selecting
 * either selects the first, and deleting either deletes the first.
 */
export function reid(b: Block): Block {
  return {
    ...b,
    id: newId(),
    props: { ...b.props },
    style: { ...b.style, margin: { ...b.style.margin }, padding: { ...b.style.padding }, background: { ...b.style.background } },
    // A copy that shared its overrides would follow the original around: edit
    // the duplicate on mobile and the block you copied it from changes too.
    ...(b.responsive
      ? { responsive: { tablet: { ...b.responsive.tablet }, mobile: { ...b.responsive.mobile } } }
      : {}),
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
    case "stats":
    case "faq":
    case "cards":
      return list(p.items) === 0;
    case "pricing":
      return list(p.items) === 0 && !text(p.totalAmount);
    // Never empty: it renders the real price even with nothing typed into it.
    case "pricecard":
      return false;
    case "row": {
      // A min height is content of a kind. An empty container set to 400px is a
      // gap somebody asked for, and dropping it is the setting silently failing
      // on the one row it was most likely set on.
      //
      // Every width, not `block.props`: min height is per device, so a spacer
      // set only on mobile lives in an override — and reading desktop alone
      // threw the block away before the media query it emits could ever fire.
      const tall = DEVICES.some((d) => {
        const h = propsFor(block, d).minHeight;
        return typeof h === "number" && h > 0;
      });
      if (tall) return false;
      return (block.columns ?? []).every((col) => col.every(blockRendersNothing));
    }
    case "spacer":
    case "divider":
      return false;
    // Their content is the catalogue, which this function cannot see. Deciding
    // here would drop a Catalogue block from the editor for a store that
    // happens to have no products yet — and it would stay dropped after the
    // first one was published. The renderer draws nothing when there is
    // nothing, which is the same answer at the only moment it can be right.
    case "catalog":
    case "memberships":
    case "featured":
      return false;
    // A pointer draws nothing. That looks wrong until you follow the order:
    // the resolve step replaces a placeholder with the blocks it names BEFORE
    // anything renders, so a live page never asks this about a working link.
    // What is left to ask about is an unexpanded one — no map, or a design
    // that has been deleted — and a pointer to nothing is nothing, which is
    // how a broken link leaves no gap on the page.
    case "global":
      return true;
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
 *
 * A selected COLUMN is not a block, so `findBlock` cannot see it. Without the
 * second lookup the click fell through to the end of the section: the single
 * most likely action after selecting an empty column put the block anywhere but
 * in it, and nothing said why.
 */
export function addTarget(blocks: Block[], selectedId: string | null, type: BlockType): DropTarget {
  const found = selectedId ? findBlock(blocks, selectedId) : null;
  if (!found) {
    const col = selectedId ? splitColumnId(selectedId) : null;
    const row = col ? findBlock(blocks, col.rowId)?.block : null;
    const into = row?.columns?.[col?.index ?? -1];
    if (col && into && type !== "row") {
      return { zone: "column", rowId: col.rowId, column: col.index, index: into.length };
    }
    return { zone: "root", index: blocks.length };
  }
  if (found.parentId !== null) {
    if (type === "row") return { zone: "root", index: blocks.length };
    return { zone: "column", rowId: found.parentId, column: found.column ?? 0, index: found.index + 1 };
  }
  return { zone: "root", index: found.index + 1 };
}
