import { z } from "zod";

/**
 * What the store can change about its checkout, and nothing else.
 *
 * The checkout used to be editable in the page builder — the same blocks a
 * sales page is made of, arranged freely. That was too much rope on the one
 * page where a mistake costs money rather than attention: a layout could lose
 * its card fields, so the live page had to check every saved arrangement
 * before trusting it and silently fall back when it did not hold up. The
 * editor and the guard were most of the complexity, and neither existed to
 * make the checkout better.
 *
 * Three colours and a set of switches. Everything a store actually wanted to
 * change is here; nothing here can produce a checkout that cannot take a
 * payment, so there is nothing to guard against.
 *
 * The card fields, the total and the pay button are deliberately absent. They
 * are not switchable — a checkout without them is not a checkout.
 */
export const checkoutDesignSchema = z.object({
  /** The selling half. */
  panelBackground: z.string().trim().default("#1d2b3a"),
  /** The ground the paying half sits on. */
  pageBackground: z.string().trim().default("#fbf7f3"),
  /** The pay button, and everything that agrees with it. */
  buttonColor: z.string().trim().default("#c05f3c"),

  // The panel.
  showBackLink: z.boolean().default(true),
  showSecureLine: z.boolean().default(true),
  showImage: z.boolean().default(true),
  showPrice: z.boolean().default(true),
  showBullets: z.boolean().default(true),

  // The form.
  showDiscountCode: z.boolean().default(true),
  showTrustRow: z.boolean().default(true),
  showTaxNote: z.boolean().default(true),
  /**
   * "7 days free, then $29 every month, cancel any time", beside the total.
   *
   * Switchable, but not silently: a recurring charge has to be stated
   * somewhere before it is taken, and turning this off on a store that sells
   * subscriptions is how a first renewal becomes a dispute. The editor says
   * so at the switch.
   */
  showRenewalLine: z.boolean().default(true),
});

export type CheckoutDesign = z.infer<typeof checkoutDesignSchema>;

export const CHECKOUT_DESIGN_DEFAULTS: CheckoutDesign = checkoutDesignSchema.parse({});

/**
 * The colours, as the custom properties the checkout is painted from.
 *
 * The page sets these on its wrapper and every piece below inherits — the same
 * trick the redesign already uses to re-skin the shared slots, so a colour
 * change reaches the buyer details, the coupon box and the pay button without
 * any of them knowing a setting exists.
 *
 * A blank value is dropped rather than written empty: an unset colour has to
 * fall through to the stylesheet's own, and `--primary: ` would win over it
 * and paint nothing.
 */
export function checkoutDesignVars(d: CheckoutDesign | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  // Tolerates nothing at all on purpose. A stored settings blob written before
  // this group existed has no checkoutDesign in it, and the page that reads it
  // is the one that takes the money — a missing colour has to cost this page
  // its colour, never its ability to sell.
  if (!d) return vars;
  if (d.pageBackground) vars["--bg"] = d.pageBackground;
  if (d.buttonColor) {
    vars["--primary"] = d.buttonColor;
    // Hover is derived rather than asked for. Two colour pickers for one
    // button is a setting nobody fills in twice, and the second one being
    // wrong is a button that changes colour when you touch it.
    vars["--primary-hover"] = `color-mix(in srgb, ${d.buttonColor} 86%, #000)`;
  }
  return vars;
}
