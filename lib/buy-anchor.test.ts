// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { scrollToBuy } from "@/lib/buy-anchor";

/** A target of a given height, with scrollIntoView recorded. */
function target(height: number) {
  const el = document.createElement("section");
  el.id = "join";
  el.getBoundingClientRect = () => ({ height, top: 0, bottom: height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const spy = vi.fn();
  el.scrollIntoView = spy;
  document.body.appendChild(el);
  return spy;
}

describe("scrollToBuy", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("centres a target that fits on the screen", () => {
    const spy = target(window.innerHeight - 100);
    scrollToBuy("join");
    expect(spy).toHaveBeenCalledWith({ block: "center" });
  });

  it("starts a target taller than the screen at its top", () => {
    const spy = target(window.innerHeight + 2000);
    scrollToBuy("join");
    expect(spy).toHaveBeenCalledWith({ block: "start" });
  });

  it("starts a target that only fits if a pinned nav is ignored", () => {
    // 874 tall in a 900 screen, under a 70px pinned nav: centring puts its top
    // 13px down, behind the nav. Its scroll margin says the nav is there.
    const spy = target(window.innerHeight - 26);
    document.getElementById("join")!.style.scrollMarginTop = "70px";
    scrollToBuy("join");
    expect(spy).toHaveBeenCalledWith({ block: "start" });
  });

  it("does nothing when there is nothing to point at", () => {
    expect(() => scrollToBuy("nowhere")).not.toThrow();
  });
});
