// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TrackPurchase } from "@/components/track-purchase";
import { parseProductForm } from "@/lib/product-rules";
import { readFileSync } from "node:fs";

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

  it("keeps the content name the ads team uses for this product", () => {
    // Separate from the event name above: one names the event, the other names
    // the thing bought. This action parses the post through its own schema, so
    // a field the schema does not name is dropped before it reaches the column.
    const r = parseProductForm(form({ contentName: "Validator - Front End" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.contentName).toBe("Validator - Front End");
  });

  it("treats a blank content name as unset, so the title still reports", () => {
    const r = parseProductForm(form({ contentName: "   " }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.contentName).toBeNull();
  });
});

describe("the funnel event has a server half", () => {
  it("carries an id the server can match, so one sale is not counted twice", () => {
    // finalizeOrder sends the same event with the same id. Without an eventID
    // here Meta has no way to know the two are one sale, and a buyer with an
    // unblocked pixel would be reported twice.
    render(
      <TrackPurchase
        orderId="ord_9"
        valueCents={3000}
        currency="usd"
        customEvent={{ name: "Product Validator Sale", contentName: "Product Validator" }}
      />,
    );
    const custom = fbq.mock.calls.find((c) => c[0] === "trackCustom");
    expect(custom![3]).toEqual({ eventID: "Product Validator Sale.ord_9" });
  });

  it("uses the same formula the server uses", () => {
    // Both sides build the id from the order without telling each other, so
    // the formula is the contract. A change on one side is two sales.
    const src = readFileSync("lib/analytics/events.ts", "utf8");
    expect(src).toContain("export function customEventIdFor(name: string, stableKey: string): string {");
    expect(src).toContain("return `${name}.${stableKey}`;");
    const server = readFileSync("lib/checkout.ts", "utf8");
    expect(server, "the server must send the funnel event too")
      .toContain("customEventIdFor(adEvent.name, order.id as string)");
    expect(server, "and only to Meta — GA4 has no name for it")
      .toMatch(/customName: adEvent\.name[\s\S]{0,400}only: \["meta"\]/);
  });
});
