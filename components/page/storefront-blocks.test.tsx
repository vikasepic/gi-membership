import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The Featured block chooses; the Memberships block can be a row.
 *
 * Asked for on 14 Sep 2026 after the home page prototypes: "Best seller" has
 * to be a section somebody can change, not the first product in the
 * catalogue by accident of sort order.
 */
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => <a href={p.href}>{p.children as never}</a> }));
vi.mock("@/components/buy-link", () => ({ BuyLink: (p: { href: string; children: unknown }) => <a href={p.href}>{p.children as never}</a> }));

const { FeaturedBlock, MembershipsBlock } = await import("@/components/page/storefront-blocks");

const item = (slug: string, title: string) => ({ slug, title, tagline: `${title} tagline`, type: null, priceCents: 1900 });
const offer = (key: string, billingType: "recurring" | "one_time") =>
  ({
    id: key,
    key,
    name: key,
    headline: `${key} headline`,
    description: null,
    bullets: [],
    priceCents: 2900,
    currency: "usd",
    billingType,
    interval: billingType === "recurring" ? "month" : null,
    intervalCount: 1,
    trialDays: billingType === "recurring" ? 7 : null,
    acceptLabel: "Go",
    imageUrl: null,
    prices: [],
  }) as never;

const store = {
  products: [item("validator", "Digital Product Validator"), item("carousels", "The Guide to Viral Carousels")],
  featured: item("validator", "Digital Product Validator"),
  memberships: [
    { offer: offer("content-engine", "recurring"), href: "/o/content-engine", owned: false },
    { offer: offer("book-writer", "one_time"), href: "/o/book-writer", owned: false },
  ],
};

describe("the Featured block", () => {
  it("shows the product it was told to, by slug", () => {
    const html = renderToStaticMarkup(<FeaturedBlock store={store} title="" note="" product="carousels" tag="" line="" />);
    expect(html).toContain("The Guide to Viral Carousels");
    expect(html).not.toContain("Digital Product Validator");
  });

  it("falls back to the catalogue's first product when told nothing, or something gone", () => {
    for (const product of ["", "deleted-long-ago"]) {
      const html = renderToStaticMarkup(<FeaturedBlock store={store} title="" note="" product={product} tag="" line="" />);
      expect(html).toContain("Digital Product Validator");
    }
  });

  it("prints the tag on the card and lets the line be overridden", () => {
    const html = renderToStaticMarkup(
      <FeaturedBlock store={store} title="" note="" product="validator" tag="Best seller" line="Know before you build." />,
    );
    expect(html).toContain("Best seller");
    expect(html).toContain("Know before you build.");
    expect(html).not.toContain("Digital Product Validator tagline");
  });
});

describe("the Memberships block as a row of tiles", () => {
  it("filters by how the offer bills", () => {
    const one = renderToStaticMarkup(<MembershipsBlock store={store} title="" showOwned layout="tiles" billing="one_time" />);
    expect(one).toContain("book-writer headline");
    expect(one).not.toContain("content-engine headline");
    const monthly = renderToStaticMarkup(<MembershipsBlock store={store} title="" showOwned layout="tiles" billing="recurring" />);
    expect(monthly).toContain("content-engine headline");
    expect(monthly).not.toContain("book-writer headline");
  });

  it("draws tiles, not the full card, and says what the price means", () => {
    const html = renderToStaticMarkup(<MembershipsBlock store={store} title="" showOwned layout="tiles" billing="all" />);
    // The full card carries the per-offer anchor; a tile links out instead.
    expect(html).not.toContain('id="offer-');
    expect(html).toContain('href="/o/book-writer"');
    expect(html).toContain("One-time");
    expect(html).toContain("/month");
  });

  it("still draws the full cards by default", () => {
    const html = renderToStaticMarkup(<MembershipsBlock store={store} title="" showOwned layout="cards" billing="all" />);
    expect(html).toContain('id="offer-content-engine"');
    expect(html).toContain('id="offer-book-writer"');
  });
});
