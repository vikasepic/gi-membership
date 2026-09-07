// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfferLinkForm } from "@/components/admin/offer-link-form";

const render = (k: string) =>
  renderToStaticMarkup(
    <OfferLinkForm offerId="00000000-0000-0000-0000-0000000000c1" offerKey={k} siteUrl="https://grow.example.com" />,
  );

describe("changing an offer's public link", () => {
  it("puts the current link in a field you can actually type in", () => {
    // The whole reason this exists: the panel used to show the address as
    // read-only text with Copy and Open, so the only way to change it was to
    // know it lived on another screen entirely.
    const html = render("content-engine-instagram");
    expect(html).toContain('name="key"');
    expect(html).toContain('value="content-engine-instagram"');
    // Scoped to the input's own tag. Asserting on the whole document would
    // also match the submit button, which is legitimately disabled until the
    // value actually changes — a passing test that proves nothing.
    const keyInput = html.match(/<input[^>]*name="key"[^>]*>/)?.[0] ?? "";
    expect(keyInput).not.toMatch(/readonly|disabled/i);
  });

  it("only offers to save once something has changed", () => {
    // Guards the assertion above: the button IS disabled at rest, which is why
    // that check has to look at the input alone.
    expect(render("content-engine-instagram")).toMatch(/<button[^>]*disabled/);
  });

  it("shows the address being built, so the result is visible before saving", () => {
    expect(render("content-engine-instagram")).toContain("https://grow.example.com/o/");
  });

  it("carries the offer so the action knows what it is renaming", () => {
    expect(render("x")).toContain("00000000-0000-0000-0000-0000000000c1");
  });

  it("warns that the old address dies, without burying it", () => {
    // Nothing redirects from the old key. An admin who changes this without
    // being told has just broken every ad and email already pointing here.
    const html = render("content-engine-instagram");
    expect(html).toMatch(/stop working|break|dead|404/i);
  });
});
