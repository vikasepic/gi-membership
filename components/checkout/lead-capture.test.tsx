// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * The buyer's name reaches ActiveCampaign as firstName + lastName, but only if
 * it reaches us first. Everything downstream is tested where it lives; this
 * covers the one step that had no test of its own — the moment the name and the
 * address are buffered for the abandoned-cart email.
 *
 * It used to read checkout-form.tsx as a string and assert on the order of
 * three substrings, which is a test of the source rather than of the code: it
 * passes for any rearrangement that keeps the words and fails for any rewrite
 * that keeps the behaviour. The only thing standing in the way of running it
 * properly was Stripe's Element, so the Element is stubbed and the form is
 * mounted and typed into.
 *
 * Both failures this guards are silent. Nothing errors, nothing looks wrong on
 * the checkout, and the contact simply arrives with an empty first name.
 */

const captured = vi.fn(async (..._a: unknown[]) => {});
const tracked = vi.fn();

vi.mock("@/app/(store)/checkout/actions", () => ({
  startCheckout: async () => ({ ok: false, error: "not under test" }),
  previewCoupon: async () => ({ ok: false, error: "not under test" }),
  captureAbandonedCart: (...a: unknown[]) => captured(...a),
}));
vi.mock("@/components/analytics", () => ({ track: (...a: unknown[]) => tracked(...a) }));
// The card fields are an iframe on Stripe's domain and there is no network
// here. Nothing in this file touches payment — only the two text inputs above
// it — so the Element is a hole in the form rather than a fake of it.
vi.mock("@stripe/stripe-js", () => ({ loadStripe: async () => null }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}));

const { CheckoutForm } = await import("@/components/checkout/checkout-form");

const product = {
  slug: "product-validator",
  title: "Product Validator",
  tagline: null,
  priceCents: 2700,
  currency: "usd",
};

let mounted: { unmount: () => void } | null = null;

beforeEach(() => {
  captured.mockClear();
  tracked.mockClear();
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <CheckoutForm product={product} bump={null} publishableKey="pk_test_x" />,
    );
  });
});
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

const field = (label: string) =>
  document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

/** Type into a field and leave it, the way a buyer moving down the form does. */
function fill(label: string, value: string) {
  const el = field(label);
  act(() => {
    // React tracks the last value it wrote, so setting `.value` directly makes
    // its onChange a no-op. The native setter is how you get past that.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // focusout, not blur: React delegates onBlur to a focusout listener on the
  // root, and a plain `blur` event does not bubble that far — it dispatches
  // fine and nothing runs, which looks like a broken handler rather than a
  // broken test.
  act(() => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

const leads = () => captured.mock.calls;
const pixels = () => tracked.mock.calls.filter((c) => c[0] === "Lead");

describe("buffering the abandoned-cart lead", () => {
  it("buffers the address on its own, before a name has been typed", () => {
    fill("Email", "jane@example.com");
    expect(leads()).toEqual([["product-validator", "jane@example.com", undefined]]);
  });

  it("sends the name when it arrives after the address", () => {
    // The case the second capture exists for: someone clicks straight into
    // Email, tabs out, then goes back up and fills their name. Without the
    // blur on the name field, or with the buffer keyed on the address alone,
    // the contact reaches ActiveCampaign with no first name at all.
    fill("Email", "jane@example.com");
    fill("Full name", "Jane Doe");
    expect(leads()).toHaveLength(2);
    expect(leads()[1]).toEqual(["product-validator", "jane@example.com", "Jane Doe"]);
  });

  it("does not re-send when nothing about the pair has changed", () => {
    // Tabbing back through a finished form must not re-buffer on every pass.
    fill("Email", "jane@example.com");
    fill("Full name", "Jane Doe");
    act(() => field("Email").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    act(() => field("Full name").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(leads()).toHaveLength(2);
  });

  it("fires the Lead pixel once per address, not once per capture", () => {
    // The buffer re-sends when the name changes; the pixel may not. Two Lead
    // events for one person would overstate the funnel in Meta and GA4.
    fill("Email", "jane@example.com");
    fill("Full name", "Jane Doe");
    fill("Full name", "Jane D");
    expect(leads()).toHaveLength(3);
    expect(pixels()).toHaveLength(1);
  });

  it("fires again for a genuinely different address", () => {
    fill("Email", "jane@example.com");
    fill("Email", "joan@example.com");
    expect(pixels()).toHaveLength(2);
  });

  it("buffers nothing for something that is not an address yet", () => {
    // On blur rather than on every keystroke, and only once there is an @:
    // "jane@gm" is a different and usually invalid address, and tagging it
    // would put a junk contact in ActiveCampaign.
    fill("Email", "jane");
    expect(leads()).toHaveLength(0);
    expect(pixels()).toHaveLength(0);
  });

  it("normalizes the address the same way for the buffer and the pixel", () => {
    // Two casings of one address are one lead. Not normalizing here would let
    // the same person through twice, once per way they typed it.
    fill("Email", "  Jane@Example.COM ");
    expect(leads()[0]?.[1]).toBe("jane@example.com");
    fill("Email", "jane@example.com");
    expect(leads()).toHaveLength(1);
    expect(pixels()).toHaveLength(1);
  });
});
