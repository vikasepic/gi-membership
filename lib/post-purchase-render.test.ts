import { describe, it, expect } from "vitest";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { starterDoc } from "@/lib/post-purchase-layout";

const vars = { first_name: "Priya", offer_name: "Funnel App", access_link: "https://grow.greaterinside.com/login" };
const render = (over: Partial<Parameters<typeof renderPostPurchaseEmail>[0]> = {}) =>
  renderPostPurchaseEmail({ doc: starterDoc("Funnel App"), subject: "{{first_name}}, you're in", preheader: "Start here", layout: {}, vars, stopUrl: null, ...over });

describe("the email a buyer receives", () => {
  it("fills the subject and the body's personal details", () => {
    const m = render();
    expect(m.subject).toBe("Priya, you're in");
    expect(m.html).toContain("Hi Priya, you're in.");
    expect(m.html).toContain('href="https://grow.greaterinside.com/login"');
  });

  it("a buyer with no name gets 'Hi, you're in.', never 'Hi , you're in.'", () => {
    const m = render({ vars: { ...vars, first_name: "" } });
    expect(m.html).toContain("Hi, you're in.");
    expect(m.html).not.toContain("Hi , ");
    expect(m.subject).toBe("You're in");
  });

  it("uses the desktop width in the body table and the mobile width in the media rule", () => {
    const m = render({ layout: { desktopWidth: 640, mobileWidthPct: 90, mobilePadding: 12 } });
    expect(m.html).toContain("max-width:640px");
    expect(m.html).toMatch(/@media only screen and \(max-width:\s*672px\)/);
    expect(m.html).toContain("width:90% !important");
    expect(m.html).toContain("padding:12px !important");
  });

  it("carries the preview text as the hidden first line", () => {
    expect(render().html).toMatch(/<span style="display:none[^"]*">Start here<\/span>/);
  });

  it("draws a button as a table, so Outlook keeps it", () => {
    expect(render().html).toMatch(/<table role="presentation"[^>]*>\s*<tr>\s*<td style="border-radius:6px;background:#c8653d;">\s*<a href="https:\/\/grow\.greaterinside\.com\/login"/);
  });

  it("escapes what the owner typed", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<script>x</script> & co" }] }] };
    const m = render({ doc });
    expect(m.html).toContain("&lt;script&gt;x&lt;/script&gt; &amp; co");
  });

  it("drops a link or image that is not https rather than sending it", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "x" } },
      ],
    };
    const m = render({ doc });
    expect(m.html).not.toContain("javascript:");
    expect(m.html).not.toContain("data:image");
    expect(m.html).toContain("click");
  });

  it("applies font, size and colour from the text style, and only email-safe fonts", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "text", text: "styled", marks: [{ type: "textStyle", attrs: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "20px", color: "#112233" } }] },
        { type: "text", text: "sneaky", marks: [{ type: "textStyle", attrs: { fontFamily: "Comic Sans MS", fontSize: "400px", color: "red;background:url(x)" } }] },
      ] }],
    };
    const m = render({ doc });
    expect(m.html).toContain(`<span style="font-family:Georgia, 'Times New Roman', serif;font-size:20px;color:#112233;">styled</span>`);
    expect(m.html).toContain(">sneaky<");
    expect(m.html).not.toContain("Comic Sans");
    expect(m.html).not.toContain("400px");
    expect(m.html).not.toContain("url(x)");
  });

  it("puts the stop link and footer on follow-ups only", () => {
    expect(render().html).not.toContain("Stop these emails");
    const f = render({ stopUrl: "https://grow.greaterinside.com/email/stop?t=abc" });
    expect(f.html).toContain('href="https://grow.greaterinside.com/email/stop?t=abc"');
    expect(f.html).toContain("You are getting this because you bought Funnel App.");
    expect(f.text).toContain("Stop these emails: https://grow.greaterinside.com/email/stop?t=abc");
  });

  it("gives a plain-text part with the links written out", () => {
    const t = render().text;
    expect(t).toContain("Hi Priya, you're in.");
    expect(t).toContain("Open your library: https://grow.greaterinside.com/login");
    expect(t).not.toContain("<");
  });

  it("renders headings, lists, a divider and alignment", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [{ type: "text", text: "Steps" }] },
        { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] }] },
        { type: "horizontalRule" },
      ],
    };
    const h = render({ doc }).html;
    expect(h).toMatch(/<h2 style="[^"]*text-align:center;[^"]*">Steps<\/h2>/);
    expect(h).toMatch(/<ol[^>]*><li[^>]*>One<\/li><\/ol>/);
    expect(h).toContain("<hr ");
  });

  it("sizes an image to the content width, not the whole body, so Outlook does not stretch it", () => {
    const doc = { type: "doc", content: [{ type: "image", attrs: { src: "https://grow.greaterinside.com/a.png", alt: "" } }] };
    // 600 wide, 32 padding each side: 536.
    expect(render({ doc }).html).toContain('width="536"');
  });

  it("fills a personal detail typed into the text or a button label", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello {{first_name}}" }] },
        { type: "emailButton", attrs: { label: "Open {{offer_name}}", href: "{{access_link}}" } },
      ],
    };
    const m = render({ doc });
    expect(m.html).toContain("Hello Priya");
    expect(m.html).toContain(">Open Funnel App</a>");
    expect(m.text).toContain("Hello Priya");
    expect(m.text).toContain("Open Funnel App: https://grow.greaterinside.com/login");
    expect(m.html).not.toContain("{{");
  });

  it("a malformed document renders what it can instead of throwing", () => {
    // Paragraph and heading with non-array content (number, object) are skipped, good paragraph kept
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: 42 },
        { type: "heading", attrs: { level: 2 }, content: {} },
        { type: "paragraph", content: [{ type: "text", text: "kept" }] },
      ],
    };
    const m = render({ doc });
    expect(m.html).toContain("kept");
    expect(m.text).toContain("kept");
    expect(() => render({ doc })).not.toThrow();
  });

  it("puts the header image edge to edge above the padded body, and only when there is one", () => {
    const withHeader = render({ layout: { headerImageUrl: "https://x.co/header.png" } }).html;
    const img = withHeader.indexOf('<img src="https://x.co/header.png"');
    expect(img).toBeGreaterThan(-1);
    expect(img).toBeLessThan(withHeader.indexOf('class="pp-pad"'));
    expect(withHeader).toMatch(/<td style="padding:0;[^"]*">\s*<img src="https:\/\/x\.co\/header\.png"[^>]*width="600"/);
    expect(render().html).not.toContain("header.png");
  });
});
