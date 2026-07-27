import sanitize from "sanitize-html";

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
