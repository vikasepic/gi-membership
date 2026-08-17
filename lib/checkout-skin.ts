/**
 * Which checkout a visitor gets.
 *
 * "v1" is the checkout that has always shipped and is what everybody sees.
 * "v2" is the redesign, and it is reachable only by asking for it in the URL —
 * `?skin=v2` — so it can be looked at, filled in and paid through on the live
 * site without being the checkout the store is selling on.
 *
 * A query parameter rather than a second route, because a second route would
 * be a second money path: two places creating intents, two places resolving
 * coupons, two places to fix a bug in and one of them forgotten. Same URL, same
 * server actions, same Stripe calls — the only thing that differs is the
 * arrangement of the pieces on the page.
 *
 * When the redesign is approved this is where the default flips, and the whole
 * change is the string on the next line.
 */
export type CheckoutSkin = "v1" | "v2";

/**
 * The checkout everybody gets.
 *
 * Approved 17 Aug 2026. It was "v1" while the redesign was being looked at,
 * reachable only by asking for it in the URL; it is the checkout now.
 *
 * The old one has not been deleted and is one word away — see below.
 */
export const DEFAULT_SKIN: CheckoutSkin = "v2";

/**
 * Which checkout this request gets.
 *
 * Both are namable, and that is deliberate now that the redesign is the
 * default: `?skin=v1` is the way back. If something about the new one goes
 * wrong on a live sale, the fix is a link — not a deploy, not a revert, not a
 * rebuild while people are trying to pay.
 */
export function checkoutSkin(raw: string | string[] | undefined): CheckoutSkin {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (value === "v2") return "v2";
  if (value === "v1") return "v1";
  return DEFAULT_SKIN;
}

/**
 * Carry the skin across a link.
 *
 * The redesign spans more than one page — a bump leads to an upsell, a failed
 * card leads back — and a preview that drops back to the old checkout halfway
 * through is a preview of neither.
 */
export function withSkin(href: string, skin: CheckoutSkin): string {
  if (skin === DEFAULT_SKIN) return href;
  return href + (href.includes("?") ? "&" : "?") + `skin=${skin}`;
}
