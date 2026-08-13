// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/app/admin/offers/actions", () => ({
  saveOffer: async () => ({}),
  removeOffer: async () => ({}),
}));
const { OfferForm } = await import("@/components/admin/offer-form");

// The trial tag field is only meaningful for an offer that has a trial, and it
// has to follow the trial-days box as it is typed — the field is the
// explanation of what a trial costs you in the CRM, and it is needed while
// deciding to have one.
//
// A trial is a property of a WAY TO PAY now, not of the offer, so "has a
// trial" means "any of them offers one". A buyer on the yearly with a trial is
// tagged exactly like one on the monthly, so one price offering a trial is
// enough for the field to matter.

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

function mount(trialDays: number | null) {
  const price = {
    id: "p1",
    label: "",
    billingType: "recurring" as const,
    interval: "month" as const,
    intervalCount: 1,
    trialDays,
    priceCents: 2900,
    compareAtCents: null,
    archived: false,
  };
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <OfferForm
        // Enough of an offer to render: the form reads bullets and the OTO
        // sections on the way past.
        offer={
          {
            trialDays,
            billingType: "recurring",
            interval: "month",
            prices: [price],
            bullets: [],
            otoSections: {},
          } as never
        }
        products={[]}
        apps={[]}
      />,
    );
  });
}

const field = (name: string) => document.querySelector(`input[name="${name}"]`);
/** The per-price trial box, which is where a trial is set now. */
const trialBox = () => document.querySelector<HTMLInputElement>('input[aria-label="Free trial days"]')!;
const type = (name: string, to: string) => {
  const el =
    name === "trialDays"
      ? trialBox()
      : document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(el, to);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("the lifecycle tag fields", () => {
  it("offers all three when there is a trial", () => {
    mount(7);
    for (const n of ["activecampaignTagId", "activecampaignTrialTagId", "activecampaignCancelledTagId"]) {
      expect(field(n), n).toBeTruthy();
    }
  });

  it("does not offer a separate access field, which was the same tag twice", () => {
    mount(7);
    expect(field("activecampaignBuyerTagId")).toBeNull();
    expect(document.querySelectorAll("input[name^=activecampaign]")).toHaveLength(3);
  });

  it("hides the trial one when there is no trial", () => {
    mount(0);
    expect(field("activecampaignTrialTagId")).toBeNull();
    // The other two still apply: anything that takes money has a buyer, and
    // anything that can be refunded can be cancelled.
    expect(field("activecampaignTagId")).toBeTruthy();
    expect(field("activecampaignCancelledTagId")).toBeTruthy();
  });

  it("hides it for an offer that has never had a trial set", () => {
    mount(null);
    expect(field("activecampaignTrialTagId")).toBeNull();
  });

  it("shows it the moment trial days are typed", () => {
    mount(0);
    expect(field("activecampaignTrialTagId")).toBeNull();
    type("trialDays", "7");
    expect(field("activecampaignTrialTagId")).toBeTruthy();
  });

  it("takes it away again when the trial is removed", () => {
    mount(7);
    type("trialDays", "0");
    expect(field("activecampaignTrialTagId")).toBeNull();
  });
});
