import {
  EMAIL_FONTS, fillLine, fillTags, parseLayout, type DocMark, type DocNode, type EmailLayout, type MergeVars,
} from "@/lib/post-purchase-layout";

/**
 * A post-purchase email, from the editor's document to what an inbox shows.
 *
 * Pure: no database, no network. The admin preview calls it in the browser
 * and the send calls it on the server, so what the owner approves is what the
 * buyer gets. Tables and inline styles throughout, the same way
 * lib/post-purchase-email.ts builds the welcome, because Outlook renders
 * neither flexbox nor much of a <style> block.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

/** Every attribute below is double-quoted, so an apostrophe can stay one ("you're", 'Times New Roman'). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT_VALUES = new Set<string>(EMAIL_FONTS.map((f) => f.value));
const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;
const SIZE = /^(1[0-9]|[2-3][0-9]|4[0-8])px$/;

/** An https address, the access link filled in; null for anything else. */
function safeUrl(raw: unknown, vars: MergeVars): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  const filled = t === "{{access_link}}" ? (vars.access_link ?? "") : t;
  try {
    const u = new URL(filled);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function styleOf(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return "";
  const out: string[] = [];
  if (typeof attrs.fontFamily === "string" && FONT_VALUES.has(attrs.fontFamily)) out.push(`font-family:${attrs.fontFamily}`);
  if (typeof attrs.fontSize === "string" && SIZE.test(attrs.fontSize)) out.push(`font-size:${attrs.fontSize}`);
  if (typeof attrs.color === "string" && COLOUR.test(attrs.color)) out.push(`color:${attrs.color}`);
  if (typeof attrs.backgroundColor === "string" && COLOUR.test(attrs.backgroundColor)) out.push(`background-color:${attrs.backgroundColor}`);
  return out.length ? `${out.join(";")};` : "";
}

const align = (n: DocNode) => {
  const a = n.attrs?.textAlign;
  return a === "center" || a === "right" || a === "left" ? `text-align:${a};` : "";
};

/** Safely get content array, or empty array if content is missing or not an array. */
const kids = (n: DocNode | undefined): DocNode[] => (Array.isArray(n?.content) ? n.content : []);

function renderText(n: DocNode, vars: MergeVars, layout: EmailLayout): string {
  // A tag typed as text ("Hello {{first_name}}") is filled like a chip is.
  let out = esc(fillTags(n.text ?? "", vars));
  // The link goes on last, outermost, so a bold word inside a link stays linked.
  const marks = [...(n.marks ?? [])].sort((a, b) => Number(a.type === "link") - Number(b.type === "link"));
  for (const m of marks as DocMark[]) {
    if (m.type === "bold") out = `<strong>${out}</strong>`;
    else if (m.type === "italic") out = `<em>${out}</em>`;
    else if (m.type === "underline") out = `<u>${out}</u>`;
    else if (m.type === "strike") out = `<s>${out}</s>`;
    else if (m.type === "textStyle") {
      const st = styleOf(m.attrs);
      if (st) out = `<span style="${esc(st)}">${out}</span>`;
    } else if (m.type === "link") {
      const href = safeUrl(m.attrs?.href, vars);
      if (href) out = `<a href="${esc(href)}" target="_blank" style="color:${layout.linkColor};text-decoration:underline;">${out}</a>`;
    }
  }
  return out;
}

/** Inline content. A missing name leaves no stray space before the comma. */
function renderInline(nodes: DocNode[] | undefined, vars: MergeVars, layout: EmailLayout): string {
  let out = "";
  let droppedTag = false;
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (n.type === "mergeTag") {
      const key = String(n.attrs?.key ?? "") as keyof MergeVars;
      const v = vars[key] ?? "";
      if (!v) {
        droppedTag = true;
        continue;
      }
      out += esc(v);
      droppedTag = false;
      continue;
    }
    if (n.type === "text") {
      if (droppedTag && /^[,.!?;:]/.test(n.text ?? "")) out = out.replace(/\s+$/, "");
      out += renderText(n, vars, layout);
    } else if (n.type === "hardBreak") {
      out += "<br>";
    }
    droppedTag = false;
  }
  return out;
}

const HEADING = { 1: [26, 1.25], 2: [20, 1.3], 3: [17, 1.35] } as const;

function renderBlock(n: DocNode, vars: MergeVars, layout: EmailLayout): string {
  switch (n.type) {
    case "paragraph": {
      const inner = renderInline(n.content, vars, layout);
      return `<p style="margin:0 0 14px;${align(n)}">${inner || "&nbsp;"}</p>`;
    }
    case "heading": {
      const level = ([1, 2, 3] as const).includes(Number(n.attrs?.level) as 1) ? (Number(n.attrs?.level) as 1 | 2 | 3) : 2;
      const [size, lh] = HEADING[level];
      return `<h${level} style="margin:0 0 14px;font-size:${size}px;line-height:${lh};font-weight:700;${align(n)}">${renderInline(n.content, vars, layout)}</h${level}>`;
    }
    case "bulletList":
    case "orderedList": {
      const tag = n.type === "bulletList" ? "ul" : "ol";
      const items = kids(n)
        .map((li) => `<li style="margin:0 0 6px;">${kids(li).map((c) => (c.type === "paragraph" ? renderInline(c.content, vars, layout) : renderBlock(c, vars, layout))).join("<br>")}</li>`)
        .join("");
      return `<${tag} style="margin:0 0 14px;padding-left:22px;">${items}</${tag}>`;
    }
    case "blockquote":
      return `<blockquote style="margin:0 0 14px;padding-left:14px;border-left:3px solid #e4e1d9;">${kids(n).map((c) => renderBlock(c, vars, layout)).join("")}</blockquote>`;
    case "horizontalRule":
      return `<hr style="border:0;border-top:1px solid #e4e1d9;margin:22px 0;">`;
    case "image": {
      const src = safeUrl(n.attrs?.src, vars);
      if (!src) return "";
      const pct = Math.min(100, Math.max(10, Number(n.attrs?.widthPct) || 100));
      const img = `<img src="${esc(src)}" alt="${esc(String(n.attrs?.alt ?? ""))}" width="${Math.round(((layout.desktopWidth - 2 * layout.desktopPadding) * pct) / 100)}" style="display:block;width:${pct}%;max-width:100%;height:auto;border:0;border-radius:6px;">`;
      const href = safeUrl(n.attrs?.href, vars);
      return `<div style="margin:0 0 14px;">${href ? `<a href="${esc(href)}" target="_blank">${img}</a>` : img}</div>`;
    }
    case "emailButton": {
      const href = safeUrl(n.attrs?.href, vars);
      if (!href) return "";
      const colour = typeof n.attrs?.color === "string" && COLOUR.test(n.attrs.color) ? n.attrs.color : layout.linkColor;
      const center = n.attrs?.align === "center";
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${center ? ' align="center"' : ""} style="margin:22px ${center ? "auto" : "0"};">
<tr>
<td style="border-radius:6px;background:${colour};">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 24px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(fillTags(String(n.attrs?.label ?? "Open"), vars))}</a>
</td>
</tr>
</table>`;
    }
    default:
      return kids(n).map((c) => renderBlock(c, vars, layout)).join("");
  }
}

function plainInline(nodes: DocNode[] | undefined, vars: MergeVars): string {
  return renderInline(nodes, vars, parseLayout({}))
    .replace(/<br>/g, "\n")
    .replace(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/g, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function plainBlock(n: DocNode, vars: MergeVars): string {
  switch (n.type) {
    case "paragraph":
    case "heading":
      return plainInline(n.content, vars);
    case "bulletList":
    case "orderedList":
      return kids(n)
        .map((li, i) => `${n.type === "bulletList" ? "-" : `${i + 1}.`} ${kids(li).map((c) => plainInline(c.content, vars)).join(" ")}`)
        .join("\n");
    case "emailButton": {
      const href = safeUrl(n.attrs?.href, vars);
      return href ? `${fillTags(String(n.attrs?.label ?? "Open"), vars)}: ${href}` : "";
    }
    case "image":
      return String(n.attrs?.alt ?? "");
    case "horizontalRule":
      return "";
    default:
      return kids(n).map((c) => plainBlock(c, vars)).join("\n\n");
  }
}

export function renderPostPurchaseEmail(args: {
  doc: unknown;
  subject: string;
  preheader: string;
  layout: unknown;
  vars: MergeVars;
  stopUrl: string | null;
}): RenderedEmail {
  const layout = parseLayout(args.layout);
  const doc = (args.doc && typeof args.doc === "object" ? args.doc : { type: "doc", content: [] }) as DocNode;
  const blocks = kids(doc);
  const subject = fillLine(args.subject, args.vars);
  const preheader = fillLine(args.preheader, args.vars);
  const inner = blocks.map((b) => renderBlock(b, args.vars, layout)).join("\n");
  // Tied to the desktop width rather than the spec's fixed 600px, so a body
  // set wider than 600 still switches to the mobile rule once it cannot fit.
  const breakpoint = layout.desktopWidth + 32;
  const offer = esc(args.vars.offer_name ?? "this");
  const footer = args.stopUrl
    ? `<p style="margin:0;padding:14px 16px 0;font-family:${layout.fontFamily};font-size:12px;line-height:1.5;color:#6b6b72;text-align:center;">You are getting this because you bought ${offer}. <a href="${esc(args.stopUrl)}" style="color:#6b6b72;text-decoration:underline;">Stop these emails</a></p>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(subject)}</title>
<style>
@media only screen and (max-width: ${breakpoint}px) {
  .pp-body { width:${layout.mobileWidthPct}% !important; max-width:${layout.mobileWidthPct}% !important; }
  .pp-pad { padding:${layout.mobilePadding}px !important; }
  .pp-outer { padding:0 !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${layout.backgroundColor};">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${layout.backgroundColor};">
<tr><td class="pp-outer" align="center" style="padding:24px 0;">
<table role="presentation" class="pp-body" width="${layout.desktopWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${layout.desktopWidth}px;background:${layout.bodyColor};">
<tr><td class="pp-pad" style="padding:${layout.desktopPadding}px;font-family:${layout.fontFamily};font-size:${layout.fontSize}px;line-height:${layout.lineHeight};color:${layout.textColor};">
${inner}
</td></tr>
</table>
${footer}
</td></tr>
</table>
</body>
</html>`;

  const textBody = blocks.map((b) => plainBlock(b, args.vars)).filter((s) => s.trim()).join("\n\n");
  const text = args.stopUrl
    ? `${textBody}\n\nYou are getting this because you bought ${args.vars.offer_name ?? "this"}.\nStop these emails: ${args.stopUrl}`
    : textBody;

  return { subject, html, text };
}
