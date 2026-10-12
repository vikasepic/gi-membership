// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { emailExtensions } from "@/lib/email-editor-extensions";
import { docOf } from "@/components/admin/email-editor";

/**
 * What the editor hands the page, and so what the page hands the server.
 *
 * ProseMirror builds every node's and mark's `attrs` with a null prototype,
 * and `getJSON()` passes those objects through as they are. React will not
 * send a null-prototype object to a server action: it sends a placeholder,
 * and the first read of `attrs.href` on the server throws. Every email with a
 * link, a button, a font or an alignment failed to save with a 500 that the
 * page reported as "Could not reach the server" (12 Oct 2026).
 */

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

/** Every object in the tree, so none can hide a null prototype. */
function objects(v: unknown, out: object[] = []): object[] {
  if (v && typeof v === "object") {
    out.push(v);
    for (const child of Object.values(v)) objects(child, out);
  }
  return out;
}

describe("the email the editor reports", () => {
  it("is plain data all the way down, so a server action can receive it", () => {
    editor = new Editor({
      extensions: emailExtensions(),
      content:
        '<p style="text-align: center"><span style="font-family: Georgia">Hi</span> <a href="https://example.com">read this</a></p>',
    });
    const doc = docOf(editor);
    const all = objects(doc);
    // The link's attrs are the case that broke saving.
    expect(JSON.stringify(doc)).toContain("https://example.com");
    expect(all.filter((o) => Object.getPrototypeOf(o) === null)).toEqual([]);
  });
});
