// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * An event fired before the pixel exists must still arrive.
 *
 * `TrackView` reports on mount, which is a React effect at hydration. The Meta
 * pixel is a `next/script` with `afterInteractive`, which by definition runs
 * AFTER that. So `window.fbq` was undefined at the moment the event fired,
 * `window.fbq?.(…)` no-opped, and the `sent` ref meant it was never retried.
 *
 * Verified live on 22 Aug 2026 against production, consent already granted and
 * the pixel warm: the product page sent Meta a PageView and nothing else. Its
 * ViewContent — the one upper-funnel signal an ad campaign has on a landing
 * page — had never once fired. The checkout's events were fine, because they
 * fire later, after a form is ready.
 *
 * These tests run the real module, so they exercise the ordering rather than a
 * description of it.
 */

async function freshModule() {
  vi.resetModules();
  return import("@/components/analytics");
}

beforeEach(() => {
  delete (window as { fbq?: unknown }).fbq;
  delete (window as { gtag?: unknown }).gtag;
});

describe("an event fired before the pixel loads", () => {
  it("is delivered once the pixel arrives", async () => {
    const { track, flushPendingPixelCalls } = await freshModule();

    // Hydration: TrackView fires, and fbq does not exist yet.
    track("ViewContent", { content_ids: ["digital-product-validator"] });

    const fbq = vi.fn();
    (window as { fbq?: unknown }).fbq = fbq;
    expect(fbq, "fired into a void — the live bug").not.toHaveBeenCalled();

    // afterInteractive: the pixel script runs and defines fbq.
    flushPendingPixelCalls();

    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq.mock.calls[0][1]).toBe("ViewContent");
  });

  it("still goes straight out when the pixel is already there", async () => {
    const { track, flushPendingPixelCalls } = await freshModule();
    const fbq = vi.fn();
    (window as { fbq?: unknown }).fbq = fbq;

    track("ViewContent", {});
    expect(fbq).toHaveBeenCalledTimes(1);

    // A later flush must not send it a second time. A ViewContent counted
    // twice is a conversion rate halved.
    flushPendingPixelCalls();
    expect(fbq).toHaveBeenCalledTimes(1);
  });

  it("drops what it was holding when consent is refused", async () => {
    // Buffering is not a licence to send later. Someone who declines must not
    // have the events from before their click delivered the moment some other
    // page happens to load a pixel.
    const { track, dropPendingPixelCalls, flushPendingPixelCalls } = await freshModule();

    track("ViewContent", {});
    dropPendingPixelCalls();

    const fbq = vi.fn();
    (window as { fbq?: unknown }).fbq = fbq;
    flushPendingPixelCalls();
    expect(fbq).not.toHaveBeenCalled();
  });

  it("cannot grow without limit while nobody ever consents", async () => {
    const { track, flushPendingPixelCalls, pendingPixelCallCount } = await freshModule();
    for (let i = 0; i < 500; i++) track("ViewContent", { i });
    expect(pendingPixelCallCount()).toBeLessThanOrEqual(50);
    flushPendingPixelCalls();
  });
});
