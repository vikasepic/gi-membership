import sanitize from "sanitize-html";
import { normalizeBlocks, type Block } from "@/lib/blocks";

/**
 * The tags a person writing copy is allowed to use.
 *
 * Everything that formats and nothing that executes. This list used to be much
 * shorter for rich text — no span, no <b>, no <i>, no class or style — while
 * the HTML block, on the same public page, allowed all of them. One policy for
 * admin-authored markup is easier to reason about than two, and the shorter one
 * was not buying any safety the longer one gives away: neither permits a
 * script, an iframe, an event handler or a url() in a style.
 */
const RICH_TAGS = [
  "p", "br", "hr", "span", "div", "section", "article",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "small", "sub", "sup", "mark", "abbr",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "code", "pre", "figure", "figcaption",
  "a", "img", "picture", "source",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
];

/** Inline only. A <ul> inside an <h1> is not a heading with a list in it. */
const INLINE_TAGS = [
  "span", "br", "strong", "b", "em", "i", "u", "s", "small", "sub", "sup",
  "mark", "abbr", "code", "a",
];

const ATTRIBUTES: sanitize.IOptions["allowedAttributes"] = {
  "*": ["class", "id", "style", "title", "dir", "lang"],
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading", "title"],
  source: ["srcset", "media", "type"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  col: ["span"],
  abbr: ["title"],
};

// No `style` values that can fetch: url() in a style attribute is a request to
// somewhere, which is a leak even when it is not a script.
const STYLES: sanitize.IOptions["allowedStyles"] = {
  "*": {
    color: [/^[^;{}()]+$/],
    "background-color": [/^[^;{}()]+$/],
    "text-align": [/^(left|right|center|justify)$/],
    "text-decoration": [/^[a-z\s-]+$/],
    "font-size": [/^\d+(\.\d+)?(px|rem|em|%)$/],
    "font-style": [/^(normal|italic|oblique)$/],
    "font-weight": [/^(\d{3}|bold|normal)$/],
    "font-family": [/^[^;{}()]+$/],
    "letter-spacing": [/^-?\d+(\.\d+)?(px|rem|em)$/],
    "line-height": [/^\d+(\.\d+)?(px|rem|em|%)?$/],
    margin: [/^[\d\s.a-z%-]+$/],
    padding: [/^[\d\s.a-z%]+$/],
    width: [/^\d+(\.\d+)?(px|rem|em|%)$/],
    "max-width": [/^\d+(\.\d+)?(px|rem|em|%)$/],
    "border-radius": [/^[\d\s.a-z%]+$/],
  },
};

const BASE: sanitize.IOptions = {
  allowedAttributes: ATTRIBUTES,
  allowedStyles: STYLES,
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
};

// WYSIWYG body is authored in admin and rendered to students — the one place
// arbitrary HTML enters the app. Sanitize on SAVE (server side) so stored
// content is always safe, regardless of what the editor or a paste produced.
export function sanitizeBodyHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitize(dirty, { ...BASE, allowedTags: RICH_TAGS });
}

/**
 * A heading, a question, a card's title — one line of copy that may want a word
 * emphasised, coloured or set in another face.
 *
 * These fields rendered as plain text, so typing <b>this</b> showed the angle
 * brackets. They accept markup now, but only the inline kind: a block tag
 * inside a heading produces invalid HTML that browsers repair by moving the
 * content out of the heading, which is a layout no one asked for.
 *
 * A disallowed tag loses its tags and keeps its words, so nothing a person
 * typed ever disappears.
 */
export function sanitizeInlineHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitize(dirty, { ...BASE, allowedTags: INLINE_TAGS });
}

/**
 * The HTML block.
 *
 * Elementor's HTML widget runs scripts, because there the admin is the site
 * owner and the page is their own WordPress. Here a sales page shares a
 * document with Stripe's payment element and with a buyer who is about to type
 * a card number, so a script pasted into a sales page — by anyone who ever
 * gains admin, or by anyone who talks an admin into pasting it — reads that
 * page. Layout tags are allowed; execution is not.
 *
 * Deliberately no <iframe>: the video block exists for embeds and constrains
 * the provider. A named-embed field is the right way to add more, not a hole.
 */
export function sanitizeBlockHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitize(dirty, { ...BASE, allowedTags: RICH_TAGS });
}

/** Sanitize every string in a block tree that reaches the page as markup. */
/**
 * The short fields that reach the page as markup.
 *
 * Each of these rendered as plain text, so a person who typed <b>this</b> saw
 * the angle brackets. Sanitized on save like everything else, which is what
 * lets the renderer hand them to the page as HTML.
 *
 * Every one of them is one line of copy, so they take the inline policy: a
 * heading containing a <ul> is not a heading with a list in it, it is a
 * browser quietly moving the list out of the heading.
 *
 * These lists must name EXACTLY the fields the renderer hands to
 * `dangerouslySetInnerHTML` (search `<Inline` in components/page/blocks.tsx).
 * A field that is here and rendered as React text is encoded twice — sanitize
 * turns `&` into `&amp;` and React encodes the ampersand again, so "Join &
 * Save" reaches the buyer as "Join &amp; Save". A field that is rendered as
 * markup and missing from here is not filtered at all.
 */
const INLINE_FIELDS: Record<string, string[]> = {
  heading: ["text"],
};

/** The same, for the objects inside a list-shaped prop. */
const INLINE_ITEM_FIELDS: Record<string, { prop: string; keys: string[] }> = {
  faq: { prop: "items", keys: ["q", "a"] },
  iconlist: { prop: "items", keys: ["text"] },
  cards: { prop: "items", keys: ["title", "body"] },
  stats: { prop: "items", keys: ["value", "label"] },
  pricing: { prop: "items", keys: ["label"] },
};

export function sanitizeBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const props = { ...b.props };
    if (b.type === "text") props.html = sanitizeBodyHtml(String(props.html ?? ""));
    if (b.type === "html") props.code = sanitizeBlockHtml(String(props.code ?? ""));

    for (const key of INLINE_FIELDS[b.type] ?? []) {
      if (typeof props[key] === "string") props[key] = sanitizeInlineHtml(props[key] as string);
    }
    const list = INLINE_ITEM_FIELDS[b.type];
    if (list && Array.isArray(props[list.prop])) {
      props[list.prop] = (props[list.prop] as Record<string, unknown>[]).map((it) => {
        if (!it || typeof it !== "object") return it;
        const next = { ...it };
        for (const k of list.keys) {
          if (typeof next[k] === "string") next[k] = sanitizeInlineHtml(next[k] as string);
        }
        return next;
      });
    }
    // A card icon is pasted SVG, which is markup someone authored — the same
    // risk as the HTML block, in a field that does not look like one.
    if (b.type === "cards" && Array.isArray(props.items)) {
      props.items = (props.items as Record<string, unknown>[]).map((it) =>
        typeof it?.icon === "string" ? { ...it, icon: sanitizeIcon(it.icon) } : it,
      );
    }
    return {
      ...b,
      props,
      ...(b.columns ? { columns: b.columns.map(sanitizeBlocks) } : {}),
    };
  });
}

/**
 * Everything a section stores that becomes markup, cleaned on the way in.
 *
 * `copy` was already being written straight to the database and rendered with
 * dangerouslySetInnerHTML — admin-authored, so low risk, but unsanitized HTML
 * on a page that takes card details is not a thing to leave standing once a
 * second HTML-bearing field exists.
 */
export function sanitizeSectionContent(content: Record<string, unknown>): Record<string, unknown> {
  const out = { ...content };
  if (typeof out.copy === "string") out.copy = sanitizeBodyHtml(out.copy);
  if ("blocks" in out) out.blocks = sanitizeBlocks(normalizeBlocks(out.blocks));
  return out;
}

/**
 * A pasted icon: an inline SVG, or a URL.
 *
 * Scripts, handlers and anything that can fetch come out. An SVG is markup, and
 * a file someone uploads is a file someone authored.
 */
export function sanitizeIcon(dirty: string): string {
  const v = (dirty ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return /["'<>\s]/.test(v) ? "" : v;
  return sanitize(v, {
    allowedTags: ["svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "ellipse", "defs", "title"],
    allowedAttributes: {
      "*": [
        "viewBox", "viewbox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
        "d", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2", "rx", "ry", "width", "height",
        "points", "transform", "opacity", "fill-rule", "clip-rule",
      ],
    },
    allowedSchemes: [],
    parser: { lowerCaseAttributeNames: false },
  });
}
