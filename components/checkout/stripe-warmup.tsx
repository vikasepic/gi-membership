/**
 * Start fetching Stripe.js before our own bundle has finished.
 *
 * `loadStripe` runs inside the checkout form, which means Stripe's script was
 * not even requested until the checkout's JavaScript had downloaded, parsed
 * and hydrated. Measured 25 Sep 2026 on a fast connection: page ready at
 * 0.6 s, Stripe requested at 2.3 s, card fields usable at 3.3 s on desktop and
 * 6.2 s on a phone. The Payment box is blank until then, and 79% of paid
 * traffic is on a phone.
 *
 * Two <link>s rendered here; React hoists them into <head>. The preconnect
 * warms DNS, TCP and TLS; the preload fetches the script itself, in parallel
 * with our bundle. When `loadStripe` later injects its own tag for the same
 * URL the browser serves it from that cache. Its `findScript` matches
 * `https://js.stripe.com/v3/` exactly, so the URL here must not vary.
 *
 * Checkout pages only, on purpose. Next's `beforeInteractive` would achieve
 * the same but must live in the root layout, which puts a third-party script
 * on every page of the store, admin included.
 */
export function StripeWarmup() {
  return (
    <>
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preload" href="https://js.stripe.com/v3/" as="script" />
    </>
  );
}
