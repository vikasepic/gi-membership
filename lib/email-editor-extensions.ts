import { Node, mergeAttributes, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { TextStyle, Color, BackgroundColor, FontFamily, FontSize } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { MERGE_LABELS, type MergeKey } from "@/lib/post-purchase-layout";

/**
 * The post-purchase email editor's schema. Every node and mark here has a
 * matching branch in lib/post-purchase-render.ts; add one and add the other.
 */

/** A personal detail, shown as a chip, filled in at send time. */
export const MergeTag = Node.create({
  name: "mergeTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { key: { default: "first_name" } };
  },
  parseHTML() {
    return [{ tag: "span[data-merge-tag]", getAttrs: (el) => ({ key: (el as HTMLElement).dataset.mergeTag }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-merge-tag": node.attrs.key, class: "merge-tag" }), MERGE_LABELS[node.attrs.key as MergeKey] ?? String(node.attrs.key)];
  },
});

/** A call-to-action button, drawn as a table by the renderer. */
export const EmailButton = Node.create({
  name: "emailButton",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      label: { default: "Open your library" },
      href: { default: "{{access_link}}" },
      color: { default: "#c8653d" },
      align: { default: "left" },
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-email-button]",
      getAttrs: (el) => {
        const d = (el as HTMLElement).dataset;
        return { label: d.label, href: d.href, color: d.color, align: d.align };
      },
    }];
  },
  renderHTML({ node }) {
    const a = node.attrs as { label: string; href: string; color: string; align: string };
    return [
      "div",
      { "data-email-button": "", "data-label": a.label, "data-href": a.href, "data-color": a.color, "data-align": a.align, class: "email-button", style: `text-align:${a.align === "center" ? "center" : "left"}` },
      ["span", { style: `background:${a.color}` }, a.label],
    ];
  },
});

/** An image with a width in percent and an optional link. */
export const EmailImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      widthPct: {
        default: 100,
        parseHTML: (el) => Number((el as HTMLElement).dataset.widthPct) || 100,
        renderHTML: (a) => ({ "data-width-pct": a.widthPct, style: `width:${a.widthPct}%` }),
      },
      href: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).dataset.href ?? null,
        renderHTML: (a) => (a.href ? { "data-href": a.href } : {}),
      },
    };
  },
});

export function emailExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, code: false, codeBlock: false }),
    Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { target: "_blank" } }),
    EmailImage,
    TextStyle,
    Color,
    BackgroundColor,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    MergeTag,
    EmailButton,
  ];
}
