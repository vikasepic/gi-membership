import { describe, it, expect } from "vitest";
import {
  PREVIEW_SCOPE,
  SITE_TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_ELEMENTS,
  metricIsValid,
  normalizeSiteTypography,
  siteTypographyCss,
  siteTypographyCssAt,
  type SiteTypography,
} from "@/lib/site-typography";
import { DEVICE_MAX } from "@/lib/blocks";

/** The defaults with one element patched, which is how the panel will write. */
const withElement = (el: string, patch: unknown): SiteTypography =>
  normalizeSiteTypography({ [el]: patch });

describe("the typography model", () => {
  it("starts entirely empty, and empty means no stylesheet at all", () => {
    for (const el of TYPOGRAPHY_ELEMENTS) {
      const e = SITE_TYPOGRAPHY_DEFAULTS[el];
      // Every leaf, checked as a leaf. The previous version spread three empty
      // strings into the object before asking whether any value was empty, so
      // it could not fail whatever the defaults held.
      const { desktop, tablet, mobile, ...flat } = e;
      expect(Object.values(flat), el).toEqual(["", "", "", "", "", ""]);
      for (const m of [desktop, tablet, mobile]) {
        expect(Object.values(m), el).toEqual(["", "", "", "", ""]);
      }
    }
    expect(siteTypographyCss(SITE_TYPOGRAPHY_DEFAULTS)).toBe("");
  });

  it("survives a round trip through JSON", () => {
    const set = normalizeSiteTypography({
      h1: { family: "Playfair Display", weight: "700", desktop: { size: "48px" }, mobile: { size: "2rem" } },
      body: { color: "#334455", tablet: { lineHeight: "1.6" } },
    });
    expect(normalizeSiteTypography(JSON.parse(JSON.stringify(set)))).toEqual(set);
  });

  it("takes anything at all without throwing", () => {
    for (const junk of [null, undefined, 7, "nope", [], { h1: 4 }, { h1: { desktop: null } }]) {
      expect(normalizeSiteTypography(junk)).toEqual(SITE_TYPOGRAPHY_DEFAULTS);
    }
  });

  it("drops a value whose unit is not one this field allows", () => {
    const t = withElement("h1", {
      desktop: { size: "12pt", lineHeight: "1.4", letterSpacing: "-1px", wordSpacing: "2vw" },
      weight: "650",
      style: "oblique",
    });
    expect(t.h1.desktop.size).toBe("");
    expect(t.h1.desktop.wordSpacing).toBe("");
    expect(t.h1.weight).toBe("");
    expect(t.h1.style).toBe("");
    // The ones that were legal are still there.
    expect(t.h1.desktop.lineHeight).toBe("1.4");
    expect(t.h1.desktop.letterSpacing).toBe("-1px");
  });
});

describe("the panel's own validity check", () => {
  // The panel says "that will be dropped" while a value is being typed, and it
  // has to say it against the rule the save acts on. These are the cases where
  // a second, hand-written copy of the regexes would quietly disagree.
  const CASES: [keyof typeof SITE_TYPOGRAPHY_DEFAULTS.body.desktop, string, boolean][] = [
    ["size", "18px", true],
    ["size", "1.2rem", true],
    ["size", "18", false],
    ["size", "18 px", false],
    ["size", "-18px", false],
    ["lineHeight", "1.5", true],
    ["lineHeight", "24px", true],
    ["lineHeight", "-1", false],
    ["letterSpacing", "-0.02em", true],
    ["letterSpacing", "0.5", false],
    ["wordSpacing", "2px", true],
    ["paragraphSpacing", "1rem", true],
    ["paragraphSpacing", "1", false],
  ];

  it.each(CASES)("agrees with the schema about %s = %s", (field, raw, valid) => {
    expect(metricIsValid(field, raw)).toBe(valid);
    // The schema is the authority: what it keeps is what the panel must call
    // valid, and what it blanks is what the panel must warn about.
    const kept = normalizeSiteTypography({ body: { desktop: { [field]: raw } } }).body.desktop[field];
    expect(kept !== "").toBe(valid);
  });

  it("calls empty valid, because empty is how a field says inherit", () => {
    expect(metricIsValid("size", "")).toBe(true);
    expect(metricIsValid("size", "   ")).toBe(true);
  });
});

describe("the CSS writer", () => {
  it("emits every field that is set, and only those", () => {
    const css = siteTypographyCss(
      withElement("h2", {
        family: "Inter Tight",
        weight: "800",
        style: "italic",
        transform: "uppercase",
        decoration: "underline",
        color: "#112233",
        desktop: { size: "2rem", lineHeight: "1.1", letterSpacing: "-0.5px", wordSpacing: "1px" },
      }),
    );
    expect(css).toBe(
      ':root h2{font-family:"Inter Tight", var(--font-heading), system-ui, sans-serif;' +
        "font-weight:800;font-style:italic;text-transform:uppercase;text-decoration:underline;" +
        "color:#112233;font-size:2rem;line-height:1.1;letter-spacing:-0.5px;word-spacing:1px}",
    );
  });

  it("gives every element the selector that beats the hardcoded classes", () => {
    const expected: Record<string, string> = {
      body: ":root body",
      link: ":root a",
      linkHover: ":root a:hover",
      list: ":root ul, :root ol",
      blockquote: ":root blockquote",
      h1: ":root h1",
      h2: ":root h2",
      h3: ":root h3",
      h4: ":root h4",
      h5: ":root h5",
      h6: ":root h6",
    };
    for (const el of TYPOGRAPHY_ELEMENTS) {
      expect(siteTypographyCss(withElement(el, { color: "#010203" }))).toBe(
        `${expected[el]}{color:#010203}`,
      );
    }
  });

  it("writes paragraph spacing onto p, and only for body", () => {
    expect(siteTypographyCss(withElement("body", { desktop: { paragraphSpacing: "1.2em" } }))).toBe(
      ":root p{margin-bottom:1.2em}",
    );
    expect(siteTypographyCss(withElement("h3", { desktop: { paragraphSpacing: "1.2em" } }))).toBe("");
  });

  it("puts per-device values behind the app's own two widths, tablet first", () => {
    const css = siteTypographyCss(
      withElement("h1", {
        desktop: { size: "48px" },
        tablet: { size: "36px" },
        mobile: { size: "28px", paragraphSpacing: "9px" },
      }),
    );
    expect(css).toBe(
      ":root h1{font-size:48px}" +
        `@media (max-width:${DEVICE_MAX.tablet}px){:root h1{font-size:36px}}` +
        `@media (max-width:${DEVICE_MAX.mobile}px){:root h1{font-size:28px}}`,
    );
    expect(DEVICE_MAX.tablet).toBe(1023);
    expect(DEVICE_MAX.mobile).toBe(767);
  });

  it("never restates the not-per-device half inside a media query", () => {
    const css = siteTypographyCss(
      withElement("body", { family: "Lora", color: "#000000", mobile: { size: "15px" } }),
    );
    expect(css).toBe(
      ':root body{font-family:"Lora", var(--font-body), system-ui, sans-serif;color:#000000}' +
        "@media (max-width:767px){:root body{font-size:15px}}",
    );
  });

  it("emits no media query for a device that sets nothing", () => {
    expect(siteTypographyCss(withElement("h1", { desktop: { size: "40px" } }))).toBe(
      ":root h1{font-size:40px}",
    );
  });

  it("cannot be escaped by a hostile family name", () => {
    const css = siteTypographyCss(
      withElement("h1", { family: 'Foo"; } :root * { display:none } .x{color:red' }),
    );
    expect(css).toBe(
      ':root h1{font-family:"Foo  root   displaynone  xcolorred", var(--font-heading), system-ui, sans-serif}',
    );
    expect(css).not.toContain(";");
    expect(css.match(/[{}]/g)).toHaveLength(2);
  });

  it("cannot be escaped by a hostile colour or measurement", () => {
    const css = siteTypographyCss(
      withElement("body", { color: "red;background:url(x)", desktop: { size: "1px}*{color:red" } }),
    );
    expect(css).toBe("");
  });
});

describe("the same type inside the admin", () => {
  const scope = `.${PREVIEW_SCOPE}`;

  it("names the preview's class instead of :root, at the same specificity", () => {
    const css = siteTypographyCss(
      withElement("h1", { desktop: { size: "40px" } }),
      scope,
    );
    // 0-1-1 either way, so a block's `.bk-x.bk-x` (0-2-0) still beats it here
    // exactly as it does on the page.
    expect(css).toBe(`${scope} h1{font-size:40px}`);
    expect(css).not.toContain(":root");
  });

  it("treats the scope element as the preview's body", () => {
    // A preview has no <body> of its own — `.site-type body` would match
    // nothing at all and the body settings would silently do nothing.
    expect(siteTypographyCss(withElement("body", { desktop: { size: "17px" } }), scope)).toBe(
      `${scope}{font-size:17px}`,
    );
    expect(siteTypographyCss(withElement("body", { desktop: { paragraphSpacing: "1em" } }), scope)).toBe(
      `${scope} p{margin-bottom:1em}`,
    );
    expect(siteTypographyCss(withElement("list", { desktop: { size: "15px" } }), scope)).toBe(
      `${scope} ul, ${scope} ol{font-size:15px}`,
    );
  });

  it("writes one width with no media query, wider widths first", () => {
    // The canvas is 390px wide inside a 1900px window, so no max-width query
    // fires there. Order is the fallback: a phone that sets only a size still
    // gets the desktop weight.
    const t = withElement("h1", {
      desktop: { size: "48px", lineHeight: "1.1" },
      tablet: { size: "36px" },
      mobile: { size: "28px" },
    });
    expect(siteTypographyCssAt(t, "mobile", scope)).toBe(
      `${scope} h1{font-size:48px;line-height:1.1}${scope} h1{font-size:36px}${scope} h1{font-size:28px}`,
    );
    expect(siteTypographyCssAt(t, "tablet", scope)).toBe(
      `${scope} h1{font-size:48px;line-height:1.1}${scope} h1{font-size:36px}`,
    );
    expect(siteTypographyCssAt(t, "desktop", scope)).toBe(`${scope} h1{font-size:48px;line-height:1.1}`);
    expect(siteTypographyCssAt(t, "mobile", scope)).not.toContain("@media");
  });

  it("still ships nothing when nothing is set", () => {
    expect(siteTypographyCss(SITE_TYPOGRAPHY_DEFAULTS, scope)).toBe("");
    for (const device of ["desktop", "tablet", "mobile"] as const) {
      expect(siteTypographyCssAt(SITE_TYPOGRAPHY_DEFAULTS, device, scope)).toBe("");
    }
  });
});
