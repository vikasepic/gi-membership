import { describe, it, expect } from "vitest";
import { sanitizeInlineHtml, sanitizeBodyHtml, sanitizeBlocks } from "@/lib/sanitize-html";
import { newBlock } from "@/lib/blocks";

/**
 * Headings and other one-line fields render their markup now instead of
 * escaping it. That moved the safety guarantee from the renderer to the save,
 * so this is where it has to be proved.
 *
 * The old renderer escaped everything, which stopped a script and also stopped
 * a <b>. The sanitizer keeps the second and removes the first — but only if it
 * actually does, and only if the save actually calls it.
 */
const head = (text: string) =>
  (sanitizeBlocks([newBlock("heading", { props: { text, tag: "h2" } })])[0].props.text as string);

describe("what a heading may carry", () => {
  it("keeps the tags that format a word", () => {
    expect(sanitizeInlineHtml("Stop <b>guessing</b>")).toBe("Stop <b>guessing</b>");
    expect(sanitizeInlineHtml("<i>quietly</i>")).toBe("<i>quietly</i>");
    expect(sanitizeInlineHtml("<em>x</em> <strong>y</strong> <u>z</u>")).toContain("<strong>");
  });

  it("keeps a span with its colour and face", () => {
    // The reason span matters: one word in the accent colour, or in the other
    // typeface, without a block override.
    const out = sanitizeInlineHtml('<span style="color:#b4472b;font-family:Lora">this</span>');
    expect(out).toContain("color:#b4472b");
    expect(out).toContain("font-family:Lora");
  });

  it("keeps a class, so a heading can use the design system", () => {
    expect(sanitizeInlineHtml('<span class="kicker">Part one</span>')).toContain('class="kicker"');
  });
});

describe("what it may not", () => {
  it("strips a script and keeps the words", () => {
    // Nothing a person typed should vanish; only the execution.
    expect(sanitizeInlineHtml("<script>alert(1)</script>")).not.toContain("<script");
    expect(sanitizeInlineHtml("safe<script>alert(1)</script>")).toContain("safe");
  });

  it("strips an event handler", () => {
    expect(sanitizeInlineHtml('<span onclick="alert(1)">x</span>')).not.toContain("onclick");
  });

  it("strips an image, which is a request to somewhere", () => {
    expect(sanitizeInlineHtml('<img src=x onerror=alert(1)>')).not.toContain("<img");
  });

  it("strips a url() out of a style", () => {
    expect(sanitizeInlineHtml('<span style="background:url(https://x.test/p.gif)">x</span>'))
      .not.toContain("url(");
  });

  it("refuses a javascript: link", () => {
    expect(sanitizeInlineHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
  });

  it("keeps block tags out of a one-line field", () => {
    // A <ul> inside an <h1> is a browser quietly moving the list out of the
    // heading. The words survive; the tags do not.
    const out = sanitizeInlineHtml("<ul><li>one</li></ul>");
    expect(out).not.toContain("<ul");
    expect(out).toContain("one");
  });
});

describe("the save actually calls it", () => {
  it("sanitizes a heading on the way in", () => {
    expect(head("<script>alert(1)</script>Real")).not.toContain("<script");
    expect(head("Stop <b>guessing</b>")).toBe("Stop <b>guessing</b>");
  });

  it("sanitizes the fields inside a list block", () => {
    const faq = sanitizeBlocks([
      newBlock("faq", { props: { items: [{ q: "<b>Q</b><script>x</script>", a: "<i>A</i>" }] } }),
    ])[0];
    const item = (faq.props.items as { q: string; a: string }[])[0];
    expect(item.q).toContain("<b>Q</b>");
    expect(item.q).not.toContain("<script");
    expect(item.a).toBe("<i>A</i>");
  });
});

describe("rich text stopped throwing away formatting", () => {
  it("keeps span, b and i, which it used to strip", () => {
    // The block sat on a shorter allowlist than the HTML block beside it, so
    // pasting formatted copy quietly lost half of it.
    const out = sanitizeBodyHtml('<p><span class="x"><b>a</b> <i>b</i></span></p>');
    expect(out).toContain("<span");
    expect(out).toContain("<b>a</b>");
    expect(out).toContain("<i>b</i>");
  });

  it("still refuses a script", () => {
    expect(sanitizeBodyHtml("<p>ok</p><script>alert(1)</script>")).not.toContain("<script");
  });
});
