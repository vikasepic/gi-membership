import type { Appearance } from "@stripe/stripe-js";
import type { CheckoutSkin } from "@/lib/checkout-skin";

/**
 * How Stripe's own fields are painted.
 *
 * The Payment Element is an iframe on Stripe's origin, so none of this store's
 * CSS reaches inside it — the Appearance API is the only way in, and anything
 * it cannot express simply cannot be styled. That is why the redesign's card
 * box is described here in Stripe's vocabulary rather than in ours: a card
 * form that does not match the page around it is the single most obvious tell
 * that a checkout was assembled rather than designed.
 *
 * The values are the redesign's own tokens, repeated rather than imported,
 * because these cross a process boundary as plain strings and a var() would
 * arrive as text Stripe cannot resolve.
 */
export function stripeAppearance(skin: CheckoutSkin = "v1", primary?: string): Appearance {
  if (skin !== "v2") {
    return { theme: "stripe", variables: { colorPrimary: "#c8653d" } };
  }
  const accent = primary?.trim() || "#c05f3c";
  return {
    theme: "stripe",
    variables: {
      colorPrimary: accent,
      colorBackground: "#ffffff",
      colorText: "#1d2b3a",
      colorTextSecondary: "#6b6259",
      colorTextPlaceholder: "#a9a29b",
      colorDanger: "#c0392b",
      borderRadius: "10px",
      spacingUnit: "3.6px",
      fontSizeBase: "14px",
    },
    rules: {
      ".Input": {
        border: "1px solid #dcd4cb",
        boxShadow: "none",
        padding: "11px 12px",
      },
      ".Input:focus": {
        border: `1px solid ${accent}`,
        boxShadow: "0 0 0 3px rgba(192,95,60,.14)",
      },
      ".Label": {
        color: "#3c4757",
        fontWeight: "600",
        fontSize: "12px",
      },
      // The method tabs across the top of the box, which is what the design
      // draws as Card / UPI / Netbanking — except these are Stripe's, so they
      // say whatever it actually offers the person looking at them.
      ".Tab": {
        border: "1px solid #dcd4cb",
        boxShadow: "none",
        color: "#6b6259",
      },
      ".Tab--selected": {
        border: `1.5px solid ${accent}`,
        backgroundColor: "#fdf4f0",
        color: accent,
      },
      ".Tab:hover": { color: "#1d2b3a" },
    },
  };
}
