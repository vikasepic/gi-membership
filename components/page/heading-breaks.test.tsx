import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks, withLineBreaks } from "@/components/page/blocks";
import { newBlock } from "@/lib/blocks";
import { bandTheme } from "@/lib/page-sections";

const heading = (text: string) =>
  renderToStaticMarkup(
    <Blocks blocks={[newBlock("heading", { props: { text, tag: "h1" } })]} theme={bandTheme("light")} />,
  );

// Pressing Enter in a heading did nothing — HTML collapses a newline into a
// space. Typing <br> did nothing either, and worse: a plain child is escaped,
// so the four characters appeared on the page. That reads as a broken editor
// rather than a strict one.

describe("a line break in a heading", () => {
  it("honours the Enter key", () => {
    expect(heading("Write Viral Carousels\nThat Get You Clients")).toContain("pre-line");
  });

  it("honours a typed <br>", () => {
    expect(withLineBreaks("one<br>two")).toBe("one\ntwo");
  });

  it.each(["<br>", "<br/>", "<br />", "<BR>", "<Br />"])("accepts %s", (tag) => {
    expect(withLineBreaks(`a${tag}b`)).toBe("a\nb");
  });

  it("leaves ordinary text alone", () => {
    expect(withLineBreaks("Plain heading")).toBe("Plain heading");
  });
});

describe("what it must not become", () => {
  it("does not start rendering HTML", () => {
    // A heading that ran arbitrary markup would be a way to put a script on a
    // live sales page. Breaks are honoured; everything else stays text.
    const out = heading("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("does not turn a bold tag into markup", () => {
    expect(heading("<b>loud</b>")).not.toContain("<b>loud</b>");
  });
});
