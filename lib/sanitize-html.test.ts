import { describe, it, expect } from "vitest";
import { sanitizeBodyHtml, sanitizeBlockHtml } from "@/lib/sanitize-html";

describe("sanitizeBodyHtml", () => {
  it("keeps formatting tags used by the editor", () => {
    const html = "<h2>Title</h2><p><strong>bold</strong> and <em>italic</em></p><ul><li>one</li></ul>";
    expect(sanitizeBodyHtml(html)).toBe(html);
  });

  it("keeps links and images with their attributes", () => {
    const html = '<a href="https://example.com">link</a><img src="/api/media/item/1/0" alt="pic" />';
    const out = sanitizeBodyHtml(html);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('src="/api/media/item/1/0"');
    expect(out).toContain('alt="pic"');
  });

  it("strips script tags and their contents", () => {
    expect(sanitizeBodyHtml('<p>hi</p><script>alert(1)</script>')).toBe("<p>hi</p>");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeBodyHtml('<img src="x" onerror="alert(1)" />');
    expect(out).not.toContain("onerror");
  });

  it("strips iframes (video is a separate embed field)", () => {
    expect(sanitizeBodyHtml('<iframe src="https://evil.com"></iframe>')).toBe("");
  });

  it("strips javascript: urls", () => {
    const out = sanitizeBodyHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("returns an empty string for null-ish input", () => {
    expect(sanitizeBodyHtml("")).toBe("");
  });
});

describe("sanitizeBlockHtml and <picture> art direction", () => {
  // A <picture> whose <source> loses srcset/media/type collapses to its <img>
  // fallback, so every screen gets the one crop. Found building the
  // Foundations Weekend page: the design serves a tall 900x1125 portrait below
  // 640px and a wide 2000x909 one above, and phones were getting the wide one.
  const picture =
    '<picture>' +
    '<source media="(max-width: 640px)" srcset="/tall.webp" type="image/webp">' +
    '<source srcset="/wide.webp" type="image/webp">' +
    '<img src="/wide.jpg" alt="Ajit Nawalkha" width="2000" height="909" loading="lazy">' +
    '</picture>';

  it("keeps the attributes that choose which crop loads", () => {
    const out = sanitizeBlockHtml(picture);
    expect(out).toContain('media="(max-width: 640px)"');
    expect(out).toContain('srcset="/tall.webp"');
    expect(out).toContain('srcset="/wide.webp"');
    expect(out).toContain('type="image/webp"');
  });

  it("still refuses a script and an event handler inside one", () => {
    // Widening <source> must not widen anything else: these are the reason the
    // allowlist exists, on a page that shares a document with Stripe's payment
    // element.
    const out = sanitizeBlockHtml(
      '<picture><source srcset="/a.webp" onload="alert(1)"><img src="/a.jpg"></picture><script>alert(2)</script>',
    );
    expect(out).not.toContain("onload");
    expect(out).not.toContain("alert(2)");
    expect(out).not.toContain("<script");
  });

  it("refuses a javascript: url in a srcset", () => {
    const out = sanitizeBlockHtml('<picture><source srcset="javascript:alert(1)"></picture>');
    expect(out).not.toContain("javascript:");
  });
});

describe("decorative markup", () => {
  // The Foundations Weekend hero draws two calendar tiles, SAT 14 and SUN 15,
  // which repeat the date already written in the sentence beside them. The
  // design marks them aria-hidden so a screen reader reads the date once.
  // Without the attribute they are announced twice.
  it("keeps aria-hidden, so decoration is not read out", () => {
    const out = sanitizeBlockHtml('<div class="cal" aria-hidden="true"><div class="cal-tile"><b>SAT</b></div></div>');
    expect(out).toContain('aria-hidden="true"');
  });

  it("does not let aria-hidden drag in other attributes", () => {
    const out = sanitizeBlockHtml('<div aria-hidden="true" onclick="alert(1)" data-x="1">x</div>');
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("data-x");
  });
});

describe("controls that cannot be a <button>", () => {
  // RICH_TAGS has no <button>, so the story carousel's prev/next become
  // anchors. Without role and the aria pair they are an unlabelled link that
  // never says it is spent, and the CSS dims on [aria-disabled].
  it("keeps role, aria-label and aria-disabled on a link acting as a control", () => {
    const out = sanitizeBlockHtml(
      '<a class="arrow prev" id="prev" role="button" aria-label="Previous story" aria-disabled="true"></a>',
    );
    expect(out).toContain('role="button"');
    expect(out).toContain('aria-label="Previous story"');
    expect(out).toContain('aria-disabled="true"');
  });
});
