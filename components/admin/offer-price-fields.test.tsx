// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { OfferPriceFields } from "@/components/admin/offer-price-fields";
import { newOfferPrice } from "@/lib/offer-prices";
import { pricesField } from "@/lib/prices-field";

const LONG = "Content Engine [IG] + LinkedIn - Monthly (7-day free trial, cancel any time)";

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

describe("a way to pay's name", () => {
  it("takes a name longer than 40 characters", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<OfferPriceFields prices={[newOfferPrice("p1")]} currency="usd" name="prices" />));

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Label"]')!;
    // -1 is what the DOM reports when no maxlength is set. The browser, not
    // the handler, is what refused the 41st character.
    expect(input.maxLength).toBe(-1);
    act(() => root.unmount());
  });

  it("keeps the whole name through the save", () => {
    const raw = JSON.stringify([{ ...newOfferPrice("p1"), label: LONG, priceCents: 2900 }]);
    expect(pricesField.parse(raw)[0].label).toBe(LONG);
  });
});
