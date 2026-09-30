/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/react";
import { emailExtensions } from "@/lib/email-editor-extensions";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { starterDoc } from "@/lib/post-purchase-layout";

/**
 * The editor and the renderer agree on the document. The editor writes JSON
 * the renderer reads; if a node or mark were named differently on either
 * side, the owner would see it in the editor and the buyer would not get it.
 */
describe("the email editor's document", () => {
  const editor = new Editor({ extensions: emailExtensions(), content: starterDoc("Funnel App") });

  it("holds the starter email without dropping the tag or the button", () => {
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"mergeTag"');
    expect(json).toContain('"type":"emailButton"');
  });

  it("writes font, size, colour and alignment where the renderer reads them", () => {
    editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "styled" }] }] });
    editor.chain().selectAll().setFontFamily("Georgia, 'Times New Roman', serif").setFontSize("20px").setColor("#112233").setTextAlign("center").run();
    const m = renderPostPurchaseEmail({ doc: editor.getJSON(), subject: "s", preheader: "", layout: {}, vars: {}, stopUrl: null });
    expect(m.html).toContain("text-align:center;");
    expect(m.html).toContain("font-family:Georgia, 'Times New Roman', serif;font-size:20px;color:#112233;");
  });

  it("keeps an image's width and link", () => {
    editor.commands.setContent({ type: "doc", content: [{ type: "image", attrs: { src: "https://x.co/a.png", alt: "a", widthPct: 60, href: "https://x.co" } }] });
    const img = (editor.getJSON().content ?? [])[0];
    expect(img.attrs).toMatchObject({ widthPct: 60, href: "https://x.co" });
  });
});
