import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentNameOr } from "@/lib/analytics/events";

const read = (p: string) => readFileSync(p, "utf8");

describe("the content name an admin can set", () => {
  it("wins over whatever the site would have sent", () => {
    expect(contentNameOr("Validator - Front End", "Digital Product Validator")).toBe(
      "Validator - Front End",
    );
  });

  it("falls back when nothing is set, so live campaigns keep the name they optimise on", () => {
    // The whole reason the column is nullable. An offer with no content name
    // has to report exactly what it reported yesterday.
    expect(contentNameOr(null, "Funnel App")).toBe("Funnel App");
    expect(contentNameOr(undefined, "Funnel App")).toBe("Funnel App");
  });

  it("treats whitespace as unset rather than as a blank name", () => {
    // An input the admin cleared posts "" or "   ". Sending that to Meta names
    // the purchase nothing, which is worse than the title it replaced.
    expect(contentNameOr("   ", "Funnel App")).toBe("Funnel App");
    expect(contentNameOr("", "Funnel App")).toBe("Funnel App");
  });

  it("keeps the fallback's own emptiness rather than inventing a value", () => {
    // Two sites pass null and one passes undefined as their fallback; the
    // helper must not turn either into a string.
    expect(contentNameOr(null, null)).toBeNull();
    expect(contentNameOr(null, undefined)).toBeUndefined();
  });
});

describe("every site that reports a content name asks the helper", () => {
  // Four sites named it four different ways, which is how it ended up
  // unsettable. A new site that hardcodes a fifth is the failure this catches.
  const checkout = read("lib/checkout.ts");
  const receipt = read("lib/tracking-receipt.ts");

  it("the order's own line description", () => {
    expect(checkout).toMatch(/contentName: contentNameOr\(\s*named\?\.content_name/);
  });

  it("an offer sold as a bump, an upsell or on its own", () => {
    expect(checkout).toContain("contentName: contentNameOr(offer.contentName, offer.name)");
  });

  it("the product behind a custom funnel event", () => {
    expect(receipt).toMatch(/contentNameOr\(\s*product\?\.content_name/);
    expect(receipt, "the column has to be selected or it is always undefined").toContain(
      "content_name",
    );
  });

  it("a trial that converts to a paid subscription a week later", () => {
    expect(receipt).toMatch(/contentName: contentNameOr\(\s*offer\.content_name/);
  });

  it("reads the column on both tables", () => {
    // camelize maps the row, so a column missing from the select is a field
    // that is silently always null rather than an error anyone would see.
    const store = read("lib/store.ts");
    expect(store.match(/content_name/g) ?? []).toHaveLength(2);
  });
});
