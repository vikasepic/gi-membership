import { describe, it, expect } from "vitest";
import { homeJsonLd, llmsText, jsonLdText, offerLine, type SellableLine } from "@/lib/structured-data";
import type { Offer } from "@/lib/types";
import { SETTINGS_SCHEMA, type Settings } from "@/lib/settings-schema";

const make = (over: Record<string, unknown>): Settings => ({ ...SETTINGS_SCHEMA.parse(over), name: String(over.name ?? "S") });

/**
 * The storefront's structured data and llms.txt.
 *
 * Asked for 18 Sep 2026: the home page is public and should be found by
 * search, answer and generative engines alike. What has to hold is that
 * every fact comes from the store's own rows — a price here is the page's
 * price — and that nothing in the payload can break out of its script tag.
 */
const settings = make({
  name: "Greater Inside Membership",
  legalEntity: "Infinite Creative",
  metaTitle: "Greater Inside: 12-Month Reset",
  metaDescription: "A 12-month journey.",
  shareImagePath: "https://greaterinside.com/x.jpg",
  socialInstagram: "https://instagram.com/gi",
  contactEmail: "support@greaterinside.com",
});
const base = "https://grow.greaterinside.com";
const lines: SellableLine[] = [
  { name: "Book Writer", description: "Write it", url: `${base}/p/book-writer`, image: null, priceCents: 4700, currency: "usd", interval: null },
  { name: "Content Engine", description: null, url: `${base}/o/content-engine`, image: null, priceCents: 2900, currency: "usd", interval: "month" },
];
const faqs = [{ q: "Is there a refund?", a: "Yes, <b>14 days</b>." }];

describe("homeJsonLd", () => {
  const graph = homeJsonLd({ settings, base, lines, faqs })["@graph"] as Record<string, unknown>[];
  const of = (t: string) => graph.find((n) => n["@type"] === t)!;
  it("names the business as registered, and the site as traded", () => {
    expect(of("Organization")).toMatchObject({ name: "Infinite Creative", email: "support@greaterinside.com", sameAs: ["https://instagram.com/gi"] });
    expect(of("WebSite")).toMatchObject({ name: "Greater Inside Membership", url: base });
    expect(of("WebPage")).toMatchObject({ name: "Greater Inside: 12-Month Reset", description: "A 12-month journey." });
  });
  it("lists what is for sale at the page's own price, and says when it recurs", () => {
    const items = (of("ItemList").itemListElement as Record<string, unknown>[]).map((e) => e.item as Record<string, unknown>);
    expect(items[0]).toMatchObject({ "@type": "Product", name: "Book Writer", offers: { price: "47.00", priceCurrency: "USD" } });
    expect((items[1].offers as Record<string, unknown>).priceSpecification).toMatchObject({ unitCode: "MON", price: "29.00" });
    expect((items[0].offers as Record<string, unknown>).priceSpecification).toBeUndefined();
  });
  it("carries the page's questions as an FAQPage", () => {
    expect(of("FAQPage")).toMatchObject({ mainEntity: [{ name: "Is there a refund?" }] });
  });
  it("leaves out what the store has not said", () => {
    const bare = homeJsonLd({ settings: make({ name: "S" }), base, lines: [], faqs: [] })["@graph"] as Record<string, unknown>[];
    expect(bare.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebPage"]);
    expect(bare[0]).not.toHaveProperty("sameAs");
  });
  it("cannot close its own script tag", () => {
    expect(jsonLdText({ a: "</script><script>alert(1)</script>" })).not.toContain("</");
  });
});

describe("llmsText", () => {
  const text = llmsText({ settings, base, lines, faqs });
  it("reads as a page about the store with real links and prices", () => {
    expect(text.startsWith("# Greater Inside Membership\n")).toBe(true);
    expect(text).toContain("> A 12-month journey.");
    expect(text).toContain(`- [Book Writer](${base}/p/book-writer) — USD 47.00: Write it`);
    expect(text).toContain(`- [Content Engine](${base}/o/content-engine) — USD 29.00 per month`);
    expect(text).toContain("- **Is there a refund?** Yes, 14 days.");
    expect(text).toContain("- [Terms](https://greaterinside.com/terms-and-conditions/)");
  });
});

describe("offerLine", () => {
  it("names the offer by its own name and keeps the headline as the description", () => {
    // Three Content Engine channels share one headline; the name is what tells them apart.
    const o = { name: "Content Engine — Instagram", headline: "Go From Hours of Research to a Week of Content.", description: "Long copy", imageUrl: null, priceCents: 2900, currency: "usd", interval: "month" } as unknown as Offer;
    expect(offerLine(o, base, "/o/content-engine-instagram")).toMatchObject({
      name: "Content Engine — Instagram",
      description: "Go From Hours of Research to a Week of Content.",
      url: `${base}/o/content-engine-instagram`,
      interval: "month",
    });
  });
});
