// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { OrderBump } from "@/components/checkout/order-bump";
import { buildBumpView, type BumpChoice, type BumpView } from "@/lib/bump";

/**
 * The bump with more than two prices.
 *
 * The two-price version was a fieldset naming `main` and `alt`, which is why
 * two was the ceiling. It is a list now — and the thing that must not drift is
 * that the INDEX the card answers with is the index of the option it drew,
 * because the server rebuilds the same list and looks that index up in it.
 */

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

const offer = (priceCents: number, interval: string | null, trialDays: number | null) =>
  buildBumpView({
    name: "Vault",
    headline: "Add the Vault",
    description: null,
    bumpHeadline: null,
    bumpDescription: null,
    bumpBanner: "",
    bumpBullets: [],
    bumpNote: null,
    bumpAccent: "#b0532f",
    currency: "usd",
    compareAtCents: null,
    billingType: interval ? "recurring" : "one_time",
    interval,
    priceCents,
    trialDays,
  } as never);

const THREE: BumpView[] = [
  offer(1900, "month", null),
  offer(14900, "year", null),
  offer(1900, "month", 7),
];

function mount(options: BumpView[], choice: BumpChoice | null = null) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  const box = { choice };
  act(() => {
    root.render(
      <OrderBump
        view={options[0]}
        options={options}
        choice={box.choice}
        onChoose={(c) => {
          box.choice = c;
        }}
      />,
    );
  });
  return box;
}

const radios = () => [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const click = (el: Element) => act(() => (el as HTMLElement).click());

describe("a bump with three prices", () => {
  it("draws one row per price, plus a way to decline", () => {
    mount(THREE);
    // Three options and "No thanks" — a radio cannot be unticked by clicking
    // it again, so declining has to be something you can select.
    expect(radios()).toHaveLength(4);
    expect(document.body.textContent).toContain("No thanks");
  });

  it("answers with the index of the row that was pressed", () => {
    // The whole invariant. The server rebuilds this list from the placement
    // and takes list[i]; if the card ever answered with something else, the
    // buyer would be charged the option beside the one they ticked.
    const box = mount(THREE);
    click(radios()[2]);
    expect(box.choice).toBe(2);
  });

  it("can be put back to no thanks", () => {
    const box = mount(THREE, 1);
    click(radios()[3]);
    expect(box.choice).toBe("none");
  });

  it("starts with nothing selected, so declining is something you do", () => {
    mount(THREE);
    expect(radios().filter((r) => r.checked)).toHaveLength(0);
  });

  it("shows the plan price on each row, not the charge-today one", () => {
    // Through a trial every option reads $0 today, and a choice between three
    // $0s is not a choice anyone can make.
    mount(THREE);
    const text = document.body.textContent ?? "";
    expect(text).toContain("$19/month");
    expect(text).toContain("$149/year");
  });

  it("stays a tickbox when there is only one price", () => {
    mount([THREE[0]]);
    expect(radios()).toHaveLength(0);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  });
});
