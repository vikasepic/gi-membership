import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme, BAND_STYLE_KEYS } from "@/lib/page-sections";
import { newBlock, normalizeBlocks, type Block, type BlockType } from "@/lib/blocks";

const paper = bandTheme("paper");
const navy = bandTheme("navy");

const render = (blocks: Block[], theme = paper) =>
  renderToStaticMarkup(<Blocks blocks={blocks} theme={theme} />);

const make = (type: BlockType, props: Record<string, unknown> = {}, style: Record<string, unknown> = {}): Block => {
  const b = newBlock(type);
  return { ...b, props: { ...b.props, ...props }, style: { ...b.style, ...style } as Block["style"] };
};

describe("the canvas", () => {
  it("renders nothing at all when there are no blocks", () => {
    expect(render([])).toBe("");
  });

  it("renders blocks in order", () => {
    const out = render([make("heading", { text: "First" }), make("heading", { text: "Second" })]);
    expect(out.indexOf("First")).toBeLessThan(out.indexOf("Second"));
  });

  it("renders every block type without throwing", () => {
    for (const b of normalizeBlocks(
      (["heading", "text", "image", "video", "button", "iconlist", "slides", "spacer", "divider", "html", "row"] as const).map(
        (type) => newBlock(type),
      ),
    )) {
      expect(() => render([b])).not.toThrow();
    }
  });
});

describe("heading", () => {
  it("uses the tag it was given", () => {
    expect(render([make("heading", { tag: "h3", text: "Hi" })])).toContain("<h3");
  });

  it("falls back to h2 for a tag that is not a heading", () => {
    expect(render([make("heading", { tag: "script", text: "Hi" })])).toContain("<h2");
  });

  it("changing the tag changes the size — the prototype bug", () => {
    // The tag control appeared to do nothing because the size was hard-set.
    const h1 = render([make("heading", { tag: "h1" })]);
    const h3 = render([make("heading", { tag: "h3" })]);
    expect(h1).not.toBe(h3);
    expect(h1).toContain("clamp(1.8rem,4vw,2.9rem)");
    expect(h3).toContain("1.15rem");
  });

  it("an explicit size wins over the tag's scale", () => {
    expect(render([make("heading", { tag: "h1" }, { size: 20 })])).toContain("font-size:20px");
  });

  it("escapes its text rather than rendering it as markup", () => {
    expect(render([make("heading", { text: "<img src=x onerror=alert(1)>" })])).not.toContain("<img");
  });
});

describe("colours come from the band", () => {
  it("a heading is painted in the band's text colour", () => {
    expect(render([make("heading")], paper)).toContain(paper.fg);
    expect(render([make("heading")], navy)).toContain(navy.fg);
  });

  it("the same block renders differently on a different band", () => {
    const b = make("heading", { text: "Same" });
    expect(render([b], paper)).not.toBe(render([b], navy));
  });

  it("a button takes the band accent", () => {
    expect(render([make("button")], navy)).toContain(navy.accent);
  });

  it("every band renders every block", () => {
    for (const key of BAND_STYLE_KEYS) {
      const t = bandTheme(key);
      expect(() => render([make("heading"), make("button"), make("divider")], t)).not.toThrow();
    }
  });
});

describe("text and html blocks", () => {
  it("renders stored rich text as markup — it was sanitized on save", () => {
    expect(render([make("text", { html: "<p>Hello <strong>you</strong></p>" })])).toContain("<strong>you</strong>");
  });

  it("renders an html block's code", () => {
    expect(render([make("html", { code: "<div class='x'>Custom</div>" })])).toContain("Custom");
  });

  it("renders nothing for an empty html block, rather than a blank div", () => {
    expect(render([make("html", { code: "   " })])).not.toContain("Custom");
    expect(render([make("html", { code: "" })])).toBe(render([]));
  });
});

describe("image", () => {
  it("renders nothing without a source, rather than a broken image", () => {
    expect(render([make("image", { url: "" })])).toBe("");
  });

  it("renders the image with its alt text", () => {
    const out = render([make("image", { url: "https://x.test/a.jpg", alt: "A valley" })]);
    expect(out).toContain('src="https://x.test/a.jpg"');
    expect(out).toContain('alt="A valley"');
  });

  it("always has an alt attribute, even when nobody typed one", () => {
    expect(render([make("image", { url: "https://x.test/a.jpg" })])).toContain('alt=""');
  });

  it("wraps in a link only when there is one", () => {
    expect(render([make("image", { url: "https://x.test/a.jpg" })])).not.toContain("<a");
    expect(render([make("image", { url: "https://x.test/a.jpg", link: "https://y.test" })])).toContain("<a");
  });

  it("shows a caption only when written", () => {
    expect(render([make("image", { url: "https://x.test/a.jpg" })])).not.toContain("figcaption");
    expect(render([make("image", { url: "https://x.test/a.jpg", caption: "Shot here" })])).toContain("Shot here");
  });
});

describe("video", () => {
  it("frames YouTube on the no-cookie host", () => {
    const out = render([make("video", { source: "youtube", url: "https://youtu.be/aqz-KE-bpKQ" })]);
    expect(out).toContain("youtube-nocookie.com/embed/aqz-KE-bpKQ");
    expect(out).toContain("<iframe");
  });

  it("never frames a link it does not recognise", () => {
    const out = render([make("video", { source: "youtube", url: "https://evil.test/embed/x" })]);
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("evil.test");
  });

  it("falls back to the poster when the link is unusable", () => {
    const out = render([make("video", { source: "youtube", url: "nonsense", poster: "https://x.test/p.jpg" })]);
    expect(out).toContain("https://x.test/p.jpg");
    expect(out).not.toContain("<iframe");
  });

  it("renders a self-hosted file as a video element", () => {
    const out = render([make("video", { source: "file", url: "https://cdn.test/a.mp4" })]);
    expect(out).toContain("<video");
    expect(out).toContain("cdn.test/a.mp4");
  });

  it("gives the frame a title, so it is not an unlabelled frame in a screen reader", () => {
    expect(render([make("video", { url: "https://youtu.be/aqz-KE-bpKQ" })])).toContain('title="YouTube video"');
  });
});

describe("lists and slides", () => {
  it("renders nothing for an icon list with no items", () => {
    expect(render([make("iconlist", { items: [] })])).toBe("");
  });

  it("renders one row per item", () => {
    const out = render([make("iconlist", { items: [{ text: "One" }, { text: "Two" }] })]);
    expect(out).toContain("One");
    expect(out).toContain("Two");
    expect(out.match(/<li/g)).toHaveLength(2);
  });

  it("renders nothing for a slider with no slides", () => {
    expect(render([make("slides", { items: [] })])).toBe("");
  });

  it("renders slides with their attribution", () => {
    const out = render([make("slides", { items: [{ quote: "It worked", name: "Sam", role: "Coach" }] })]);
    expect(out).toContain("It worked");
    expect(out).toContain("Sam");
    expect(out).toContain("Coach");
  });

  it("needs no JavaScript to be swipeable", () => {
    // A carousel that only works with a client bundle is a carousel that shows
    // one slide on a slow connection.
    expect(render([make("slides", { items: [{ quote: "a" }, { quote: "b" }] })])).toContain("snap-x");
  });
});

describe("rows and columns", () => {
  it("renders one column per structure slot", () => {
    const row = newBlock("row");
    row.columns![0] = [make("heading", { text: "In here" })];
    expect(render([row]).match(/min-w-0/g)).toHaveLength(2);
  });

  it("renders nothing for a row nobody put anything in", () => {
    // An empty grid is a gap on the page. The editor still shows it.
    expect(render([newBlock("row")])).toBe("");
  });

  it("renders blocks nested in a column", () => {
    const row = newBlock("row");
    row.columns![1] = [make("heading", { text: "Nested" })];
    expect(render([row])).toContain("Nested");
  });

  it("lays columns out in the given proportions", () => {
    const base = newBlock("row");
    const row: Block = { ...base, props: { ...base.props, structure: "2-1" }, columns: [[make("heading", { text: "A" })], []] };
    expect(render([row])).toContain("2fr 1fr");
  });

  it("a nested block still resolves its colour against the band", () => {
    const row = newBlock("row");
    row.columns![0] = [make("heading", { text: "Nested" })];
    expect(render([row], navy)).toContain(navy.fg);
  });
});

describe("style is applied", () => {
  it("writes the box model onto the wrapper", () => {
    expect(render([make("heading", {}, { padding: { t: 8, r: 8, b: 8, l: 8, u: "px", link: true } })])).toContain(
      "padding:8px 8px 8px 8px",
    );
  });

  it("emits the css id and class someone set", () => {
    const out = render([make("heading", {}, { cssId: "cta-top", cssClass: "promo" })]);
    expect(out).toContain('id="cta-top"');
    expect(out).toContain("promo");
  });

  it("emits hide classes for the breakpoints turned off", () => {
    expect(render([make("heading", {}, { hideMobile: true })])).toContain("max-md:hidden");
  });

  it("does not emit an empty id attribute when none was set", () => {
    expect(render([make("heading")])).not.toContain('id=""');
  });

  it("renders a spacer at the height given", () => {
    expect(render([make("spacer", { height: 64 })])).toContain("height:64px");
  });

  it("renders a divider using the band hairline", () => {
    expect(render([make("divider")], navy)).toContain(navy.rule);
  });
});
