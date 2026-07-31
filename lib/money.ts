/**
 * The one place prices become text.
 *
 * This exists because it was previously seven places: the storefront card, the
 * product page and the admin lists each did `(cents / 100).toFixed(0)`, while
 * checkout used Intl. A $4.99 product therefore advertised "$5" on the card and
 * charged $4.99 at the till — the store quietly misstating its own price, which
 * is a consumer-protection problem, not a rounding nit.
 *
 * Cents are dropped only when there are none, so $27 stays "$27" rather than
 * "$27.00" and $4.99 keeps its cents. Never take a float here; prices are
 * integer cents everywhere in this codebase for exactly this reason.
 */
export function money(cents: number, currency = "usd"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}
