import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PageSettings } from "@/lib/pages";
import { SalesPage } from "@/components/page/sales-page";
import { defaultRows } from "@/lib/page-sections";

// Page-level custom code goes onto a page that ends at a Stripe checkout, so
// what it can and cannot do to the markup is worth pinning down.

const rows = () => defaultRows();
const money = { priceLabel: "$29", termsLabel: null };

// Filled in from the empty defaults, so a fixture only names what it is testing
// and gaining a field here does not mean editing every case below.
const render = (settings?: Partial<PageSettings>) =>
  renderToStaticMarkup(
    <SalesPage
      rows={rows()}
      money={money}
      settings={settings && { customCss: "", customJs: "", snippets: [], ...settings }}
    />,
  );

describe("page-level custom code", () => {
  it("emits neither element when there is none", () => {
    const out = render({ customCss: "", customJs: "", snippets: [] });
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<style");
  });

  it("emits neither element when the page has no settings row at all", () => {
    expect(render()).not.toContain("<script");
  });

  it("puts the CSS on the page", () => {
    expect(render({ customCss: ".hero h1 { color: red }", customJs: "", snippets: [] })).toContain(
      ".hero h1 { color: red }",
    );
  });

  it("runs the JS after the sections, not before them", () => {
    const out = render({ customCss: "", customJs: "console.log(1)", snippets: [] });
    expect(out.indexOf("<script")).toBeGreaterThan(out.indexOf("</section>"));
  });

  it("does not let CSS close the style element", () => {
    const out = render({ customCss: "a{color:red}</style><img src=x onerror=alert(1)>", customJs: "", snippets: [] });
    // The payload may survive as text inside the element — harmless. What must
    // not survive is the closing tag that would turn it into markup.
    expect(out.match(/<\/style>/g)?.length).toBe(1);
    expect(out).not.toContain("</style><img");
  });

  it("does not let JS close the script element", () => {
    // The classic one: a string containing </script> ends the element, and
    // everything after it lands on the page as markup.
    const out = render({ customCss: "", customJs: 'var a = "</script><img src=x onerror=alert(1)>"', snippets: [] });
    expect(out.match(/<\/script>/g)?.length).toBe(1);
    expect(out).toContain("<\\/script>");
  });

  it("leaves ordinary JS alone", () => {
    const js = "document.querySelectorAll('a').forEach(function (a) { a.dataset.x = 1 })";
    expect(render({ customCss: "", customJs: js, snippets: [] })).toContain(js);
  });

  /**
   * "Where do I add an external library?" — the panel now answers it, and this
   * is the answer working. The custom-code box is the INSIDE of a script tag,
   * so a `<script src>` typed there is not JavaScript; appending one is.
   */
  it("lets custom JavaScript load a library from a CDN", () => {
    const js = [
      'const s = document.createElement("script");',
      's.src = "https://cdn.example.com/library.js";',
      "document.head.appendChild(s);",
    ].join("\n");
    const out = render({ customCss: "", customJs: js, snippets: [] });
    // Survives verbatim: nothing in it needs escaping, so nothing is escaped.
    expect(out).toContain('s.src = "https://cdn.example.com/library.js";');
    expect(out).toContain("document.head.appendChild(s)");
  });

  it("still refuses to let a pasted closing tag end the script early", () => {
    // The same guard, checked against the shape someone reaches for when they
    // are trying to paste a tag in rather than append one.
    const out = render({ customCss: "", customJs: '// </script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain("</script><img");
    expect(out).toContain("<\\/script>");
  });

  /**
   * The per-page list, which is where a `<script>` tag actually goes. The CSS
   * and JS boxes above it cannot take one — the JS box is the inside of a
   * script element — and the HTML block strips script, style and iframe on
   * save because it is page content that arrives from imports and direct
   * writes as well as from the editor.
   */
  it("emits this page's own snippets", () => {
    const out = render({
      snippets: [
        { name: "loader", place: "bodyEnd", code: '<script src="/v.js"></script>', on: true, onCheckout: false },
      ],
    });
    expect(out).toContain('src="/v.js"');
  });

  it("puts a page's head snippet where React can hoist it", () => {
    const out = render({
      snippets: [
        { name: "verify", place: "head", code: '<meta name="x-verify" content="abc" />', on: true, onCheckout: false },
      ],
    });
    expect(out).toContain('name="x-verify"');
  });

  it("leaves a switched-off snippet out", () => {
    const out = render({
      snippets: [{ name: "off", place: "bodyEnd", code: "<script>nope()</script>", on: false, onCheckout: false }],
    });
    expect(out).not.toContain("nope()");
  });

  it("does not sanitise them, unlike the HTML block", () => {
    // The distinction the whole feature rests on: a block is content and is
    // cleaned; this list is settings, edited behind requireAdmin by somebody
    // who can already run site-wide JavaScript.
    const out = render({
      snippets: [{ name: "inline", place: "bodyEnd", code: "<script>window.x=1</script>", on: true, onCheckout: false }],
    });
    expect(out).toContain("window.x=1");
  });
});
