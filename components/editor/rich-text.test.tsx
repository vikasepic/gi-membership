import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeBodyHtml } from "@/lib/sanitize-html";

/**
 * Why the rich text editor stopped allowing HTML tags.
 *
 * It never allowed them. TipTap is not a text box with buttons — it holds a
 * document conforming to a schema, and anything the schema cannot express is
 * discarded when it parses. StarterKit models paragraphs, three heading
 * levels, bold, italic, strike, code, lists, quotes, rules, links and images,
 * and nothing else. A table, a coloured span, an underline, a <sub> — dropped
 * on paste, long before anything was saved.
 *
 * The confusing part, and the reason this file exists: the SERVER allows all of
 * them. So a person typing a <span> saw it vanish and reasonably concluded the
 * sanitiser had been tightened, when the sanitiser would have kept it.
 */

const source = readFileSync("components/editor/rich-text.tsx", "utf8");

describe("what the store is willing to keep", () => {
  it("keeps the tags the visual editor cannot hold", () => {
    // Every one of these survives a save. None of them survives TipTap.
    const html =
      '<table><tr><td>a</td></tr></table><span style="color:red">x</span><u>u</u><sub>2</sub>';
    const clean = sanitizeBodyHtml(html);
    for (const tag of ["table", "span", "u", "sub"]) {
      expect(clean, `<${tag}> survives the save path`).toContain(`<${tag}`);
    }
    expect(clean).toContain("color:red");
  });

  it("still refuses what it always refused", () => {
    // Source mode widens the editor, never the policy.
    const clean = sanitizeBodyHtml(
      '<script>alert(1)</script><iframe src="x"></iframe><img src=x onerror="alert(1)">',
    );
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("<iframe");
    expect(clean).not.toContain("onerror");
  });
});

describe("the source mode", () => {
  it("writes straight through, without the editor in the way", () => {
    // The textarea's value IS the stored html — no parse, no normalisation,
    // nothing between what was typed and what is saved.
    expect(source).toContain("setHtml(e.target.value)");
    expect(source).toContain("onChange?.(e.target.value)");
  });

  it("warns before the visual editor eats the markup", () => {
    // Switching back re-parses through the schema. Someone who has just
    // hand-written a table would watch it disappear on a click they thought
    // was a view toggle.
    expect(source).toContain("window.confirm");
    expect(source).toMatch(/table\|span\|u\|sub/);
  });

  it("does not re-fire a change while re-reading its own content", () => {
    // setContent with emitUpdate would call onChange with TipTap's stripped
    // version, which is the loss the confirm exists to make deliberate.
    expect(source).toContain("emitUpdate: false");
  });

  it("keeps the hidden input in step for the forms that post one", () => {
    expect(source).toMatch(/name && <input type="hidden" name=\{name\} value=\{html\}/);
  });
});
