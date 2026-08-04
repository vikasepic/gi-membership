import sanitize from "sanitize-html";
import { normalizeBlocks, type Block } from "@/lib/blocks";

// WYSIWYG body is authored in admin and rendered to students — the one place
// arbitrary HTML enters the app. Sanitize on SAVE (server side) so stored
// content is always safe, regardless of what the editor or a paste produced.
export function sanitizeBodyHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitize(dirty, {
    allowedTags: [
      "p", "br", "h2", "h3", "h4",
      "strong", "em", "u", "s",
      "ul", "ol", "li",
      "blockquote", "code", "pre",
      "a", "img", "hr",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title"],
    },
    // http/https only, plus our own relative gated media paths.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
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
  return sanitize(dirty, {
    allowedTags: [
      "p", "br", "hr", "span", "div", "section", "article",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "b", "em", "i", "u", "s", "small", "sub", "sup",
      "ul", "ol", "li", "dl", "dt", "dd",
      "blockquote", "code", "pre", "figure", "figcaption",
      "a", "img", "picture", "source",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    ],
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "dir", "lang"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      source: ["srcset", "media", "type"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      col: ["span"],
    },
    // No `style` values that can fetch: url() in a style attribute is a
    // request to somewhere, which is a leak even when it is not a script.
    allowedStyles: {
      "*": {
        color: [/^[^;{}()]+$/],
        "background-color": [/^[^;{}()]+$/],
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": [/^\d+(\.\d+)?(px|rem|em|%)$/],
        "font-weight": [/^(\d{3}|bold|normal)$/],
        margin: [/^[\d\s.a-z%]+$/],
        padding: [/^[\d\s.a-z%]+$/],
        width: [/^\d+(\.\d+)?(px|rem|em|%)$/],
        "max-width": [/^\d+(\.\d+)?(px|rem|em|%)$/],
        "border-radius": [/^[\d\s.a-z%]+$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

/** Sanitize every string in a block tree that reaches the page as markup. */
export function sanitizeBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const props = { ...b.props };
    if (b.type === "text") props.html = sanitizeBodyHtml(String(props.html ?? ""));
    if (b.type === "html") props.code = sanitizeBlockHtml(String(props.code ?? ""));
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
