import { z } from "zod";

/**
 * Code the owner pastes in — analytics, pixels, chat widgets, verification tags.
 *
 * The two places that already existed do not cover this, and both refuse a
 * `<script>` tag for a reason worth keeping:
 *
 * - **Site-wide JavaScript** is the INSIDE of a script tag, so a `<script>`
 *   typed there is not JavaScript. It also holds one snippet, and a store ends
 *   up with several from different vendors.
 * - **The HTML block** is page content. It is sanitised because a block that
 *   can introduce script is a block that can read the payment form on the same
 *   page, and stored content reaches the renderer from imports and direct
 *   writes as well as from the editor.
 *
 * This is neither: a named list, edited only in Site settings behind
 * `requireAdmin`, by somebody who can already run site-wide JavaScript. It adds
 * no privilege — it adds a place to put several vendors' snippets where each
 * one has a name, a switch, and a stated position.
 */

export const SNIPPET_PLACES = ["head", "bodyStart", "bodyEnd"] as const;
export type SnippetPlace = (typeof SNIPPET_PLACES)[number];

export const SNIPPET_PLACE_LABEL: Record<SnippetPlace, string> = {
  head: "In the head",
  bodyStart: "Top of the page",
  bodyEnd: "End of the page",
};

export const codeSnippetSchema = z.object({
  /** So a list of five is readable a year later. */
  name: z.string().trim().max(80).default(""),
  place: z.enum(SNIPPET_PLACES).default("bodyEnd"),
  code: z.string().max(20000).default(""),
  on: z.boolean().default(true),
  /**
   * Whether it also runs on the checkout.
   *
   * Off by default and it matters. The Payment Element keeps card fields in
   * Stripe's own iframe, so a third-party script cannot read a card number —
   * but it can read everything around it, including the email and name, and
   * PCI DSS asks a merchant to know and authorise every script on a payment
   * page. Turning this on for one vendor is a decision; having it on for all
   * of them by default would not be.
   */
  onCheckout: z.boolean().default(false),
});

export type CodeSnippet = z.infer<typeof codeSnippetSchema>;

export const codeSnippetsSchema = z.array(codeSnippetSchema).max(30).default([]);

/** The ones that should run on this page, in the order they were written. */
export function snippetsFor(
  all: CodeSnippet[],
  place: SnippetPlace,
  onCheckout: boolean,
): CodeSnippet[] {
  return all.filter(
    (s) => s.on && s.place === place && s.code.trim() !== "" && (!onCheckout || s.onCheckout),
  );
}

// ---------------------------------------------------------------------------
// Head snippets
// ---------------------------------------------------------------------------

export type HeadTag =
  | { tag: "script"; attrs: Record<string, string>; body: string }
  | { tag: "meta" | "link"; attrs: Record<string, string>; body: "" };

const HEAD_TAGS = new Set(["script", "meta", "link"]);

/**
 * A head snippet, split into the tags React can hoist.
 *
 * `dangerouslySetInnerHTML` needs an element to sit on, and nothing may be
 * added to `<head>` that way — so head snippets are turned into real React
 * elements instead, which React 19 lifts into the head wherever they are
 * rendered. That only works for the tags that belong there, which is also
 * exactly what people paste into a head: a script, a verification `<meta>`, a
 * `<link>`.
 *
 * Deliberately small and strict. Anything it does not recognise is reported
 * rather than guessed at, so the panel can say "this line will not run" instead
 * of the page quietly dropping it.
 */
export function parseHeadTags(html: string): { tags: HeadTag[]; unsupported: string[] } {
  const tags: HeadTag[] = [];
  const unsupported: string[] = [];
  // Either a paired tag with a body, or a self-closing/void one.
  const re = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>(?:([\s\S]*?)<\/\1\s*>)?/g;
  let m: RegExpExecArray | null;
  let seen = false;

  while ((m = re.exec(html)) !== null) {
    seen = true;
    const [, rawName, rawAttrs, , body] = m;
    const tag = rawName.toLowerCase();
    if (!HEAD_TAGS.has(tag)) {
      unsupported.push(tag);
      continue;
    }
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(rawAttrs)) !== null) {
      attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? "";
    }
    if (tag === "script") tags.push({ tag, attrs, body: body ?? "" });
    else tags.push({ tag: tag as "meta" | "link", attrs, body: "" });
  }

  // Bare JavaScript with no tag around it is the commonest paste of all, and
  // treating it as "nothing recognised" would be the panel being pedantic at
  // somebody who did the reasonable thing.
  if (!seen && html.trim() !== "") tags.push({ tag: "script", attrs: {}, body: html });

  return { tags, unsupported: [...new Set(unsupported)] };
}

/** React needs camelCase for a few of these, and rejects the rest silently. */
export function reactAttrs(attrs: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    const key = k.toLowerCase();
    if (key === "class") out.className = v;
    else if (key === "for") out.htmlFor = v;
    else if (key === "charset") out.charSet = v;
    else if (key === "http-equiv") out.httpEquiv = v;
    else if (key === "crossorigin") out.crossOrigin = v;
    else if (key === "referrerpolicy") out.referrerPolicy = v;
    // Valueless attributes — `async`, `defer` — are true, not "".
    else if (v === "" && (key === "async" || key === "defer" || key === "nomodule")) out[key] = true;
    else out[key] = v;
  }
  return out;
}
