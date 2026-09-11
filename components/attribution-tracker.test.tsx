// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AttributionTracker } from "@/components/attribution-tracker";

/**
 * Capturing the click ids the pixel writes LATE than we run.
 *
 * Meta's `_fbp` and `_fbc` are written by fbevents.js, which the pixel snippet
 * loads async — so on a first visit neither cookie exists when this component's
 * effect runs. Until 11 Sep 2026 the consent event happened to run the capture
 * a second time and pick them up. With the banner gone there is no such event,
 * and `_fbp` is the single strongest match signal a server-side event can
 * carry: losing it on every first visit is losing attribution on every ad click.
 */

let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

const bodies = () =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));

function setCookie(raw: string) {
  Object.defineProperty(document, "cookie", { value: raw, writable: true, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  sessionStorage.clear();
  setCookie("");
  fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, stored: true }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Let the mocked fetch's promise chain settle under fake timers. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("capturing click ids the pixel has not written yet", () => {
  it("sends on mount even with no pixel cookies, so a blocked pixel still records the campaign", async () => {
    act(() => root.render(<AttributionTracker />));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodies()[0].clickIds).toEqual({});
  });

  it("does not mark itself done until one of Meta's own cookies is in the payload", async () => {
    act(() => root.render(<AttributionTracker />));
    await settle();

    // The bug this guards: marking done on any successful store means the run
    // that WOULD have carried _fbp never happens.
    expect(sessionStorage.getItem("gi_tracked")).toBeNull();
  });

  it("re-sends once the pixel writes _fbp, then stops", async () => {
    act(() => root.render(<AttributionTracker />));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setCookie("_fbp=fb.1.1788181996708.4712053108");
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies()[1].clickIds.fbp).toBe("fb.1.1788181996708.4712053108");
    expect(sessionStorage.getItem("gi_tracked")).toBe("1");

    // And having got what it came for, it stops asking.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("costs no requests at all when the pixel is blocked", async () => {
    act(() => root.render(<AttributionTracker />));
    await settle();

    // Fifteen seconds of polling with no cookie ever appearing. Re-posting an
    // identical payload 30 times would be 30 wasted requests on pages that
    // take money.
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
