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
    // Asserted as a relationship rather than exact values, so retuning the
    // scale does not fail a test about the tag doing something.
    const sizeOf = (tag: string) =>
      /font-size:([^;"]+)/.exec(render([make("heading", { tag })]))![1];
    const sizes = ["h1", "h2", "h3", "h4", "h5", "h6"].map(sizeOf);
    expect(new Set(sizes).size).toBe(6);
    expect(sizes[0]).toContain("clamp(");
    // h6 is a plain rem value; h1 is a clamp that starts well above it.
    expect(parseFloat(sizes[5])).toBeLessThan(parseFloat(sizes[0].replace("clamp(", "")));
  });

  it("an explicit size wins over the tag's scale", () => {
    expect(render([make("heading", { tag: "h1" }, { size: 20 })])).toContain("font-size:20px");
  });

  it("renders the inline markup it was given", () => {
    // A heading may emphasise a word, colour it, or set it in another face.
    // What reaches here has already been through sanitizeInlineHtml on save —
    // the same boundary the text and html blocks have always relied on.
    expect(render([make("heading", { text: "Stop <b>guessing</b>" })])).toContain("<b>guessing</b>");
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
  it("renders one element per column", () => {
    const row = newBlock("row");
    row.columns![0] = [make("heading", { text: "In here" })];
    const out = render([row]);
    expect(out.match(/nth-child\(\d\)/g)?.length).toBeGreaterThanOrEqual(2);
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
    const row: Block = {
      ...base,
      props: { ...base.props, widths: [66.67, 33.33] },
      columns: [[make("heading", { text: "A" })], []],
    };
    const out = render([row]);
    expect(out).toContain("width:calc(66.67%");
    expect(out).toContain("width:calc(33.33%");
  });

  it("stacks the columns on a phone without being told to", () => {
    const base = newBlock("row");
    const row: Block = {
      ...base,
      props: { ...base.props, widths: [66.67, 33.33] },
      columns: [[make("heading", { text: "A" })], []],
    };
    const mobile = render([row]).split("max-width:767px")[1] ?? "";
    expect(mobile).toContain("width:calc(100% - 0px)");
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

  it("hides at the breakpoints turned off", () => {
    // Rewritten to new intent. This was a Tailwind class — `max-md:hidden` —
    // whose rem-based screen moves with the reader's font size and starts one
    // pixel off DEVICE_MAX. Now it is a rule on the block's own selector, on
    // the same boundary as everything else the block emits.
    const out = render([make("heading", {}, { hideMobile: true })]);
    expect(out).toContain("@media (max-width:767px)");
    expect(out).toContain("display:none");
    expect(out).not.toContain("max-md:hidden");
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

describe("adjacent buttons share a line", () => {
  it("wraps a run of buttons in one row", () => {
    const out = render([
      make("button", { text: "Buy" }),
      make("button", { text: "See how", variant: "outline" }),
    ]);
    expect(out).toContain("flex flex-wrap items-center gap-3");
  });

  it("leaves a single button alone", () => {
    expect(render([make("button", { text: "Buy" })])).not.toContain("flex flex-wrap items-center gap-3");
  });

  it("does not join buttons separated by something else", () => {
    const out = render([
      make("button", { text: "Buy" }),
      make("heading", { text: "Between" }),
      make("button", { text: "Later" }),
    ]);
    expect(out).not.toContain("flex flex-wrap items-center gap-3");
  });

  it("still renders every button's label", () => {
    const out = render([make("button", { text: "Buy" }), make("button", { text: "See how" })]);
    expect(out).toContain("Buy");
    expect(out).toContain("See how");
  });
});

describe("the FAQ", () => {
  const faq = (props: Record<string, unknown>) => render([make("faq", props)]);
  const items = [{ q: "Refunds?", a: "Yes." }, { q: "Cancel?", a: "One click." }];

  it("opens and closes by default", () => {
    const out = faq({ items });
    expect(out).toContain("<details");
    expect(out).toContain("<summary");
  });

  it("needs no JavaScript to open", () => {
    // A <details> works before any bundle arrives and from the keyboard.
    expect(faq({ items })).not.toContain("onclick");
  });

  it("groups them, so opening one closes the last", () => {
    expect(faq({ items })).toContain('name="faq"');
  });

  it("still shows every question when closed", () => {
    const out = faq({ items });
    expect(out).toContain("Refunds?");
    expect(out).toContain("Cancel?");
  });

  it("can still be set to all-open in two columns", () => {
    const out = faq({ items, layout: "open" });
    expect(out).not.toContain("<details");
    expect(out).toContain("--faq");
  });

  it("renders nothing without questions", () => {
    expect(faq({ items: [] })).toBe("");
  });
});

describe("the price comparison cannot disagree with the price card", () => {
  const rows = [
    { label: "An agency", amount: "$2,000", note: "per month" },
    { label: "This", amount: "", note: "per month" },
  ];

  it("fills the highlighted row from the real price when it is blank", () => {
    const out = renderToStaticMarkup(
      <Blocks blocks={[make("pricing", { items: rows })]} theme={paper} money={{ priceLabel: "$29" }} />,
    );
    expect(out).toContain("$29");
    expect(out).toContain("$2,000");
  });

  it("does not touch a row someone typed an amount into", () => {
    const typed = [{ label: "An agency", amount: "$2,000", note: "" }, { label: "This", amount: "$19", note: "" }];
    const out = renderToStaticMarkup(
      <Blocks blocks={[make("pricing", { items: typed })]} theme={paper} money={{ priceLabel: "$29" }} />,
    );
    expect(out).toContain("$19");
    expect(out).not.toContain("$29");
  });

  it("leaves it blank rather than inventing one when there is no price", () => {
    const out = renderToStaticMarkup(<Blocks blocks={[make("pricing", { items: rows })]} theme={paper} />);
    expect(out).not.toContain("$29");
    expect(out).toContain("$2,000");
  });

  it("never fills a row that is not the highlighted one", () => {
    const out = renderToStaticMarkup(
      <Blocks blocks={[make("pricing", { items: [{ label: "A", amount: "" }, { label: "B", amount: "$5" }] })]}
        theme={paper} money={{ priceLabel: "$29" }} />,
    );
    expect(out.indexOf("$29")).toBe(-1);
  });
});

describe("a page has to be buyable", () => {
  // The regression this exists to prevent: switching the page to blocks
  // dropped the buy-control wiring, so every CTA on a live sales page rendered
  // as a <span>. It looked right and could not be clicked.
  const buy = make("button", { text: "Start 7 days free", action: "buy" });
  const cta = (label: string) => <a href="/checkout?x=1">{label}</a>;

  it("renders a buy button through the page's own control", () => {
    const out = renderToStaticMarkup(<Blocks blocks={[buy]} theme={paper} cta={cta} />);
    expect(out).toContain('href="/checkout?x=1"');
    expect(out).toContain("Start 7 days free");
  });

  it("never silently renders a buy button as plain text when a control exists", () => {
    const out = renderToStaticMarkup(<Blocks blocks={[buy]} theme={paper} cta={cta} />);
    expect(out).toContain("<a");
  });

  it("routes the price card's button through it too", () => {
    const card = make("pricecard", { ctaLabel: "Start 7 days free", price: "$29" });
    const out = renderToStaticMarkup(<Blocks blocks={[card]} theme={paper} cta={cta} />);
    expect(out).toContain('href="/checkout?x=1"');
  });

  it("leaves a plain link button alone", () => {
    const linked = make("button", { text: "See how", action: "link", link: "#how" });
    const out = renderToStaticMarkup(<Blocks blocks={[linked]} theme={paper} cta={cta} />);
    expect(out).toContain('href="#how"');
    expect(out).not.toContain("/checkout");
  });

  it("still renders something in a preview with no control wired", () => {
    const out = renderToStaticMarkup(<Blocks blocks={[buy]} theme={paper} />);
    expect(out).toContain("Start 7 days free");
  });
});

describe("the price card shows what it costs, not what is due today", () => {
  // It read "$0" under the words "After the trial" — the wrong number in the
  // largest type on the page, on a page that takes payment.
  const card = make("pricecard", { eyebrow: "After the trial", ctaLabel: "Start" });

  it("shows the headline price", () => {
    const out = renderToStaticMarkup(
      <Blocks blocks={[card]} theme={paper} money={{ priceLabel: "$29", termsLabel: "/month", dueNowLabel: "$0" }} />,
    );
    expect(out).toContain("$29");
    expect(out).toContain("/month");
  });

  it("does not put the amount due today in the price", () => {
    // A card reading "$0" under the words "After the trial" tells the buyer
    // the wrong number. The headline is what it costs; what is taken today is
    // its own smaller line underneath, and both are true.
    const out = renderToStaticMarkup(
      <Blocks blocks={[card]} theme={paper} money={{ priceLabel: "$29", termsLabel: "/month", dueNowLabel: "$0" }} />,
    );
    const headline = out.slice(out.indexOf("2.4rem"), out.indexOf("2.4rem") + 90);
    expect(headline).toContain("$29");
    expect(headline).not.toContain("$0");
    expect(out).toContain("$0 today");
  });

  it("says nothing about today when today IS the price", () => {
    // "$29 today" under "$29" is a line that adds nothing.
    const out = renderToStaticMarkup(
      <Blocks blocks={[card]} theme={paper} money={{ priceLabel: "$29", dueNowLabel: "$29" }} />,
    );
    expect(out).not.toContain("today");
  });

  it("still lets a typed price win, for a card someone overrode deliberately", () => {
    const typed = make("pricecard", { price: "$99", ctaLabel: "Start" });
    const out = renderToStaticMarkup(<Blocks blocks={[typed]} theme={paper} money={{ priceLabel: "$29" }} />);
    expect(out).toContain("$99");
  });
});
