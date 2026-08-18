/**
 * Where a bar that points at the price should send somebody.
 *
 * Named first, then the choice, then the first thing that buys. Two bars use
 * this — the editable Sticky bar block and the upsell's built-in one — and a
 * bar that scrolled somewhere the other one did not would be two answers to
 * the same question on the same page.
 */
export function buyAnchor(scrollTo = ""): HTMLElement | null {
  return (
    (scrollTo.trim() ? document.getElementById(scrollTo.trim()) : null) ??
    document.querySelector<HTMLElement>("[data-ways-to-pay]") ??
    document.querySelector<HTMLElement>("[data-buy]")
  );
}

/**
 * Scroll to it, and land the keyboard where the eye does.
 *
 * No `behavior` on purpose: unset means "whatever the stylesheet says", which
 * is smooth for everybody and instant for anyone who has asked their system
 * for less motion. Naming "smooth" here would override that preference from
 * JavaScript, where the media query cannot reach it.
 */
export function scrollToBuy(scrollTo = ""): void {
  const el = buyAnchor(scrollTo);
  el?.scrollIntoView({ block: "center" });
  window.setTimeout(() => el?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus(), 600);
}
