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
  // Centred when it fits on the screen. A target taller than the screen is
  // read from its top: centring a 2,800px order card (Foundations Weekend,
  // 22 Oct 2026) landed the reader in its middle with the heading 992px out
  // of view. `scroll-margin-top` on the target still applies to "start".
  // "Fits" leaves room for the target's own `scroll-margin-top` on both sides:
  // a pinned nav covers that much of the screen, and an 874px card centred in
  // 900 put its top 13px down, under a 70px nav.
  const margin = el ? parseFloat(getComputedStyle(el).scrollMarginTop) || 0 : 0;
  const fits = !el || el.getBoundingClientRect().height <= window.innerHeight - 2 * margin;
  el?.scrollIntoView({ block: fits ? "center" : "start" });
  window.setTimeout(() => el?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus(), 600);
}
