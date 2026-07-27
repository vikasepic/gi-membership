import { describe, it, expect } from "vitest";
import { sanitizeBodyHtml } from "@/lib/sanitize-html";

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
