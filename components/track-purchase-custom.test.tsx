// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TrackPurchase } from "@/components/track-purchase";
import { parseProductForm } from "@/lib/product-rules";

/**
 * The per-funnel sale event the ads team asked for.
 *
 * One pixel serves several funnels on this ad account, so a single Purchase
 * cannot be split between campaigns in reporting. Their request, 22 Aug 2026:
 * a named custom event on the UPSELL page — the page every buyer reaches
 * whether they accept, decline, or close the tab — carrying the real order
 * value.
 */

let host: HTMLDivElement;
let root: Root;
let fbq: ReturnType<typeof vi.fn>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fbq = vi.fn();
  (window as { fbq?: unknown }).fbq = fbq;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as { fbq?: unknown }).fbq;
});

const render = (el: React.ReactNode) => act(() => root.render(el));

describe("the funnel's own sale event", () => {
  it("fires as trackCustom, with the order's real value", () => {
    render(
      <TrackPurchase
        orderId="ord_1"
        valueCents={3000}
        currency="usd"
        customEvent={{ name: "Product Validator Sale", contentName: "Product Validator" }}
      />,
    );

    const custom = fbq.mock.calls.find((c) => c[0] === "trackCustom");
    expect(custom, "no custom event fired").toBeTruthy();
    expect(custom![1]).toBe("Product Validator Sale");
    expect(custom![2]).toMatchObject({
      content_name: "Product Validator",
      content_type: "product",
      currency: "USD",
      // $19 product + $11 bump. The number the ads team reads has to be what
      // the buyer actually paid, not the headline price of the product.
      value: 30,
    });
  });

  it("is sent BESIDE Purchase, never instead of it", () => {
    // Meta's own optimisation runs on the standard event. A custom event that
    // replaced it would leave the campaign with nothing to optimise towards.
    render(
      <TrackPurchase
        orderId="ord_2"
        valueCents={1900}
        currency="usd"
        customEvent={{ name: "Product Validator Sale", contentName: "Product Validator" }}
      />,
    );
    expect(fbq.mock.calls.filter((c) => c[0] === "track" && c[1] === "Purchase")).toHaveLength(1);
    expect(fbq.mock.calls.filter((c) => c[0] === "trackCustom")).toHaveLength(1);
  });

  it("sends nothing extra for a funnel that has not been given a name", () => {
    render(<TrackPurchase orderId="ord_3" valueCents={1900} currency="usd" />);
    expect(fbq.mock.calls.filter((c) => c[0] === "trackCustom")).toHaveLength(0);
    expect(fbq.mock.calls.filter((c) => c[1] === "Purchase")).toHaveLength(1);
  });
});

describe("the event name the admin can save", () => {
  const form = (over: Record<string, string> = {}) => ({
    title: "Digital Product Validator",
    slug: "digital-product-validator",
    price: "19",
    status: "published",
    courseIds: ["c1"],
    ...over,
  });

  it("keeps the ads team's name as typed", () => {
    const r = parseProductForm(form({ adEventName: "Product Validator Sale" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.adEventName).toBe("Product Validator Sale");
  });

  it("treats blank as no event rather than as an empty name", () => {
    const r = parseProductForm(form({ adEventName: "   " }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.adEventName).toBeNull();
  });

  it("refuses a name Meta would silently drop", () => {
    // Over 40 characters, Meta ignores the event and says nothing. From inside
    // an ad account that is indistinguishable from broken tracking, so it has
    // to be refused where somebody is watching: the form.
    const r = parseProductForm(form({ adEventName: "x".repeat(41) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.adEventName).toMatch(/40 characters/);
  });
});
