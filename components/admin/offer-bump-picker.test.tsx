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
 * The bump picker's filter must never hide the offer's OWN current value,
 * even once that value stops qualifying (deactivated, or switched to
 * recurring, by an edit to some OTHER offer) — see the comment beside the
 * <select> in offer-form.tsx. Dropping it drops it from defaultValue too:
 * React falls back to selecting the first <option> ("none") when nothing
 * matches, so the next save of this offer for any reason would silently post
 * an empty bump and erase it. These tests render the real component (not a
 * copy of its filter logic) so a regression here fails the same way the
 * reviewer found it — silently, in the rendered <select>, not in a message.
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

function mount(bumpOfferId: string | null, offers: OfferOption[]) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <OfferForm
        offer={
          { id: "host", billingType: "one_time", prices: [], bullets: [], otoSections: {}, bumpOfferId } as never
        }
        products={[]}
        apps={[]}
        offers={offers}
      />,
    );
  });
}

const bumpSelect = () => document.querySelector<HTMLSelectElement>('select[name="bumpOfferId"]')!;
const optionEl = (value: string) => bumpSelect().querySelector<HTMLOptionElement>(`option[value="${value}"]`);

describe("the bump picker's current-value safety net", () => {
  it("keeps a deactivated current bump in the list, labelled, and still selected", () => {
    mount("stale-bump", [
      option({ id: "stale-bump", name: "Old Bump", active: false, billingType: "one_time" }),
      option({ id: "valid-bump", name: "Fresh Bump" }),
    ]);
    const stale = optionEl("stale-bump");
    expect(stale?.textContent).toContain("(no longer active)");
    // The whole point: the browser can actually still select it, unlike the
    // bug this guards, where a dropped option forced a silent fallback to
    // the empty "none" option regardless of what was actually saved.
    expect(bumpSelect().value).toBe("stale-bump");
  });

  it("keeps a current bump that turned recurring, labelled distinctly from inactive", () => {
    mount("turned-recurring", [option({ id: "turned-recurring", name: "Was One-Time", billingType: "recurring" })]);
    expect(optionEl("turned-recurring")?.textContent).toContain("(no longer one-time)");
    expect(optionEl("turned-recurring")?.textContent).not.toContain("no longer active");
    expect(bumpSelect().value).toBe("turned-recurring");
  });

  it("still excludes an inactive or recurring offer that ISN'T the current bump", () => {
    mount("valid-bump", [
      option({ id: "valid-bump", name: "Fresh Bump" }),
      option({ id: "some-draft", name: "Some Draft", active: false }),
      option({ id: "some-sub", name: "Some Subscription", billingType: "recurring" }),
    ]);
    expect(optionEl("valid-bump")).toBeTruthy();
    expect(optionEl("some-draft")).toBeNull();
    expect(optionEl("some-sub")).toBeNull();
    expect(bumpSelect().value).toBe("valid-bump");
  });

  it("falls back to none when there is no bump set at all", () => {
    mount(null, [option({ id: "some-draft", name: "Some Draft", active: false })]);
    expect(optionEl("some-draft")).toBeNull();
    expect(bumpSelect().value).toBe("");
  });
});
