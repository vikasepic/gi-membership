// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { OfferOption } from "@/lib/admin";

vi.mock("@/app/admin/offers/actions", () => ({
  saveOffer: async () => ({}),
  removeOffer: async () => ({}),
}));
const { OfferForm } = await import("@/components/admin/offer-form");

/**
 * Same safety net as the bump picker's own test (offer-bump-picker.test.tsx),
 * for the upsell select added beside it: the filter must never hide the
 * offer's OWN current value, even once it stops qualifying (deactivated by an
 * edit to that OTHER offer) — dropping it drops it from defaultValue too, so
 * the browser falls back to selecting "none" and the next save of THIS offer,
 * for any reason, would silently post an empty upsell and erase it.
 *
 * Unlike the bump picker, there is no billing-type filter to test here at
 * all — a recurring offer belongs in the list on the same footing as a
 * one-time one (see upsellSlotError). That asymmetry is the whole point of
 * this feature, so a test that reused the bump fixtures unchanged would not
 * actually prove it.
 */

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

function option(over: Partial<OfferOption> & { id: string }): OfferOption {
  return {
    name: "option",
    grantType: "product",
    grantAppId: null,
    grantEntitlementKey: null,
    priceCents: 1000,
    currency: "usd",
    interval: null,
    trialDays: null,
    billingType: "one_time",
    prices: [],
    active: true,
    ...over,
  };
}

function mount(upsellOfferId: string | null, offers: OfferOption[]) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <OfferForm
        offer={
          { id: "host", billingType: "one_time", prices: [], bullets: [], otoSections: {}, upsellOfferId } as never
        }
        products={[]}
        apps={[]}
        offers={offers}
      />,
    );
  });
}

const upsellSelect = () => document.querySelector<HTMLSelectElement>('select[name="upsellOfferId"]')!;
const optionEl = (value: string) => upsellSelect().querySelector<HTMLOptionElement>(`option[value="${value}"]`);

describe("the upsell picker's current-value safety net", () => {
  it("keeps a deactivated current upsell in the list, labelled, and still selected", () => {
    mount("stale-upsell", [
      option({ id: "stale-upsell", name: "Old Upsell", active: false }),
      option({ id: "valid-upsell", name: "Fresh Upsell" }),
    ]);
    const stale = optionEl("stale-upsell");
    expect(stale?.textContent).toContain("(no longer available)");
    expect(upsellSelect().value).toBe("stale-upsell");
  });

  it("includes a live RECURRING offer — no one-time filter, unlike the bump select", () => {
    mount("valid-upsell", [option({ id: "valid-upsell", name: "Subscription upsell", billingType: "recurring" })]);
    const opt = optionEl("valid-upsell");
    expect(opt).toBeTruthy();
    expect(opt?.textContent).not.toContain("no longer");
    expect(upsellSelect().value).toBe("valid-upsell");
  });

  it("still excludes an inactive offer that ISN'T the current upsell", () => {
    mount("valid-upsell", [
      option({ id: "valid-upsell", name: "Fresh Upsell" }),
      option({ id: "some-draft", name: "Some Draft", active: false }),
    ]);
    expect(optionEl("valid-upsell")).toBeTruthy();
    expect(optionEl("some-draft")).toBeNull();
    expect(upsellSelect().value).toBe("valid-upsell");
  });

  it("falls back to none when there is no upsell set at all", () => {
    mount(null, [option({ id: "some-draft", name: "Some Draft", active: false })]);
    expect(optionEl("some-draft")).toBeNull();
    expect(upsellSelect().value).toBe("");
  });
});
