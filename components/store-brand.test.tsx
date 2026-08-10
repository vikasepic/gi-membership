import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBrand } from "@/components/store-brand";
import { SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";
import { normalizeSiteTypography } from "@/lib/site-typography";

/**
 * The one stylesheet every store page carries.
 *
 * Its ORDER is load-bearing and was pinned by nothing: faces before the rules
 * that name them, the site's type before the variables it reads, and the
 * owner's own CSS last so it can beat both. Reordering that array breaks all
 * three silently — a font resolves to the fallback, a variable is read before
 * it is set, and the box the owner types into stops working.
 */

const of = (s: Partial<Settings>, fonts: Parameters<typeof StoreBrand>[0]["fonts"] = []) =>
  renderToStaticMarkup(
    <StoreBrand settings={{ ...SETTINGS_DEFAULTS, name: "Greater Inside", ...s }} fonts={fonts} />,
  );

const FONT = [
  { id: "f1", family: "Lora", source: "custom", files: [{ path: "fonts/lora.woff2", weight: 400, style: "normal" }] },
] as unknown as Parameters<typeof StoreBrand>[0]["fonts"];

describe("the store's own stylesheet", () => {
  it("ships nothing when nothing is set", () => {
    // An untouched store must cost zero bytes. Not an empty <style> — none.
    expect(of({})).toBe("");
  });

  it("declares the faces before anything names them", () => {
    const html = of({ headingFont: "Lora", siteTypography: normalizeSiteTypography({ h1: { family: "Lora" } }) }, FONT);
    expect(html.indexOf("@font-face")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("@font-face")).toBeLessThan(html.indexOf(":root h1"));
  });

  it("writes the type before the variables it reads", () => {
    // `:root h1{font-family:"Lora", var(--font-heading), …}` reads a variable
    // the next rule sets. Both orders compute the same, but the comment says
    // this one and a reader who trusts the comment must be right.
    const html = of({ headingFont: "Lora", siteTypography: normalizeSiteTypography({ h1: { family: "Lora" } }) }, FONT);
    expect(html.indexOf(":root h1")).toBeLessThan(html.indexOf("--font-heading:"));
  });

  it("puts the owner's own CSS last, so it can beat everything above it", () => {
    const html = of({
      customCss: "h1 { color: rebeccapurple }",
      siteTypography: normalizeSiteTypography({ h1: { color: "#123456" } }),
    });
    expect(html.indexOf("rebeccapurple")).toBeGreaterThan(html.indexOf(":root h1"));
  });

  it("cannot be ended early by the owner's own CSS or JS", () => {
    // Both elements are raw text and close at the first `</style` / `</script`
    // whatever the author meant — the per-page pair in sales-page.tsx has been
    // treated since it was written and this one had not. The CSS loses the
    // sequence; the JS keeps its meaning and escapes it.
    const html = of({
      customCss: "a{color:red}</style><img src=x onerror=alert(1)>",
      customJs: 'document.write("</script><img src=x onerror=alert(1)>")',
    });
    expect(html).not.toContain("</style><img");
    expect(html).not.toContain("</script><img");
    expect(html).toContain("<\\/script>");
  });

  it("names a built-in font by the variable that actually holds it", () => {
    // next/font compiles Inter to a hashed family name; `"Inter"` matches no
    // face this store serves and lands on whatever the visitor has installed.
    const html = of({ headingFont: "Inter", bodyFont: "Lora" }, FONT);
    expect(html).toContain('--font-heading:var(--font-inter, "Inter")');
    // An installed family keeps its own name — that is the name @font-face
    // declared it under.
    expect(html).toContain('--font-body:"Lora"');
  });

  it("emits the site's type at all, which is the whole of the feature", () => {
    expect(of({ siteTypography: normalizeSiteTypography({ h2: { desktop: { size: "41px" } } }) }))
      .toContain(":root h2{font-size:41px}");
  });
});
