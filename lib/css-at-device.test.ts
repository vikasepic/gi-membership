import { describe, it, expect } from "vitest";
import { cssAtDevice, queryMatches } from "@/lib/css-at-device";

/**
 * Page CSS in the builder canvas.
 *
 * Reported 16 Sep 2026: "the CSS from custom code is not working" — a
 * `@media (max-width: 640px)` rule shrinking a hero's background on phones.
 * It worked on the live page; in the canvas, a 390px column inside a wide
 * window, the query asked the window and never fired. The canvas has to
 * answer the query the way the device it is drawing would.
 */
const CSS = `.a{color:red}
@media (max-width: 640px) {
  #section-hero{ background-size: 300px !important; }
  .b{color:blue}
}
@media (min-width: 1024px) { .c{color:green} }
@media screen and (max-width:1023px), print { .d{x:1} }
.e{color:black}`;

describe("cssAtDevice", () => {
  it("unwraps the phone's own rules on the phone and drops the desktop's", () => {
    const out = cssAtDevice(CSS, "mobile");
    expect(out).toContain("#section-hero{ background-size: 300px !important; }");
    expect(out).toContain(".b{color:blue}");
    expect(out).not.toContain("@media");
    expect(out).not.toContain(".c{color:green}");
    expect(out).toContain(".d{x:1}");
    expect(out).toContain(".a{color:red}");
    expect(out).toContain(".e{color:black}");
  });
  it("keeps the desktop's rules on the desktop and drops the phone's", () => {
    const out = cssAtDevice(CSS, "desktop");
    expect(out).not.toContain("300px");
    expect(out).toContain(".c{color:green}");
    expect(out).not.toContain(".d{x:1}");
  });
  it("leaves other at-rules and nested braces alone", () => {
    const css = "@keyframes k{from{a:1}to{a:2}} @media (max-width:500px){@supports (x:y){.n{z:1}}}";
    expect(cssAtDevice(css, "desktop")).toBe("@keyframes k{from{a:1}to{a:2}} ");
    expect(cssAtDevice(css, "mobile")).toBe("@keyframes k{from{a:1}to{a:2}} @supports (x:y){.n{z:1}}");
  });
  it("answers range syntax and em units", () => {
    expect(queryMatches("(width <= 640px)", 390)).toBe(true);
    expect(queryMatches("(width > 640px)", 390)).toBe(false);
    expect(queryMatches("(max-width: 40em)", 390)).toBe(true);
    expect(queryMatches("(hover: hover)", 390)).toBe(true);
  });
  it("survives an unclosed block rather than eating the page", () => {
    expect(cssAtDevice("@media (max-width:640px){.x{a:1}", "mobile")).toBe(".x{a:1}");
  });
});
