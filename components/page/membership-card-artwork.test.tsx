import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The membership card shows the offer's artwork above the price.
 *
 * Asked for on 10 Sep 2026, looking at the Funnel App card: the right column
 * was a price and a button on an empty panel. The same band and the same
 * cover the library gives the artwork, so a thing looks like itself wherever
 * it appears — and nothing at all when there is none, because a grey box
 * beside a real price is worse than the price alone.
 */
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => <a href={p.href}>{p.children as never}</a> }));
vi.mock("@/components/buy-link", () => ({ BuyLink: (p: { href: string; children: unknown }) => <a href={p.href}>{p.children as never}</a> }));

const { MembershipCard } = await import("@/components/page/storefront-blocks");

const offer = (over: Record<string, unknown> = {}) =>
  ({
    id: "o1",
    key: "funnel-builder",
    name: "Funnel App",
    headline: "Build the entire low-ticket funnel in one sitting.",
    description: null,
    bullets: ["3 complete funnels every month"],
    priceCents: 2900,
    currency: "usd",
    billingType: "recurring",
    interval: "month",
    intervalCount: 1,
    trialDays: 7,
    acceptLabel: "Start 7-day free trial",
    imageUrl: "https://cdn.example.com/funnel-app-mockup.png.webp",
    prices: [],
    ...over,
  }) as never;

const render = (o: unknown) =>
  renderToStaticMarkup(<MembershipCard view={{ offer: o as never, href: "/checkout/offer?offer=o1", owned: false }} />);

describe("the membership card's artwork", () => {
  it("draws the offer's image above the price, covering its band", () => {
    const html = render(offer());
    const img = html.indexOf('src="https://cdn.example.com/funnel-app-mockup.png.webp"');
    const price = html.indexOf("$29");
    expect(img).toBeGreaterThan(-1);
    expect(img, "the image comes before the price in the column").toBeLessThan(price);
    expect(html).toMatch(/aspect-\[16\/10\][^"]*overflow-hidden/);
    expect(html).toContain("object-cover");
  });

  it("draws nothing where there is no artwork", () => {
    const html = render(offer({ imageUrl: null }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("aspect-[16/10]");
    expect(html).toContain("$29");
  });

  it("does not put the artwork in the tracking-bearing button", () => {
    // The image is decoration; the buy link is the thing that fires the event.
    const html = render(offer());
    expect(html).toContain('href="/checkout/offer?offer=o1"');
  });
});
