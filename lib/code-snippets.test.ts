import { describe, it, expect } from "vitest";
import { parseHeadTags, reactAttrs, snippetsFor, codeSnippetsSchema, type CodeSnippet } from "@/lib/code-snippets";

const snip = (o: Partial<CodeSnippet>): CodeSnippet =>
  codeSnippetsSchema.parse([{ code: "x", ...o }])[0];

describe("which snippets run where", () => {
  const all = [
    snip({ name: "GA", place: "head" }),
    snip({ name: "Chat", place: "bodyEnd" }),
    snip({ name: "Off", place: "bodyEnd", on: false }),
    snip({ name: "Empty", place: "bodyEnd", code: "   " }),
    snip({ name: "Pixel", place: "head", onCheckout: true }),
  ];

  it("picks the ones for that position", () => {
    expect(snippetsFor(all, "head", false).map((s) => s.name)).toEqual(["GA", "Pixel"]);
    expect(snippetsFor(all, "bodyEnd", false).map((s) => s.name)).toEqual(["Chat"]);
  });

  it("skips the switched-off and the empty", () => {
    expect(snippetsFor(all, "bodyEnd", false).map((s) => s.name)).not.toContain("Off");
    expect(snippetsFor(all, "bodyEnd", false).map((s) => s.name)).not.toContain("Empty");
  });

  it("keeps everything off the checkout unless it says otherwise", () => {
    // The Payment Element keeps card fields in Stripe's iframe, but a script on
    // that page still reads the email and the name, and PCI asks a merchant to
    // authorise every script on a payment page. Opt in, never opt out.
    expect(snippetsFor(all, "head", true).map((s) => s.name)).toEqual(["Pixel"]);
    expect(snippetsFor(all, "bodyEnd", true)).toEqual([]);
  });

  it("defaults a new snippet to off-checkout and on", () => {
    const s = snip({});
    expect(s.onCheckout).toBe(false);
    expect(s.on).toBe(true);
  });
});

describe("turning a head snippet into tags React can hoist", () => {
  it("reads a script with a src and its flags", () => {
    const { tags } = parseHeadTags('<script async src="https://cdn.x/a.js"></script>');
    expect(tags).toHaveLength(1);
    expect(tags[0].tag).toBe("script");
    expect(tags[0].attrs.src).toBe("https://cdn.x/a.js");
    expect("async" in tags[0].attrs).toBe(true);
  });

  it("keeps an inline script's body", () => {
    const { tags } = parseHeadTags(`<script>window.dataLayer=[];</script>`);
    expect(tags[0].body).toContain("window.dataLayer");
  });

  it("reads several tags from one paste", () => {
    // What a vendor actually gives you: a loader and an inline init.
    const { tags } = parseHeadTags(
      `<script async src="https://x/gtag.js?id=A"></script>\n<script>gtag('js', new Date());</script>`,
    );
    expect(tags).toHaveLength(2);
    expect(tags[0].attrs.src).toContain("gtag.js");
    expect(tags[1].body).toContain("gtag(");
  });

  it("reads a verification meta", () => {
    const { tags } = parseHeadTags('<meta name="google-site-verification" content="abc123" />');
    expect(tags[0].tag).toBe("meta");
    expect(tags[0].attrs.content).toBe("abc123");
  });

  it("treats bare JavaScript as a script, because that is what it is", () => {
    const { tags } = parseHeadTags("console.log('hello')");
    expect(tags).toHaveLength(1);
    expect(tags[0].tag).toBe("script");
    expect(tags[0].body).toContain("console.log");
  });

  it("says what it cannot put in a head instead of dropping it quietly", () => {
    const { tags, unsupported } = parseHeadTags('<div>hi</div><script src="/a.js"></script>');
    expect(unsupported).toEqual(["div"]);
    expect(tags).toHaveLength(1);
  });

  it("does not choke on an empty snippet", () => {
    expect(parseHeadTags("").tags).toEqual([]);
    expect(parseHeadTags("   ").tags).toEqual([]);
  });
});

describe("attributes React will actually accept", () => {
  it("renames the ones React spells differently", () => {
    const a = reactAttrs({ class: "x", charset: "utf-8", "http-equiv": "refresh", crossorigin: "anonymous" });
    expect(a).toEqual({ className: "x", charSet: "utf-8", httpEquiv: "refresh", crossOrigin: "anonymous" });
  });

  it("turns a valueless async into true, not an empty string", () => {
    // `async=""` is falsy to React and the script would load blocking.
    expect(reactAttrs({ async: "" }).async).toBe(true);
    expect(reactAttrs({ defer: "" }).defer).toBe(true);
  });

  it("leaves an ordinary attribute alone", () => {
    expect(reactAttrs({ src: "/a.js", id: "one" })).toEqual({ src: "/a.js", id: "one" });
  });
});
