import { describe, it, expect } from "vitest";
import {
  LAYOUT_DEFAULTS, parseLayout, fillTags, fillLine, delayMs, starterDoc, docUrls, urlProblem, EMAIL_FONTS,
} from "@/lib/post-purchase-layout";

describe("layout", () => {
  it("defaults are the ones the owner approved in the prototype", () => {
    expect(LAYOUT_DEFAULTS).toEqual({
      desktopWidth: 600, mobileWidthPct: 100, desktopPadding: 32, mobilePadding: 20,
      fontFamily: "Arial, Helvetica, sans-serif", fontSize: 16, lineHeight: 1.6,
      textColor: "#1a1a1a", linkColor: "#c8653d", bodyColor: "#ffffff", backgroundColor: "#f1efe9",
      headerImageUrl: "",
    });
  });

  it("a stored layout that no longer parses falls back to the defaults, whole", () => {
    expect(parseLayout({ desktopWidth: 5000 })).toEqual(LAYOUT_DEFAULTS);
    expect(parseLayout(null)).toEqual(LAYOUT_DEFAULTS);
  });

  it("keeps a valid partial layout and fills the rest", () => {
    expect(parseLayout({ desktopWidth: 640 }).desktopWidth).toBe(640);
    expect(parseLayout({ desktopWidth: 640 }).mobilePadding).toBe(20);
  });

  it("offers only the eight email-safe fonts", () => {
    expect(EMAIL_FONTS.map((f) => f.label)).toEqual([
      "Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Courier New",
    ]);
  });
});

describe("personal details", () => {
  const vars = { first_name: "Priya", offer_name: "Funnel App", access_link: "https://grow.greaterinside.com/login" };

  it("fills known tags and drops unknown ones", () => {
    expect(fillTags("Hi {{ first_name }} {{nope}}", vars)).toBe("Hi Priya ");
  });

  it("a subject with no name reads as a sentence, not ', your ...'", () => {
    expect(fillLine("{{first_name}}, your Funnel App is ready", {})).toBe("Your Funnel App is ready");
    expect(fillLine("Hi {{first_name}}, welcome", {})).toBe("Hi, welcome");
    expect(fillLine("{{first_name}}, your Funnel App is ready", vars)).toBe("Priya, your Funnel App is ready");
  });

  it("a line the owner typed keeps its own first letter", () => {
    expect(fillLine("iPhone setup", vars)).toBe("iPhone setup");
    expect(fillLine("and one more thing", {})).toBe("and one more thing");
  });
});

describe("delays", () => {
  it("counts hours and days", () => {
    expect(delayMs(2, "hours")).toBe(7_200_000);
    expect(delayMs(3, "days")).toBe(259_200_000);
    expect(delayMs(-1, "days")).toBe(0);
  });
});

describe("addresses in a document", () => {
  it("finds link, button and image addresses", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://a.com" } }] }] },
        { type: "emailButton", attrs: { href: "{{access_link}}" } },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA", href: "http://b.com" } },
      ],
    };
    expect(docUrls(doc).sort()).toEqual(["data:image/png;base64,AAAA", "http://b.com", "https://a.com", "{{access_link}}"]);
  });

  it("accepts https and the access link, refuses everything else with a reason", () => {
    expect(urlProblem("https://a.com/x")).toBeNull();
    expect(urlProblem("{{access_link}}")).toBeNull();
    expect(urlProblem("http://a.com")).toMatch(/https/);
    expect(urlProblem("data:image/png;base64,AAAA")).toMatch(/upload/);
    expect(urlProblem("not a link")).toMatch(/not a web address/);
  });

  it("the starter email has a first-name tag and an access-link button", () => {
    const d = starterDoc("Funnel App");
    expect(JSON.stringify(d)).toContain('"mergeTag"');
    expect(docUrls(d)).toEqual(["{{access_link}}"]);
  });
});

describe("the header image", () => {
  it("is optional, and only an https address", () => {
    expect(parseLayout({ headerImageUrl: "https://x.co/h.png" }).headerImageUrl).toBe("https://x.co/h.png");
    expect(parseLayout({}).headerImageUrl).toBe("");
    // Anything else fails the whole layout, which falls back to the defaults.
    expect(parseLayout({ headerImageUrl: "http://x.co/h.png" }).headerImageUrl).toBe("");
    expect(parseLayout({ headerImageUrl: "data:image/png;base64,AAAA" }).headerImageUrl).toBe("");
  });
});
