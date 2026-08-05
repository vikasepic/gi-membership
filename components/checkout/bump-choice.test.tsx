// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { buildBumpView, type BumpChoice } from "@/lib/bump";
import type { Offer } from "@/lib/types";

vi.mock("@/app/(store)/checkout/actions", () => ({ startCheckout: async () => ({}) }));
const { OrderBump } = await import("@/components/checkout/order-bump");

// One bump, two ways to pay it. The control changes shape: a single price is a
// tickbox, two prices are a radio group — and declining has to stay reachable,
// because a radio cannot be unticked by clicking it again.

const offer = (over: Partial<Offer>): Offer =>
  ({
    id: "o1",
    key: "funnel-monthly",
    name: "Funnel App",
    billingType: "recurring",
    interval: "month",
    trialDays: 7,
    priceCents: 2900,
    compareAtCents: null,
    currency: "usd",
    headline: "Funnel App",
    description: "Build the whole funnel in one sitting.",
    bullets: [],
    bumpHeadline: null,
    bumpDescription: null,
    bumpBanner: "",
    bumpBullets: [],
    bumpNote: null,
    bumpAccent: null,
    acceptLabel: "Yes",
    declineLabel: "No thanks",
    ...over,
  }) as Offer;

const monthly = buildBumpView(offer({}));
const yearly = buildBumpView(
  offer({ id: "o2", interval: "year", priceCents: 19900, compareAtCents: 34800 }),
);

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

function mount(alt: typeof yearly | null, initial: BumpChoice = "none") {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  let choice = initial;
  const render = () =>
    act(() => {
      root.render(
        <OrderBump
          view={monthly}
          alt={alt}
          choice={choice}
          onChoose={(c) => {
            choice = c;
            render();
          }}
        />,
      );
    });
  render();
  return { get choice() { return choice; } };
}

const radios = () => [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const text = () => document.body.textContent ?? "";

describe("a bump with one price", () => {
  it("stays a tickbox — there is one thing to say yes to", () => {
    mount(null);
    expect(document.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(radios()).toHaveLength(0);
  });

  it("ticks to main and unticks to none", () => {
    const b = mount(null);
    const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    click(box);
    expect(b.choice).toBe("main");
    click(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(b.choice).toBe("none");
  });
});

describe("a bump with two prices", () => {
  it("becomes a radio group", () => {
    mount(yearly);
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    expect(radios()).toHaveLength(3);
  });

  it("offers declining as its own option", () => {
    // Without it there is no way back: clicking a selected radio does not
    // clear it, so someone who ticks yearly by accident is stuck buying it.
    mount(yearly);
    expect(text()).toContain("No thanks");
    expect(radios()[0].checked).toBe(true);
  });

  it("starts with nothing selected but the decline", () => {
    const b = mount(yearly);
    expect(b.choice).toBe("none");
  });

  it("shows each option as what it costs on ITS terms, not what is due today", () => {
    // Through a trial both options take $0 today. A radio group where every
    // line reads $0 is not a choice anyone can make.
    mount(yearly);
    const rows = [...document.querySelectorAll("label")].map((l) => l.textContent ?? "");
    expect(rows.some((r) => r.includes("$29/month"))).toBe(true);
    expect(rows.some((r) => r.includes("$199/year"))).toBe(true);
  });

  it("lets only one be chosen", () => {
    const b = mount(yearly);
    click(radios()[1]);
    expect(b.choice).toBe("main");
    expect(radios().filter((r) => r.checked)).toHaveLength(1);
    click(radios()[2]);
    expect(b.choice).toBe("alt");
    expect(radios().filter((r) => r.checked)).toHaveLength(1);
  });

  it("can be put back to no thanks", () => {
    const b = mount(yearly, "alt");
    click(radios()[0]);
    expect(b.choice).toBe("none");
  });

  it("hides the card's own price block, which nobody selected", () => {
    mount(yearly);
    const block = [...document.querySelectorAll("span")].find((el) =>
      el.className.includes("tabular-nums") && el.className.includes("@md:text-right"),
    );
    expect(block?.className).toContain("hidden");
  });

  it("says what is actually taken today, once per option", () => {
    mount(yearly);
    const rows = [...document.querySelectorAll("label")].map((l) => l.textContent ?? "");
    expect(rows.filter((r) => r.includes("nothing today"))).toHaveLength(2);
  });

  it("badges the trial on both, because both have one", () => {
    mount(yearly);
    expect(text().match(/7 days free/g) ?? []).toHaveLength(2);
  });
});
