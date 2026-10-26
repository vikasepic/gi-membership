// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The recent buyers card. It runs on pages that take money, so every failure
 * is silence: no card, nothing thrown, nothing else on the page touched.
 */

const { RecentBuyers } = await import("@/components/recent-buyers");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card = (firstName: string, over: Record<string, unknown> = {}) => ({
  firstName,
  initial: firstName[0],
  country: "IN",
  flagSvg: "<svg></svg>",
  verb: "enrolled in",
  itemName: "Book to Bestseller",
  imageUrl: null,
  at: new Date().toISOString(),
  ...over,
});

let host: HTMLDivElement;
let root: Root;
let urls: string[] = [];
let respond: () => Promise<Response>;

const body = (cards: unknown[]) => () =>
  Promise.resolve(new Response(JSON.stringify({ gapMs: 2000, showMs: 1000, cards })));

beforeEach(() => {
  vi.useFakeTimers();
  urls = [];
  respond = body([card("Priya"), card("Tomás")]);
  vi.stubGlobal("fetch", vi.fn((url: string) => (urls.push(url), respond())));
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.querySelectorAll("[data-test-bar]").forEach((b) => b.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
});

const mount = async (scope: Parameters<typeof RecentBuyers>[0]["scope"] = { offer: "o1" }) => {
  await act(async () => root.render(<RecentBuyers scope={scope} />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const shown = () => document.querySelector(".rb-name")?.textContent ?? null;

describe("the recent buyers card", () => {
  it("asks for its own page's buyers", async () => {
    await mount({ product: "p1" });
    expect(urls).toEqual(["/api/recent-buyers?product=p1"]);
  });

  it("waits four seconds before the first card", async () => {
    await mount();
    await wait(3900);
    expect(shown()).toBeNull();
    await wait(200);
    expect(shown()).toBe("Priya");
  });

  it("keeps a card up for showMs, lets it leave, then is quiet for gapMs, then shows the next", async () => {
    await mount();
    await wait(4000);
    await wait(1000);
    // Leaving, not gone: it slides out before the next one comes.
    expect(document.querySelector(".rb-card.rb-out .rb-name")?.textContent).toBe("Priya");
    await wait(350);
    expect(shown()).toBeNull();
    await wait(1999);
    expect(shown()).toBeNull();
    await wait(1);
    expect(shown()).toBe("Tomás");
    expect(document.querySelector(".rb-card.rb-out")).toBeNull();
  });

  it("hides the card, waits a beat, then shows the next, even when the gap is zero", async () => {
    // A gap of 0 is a setting, not a missing value; it must not fall back.
    respond = () =>
      Promise.resolve(new Response(JSON.stringify({ gapMs: 0, showMs: 5000, cards: [card("Priya"), card("Tomás")] })));
    await mount();
    await wait(4000);
    expect(shown()).toBe("Priya");
    await wait(5000);
    expect(document.querySelector(".rb-card.rb-out")).not.toBeNull();
    await wait(350);
    // Hidden first (owner, 26 Oct 2026): a beat with no card, never a swap.
    expect(shown()).toBeNull();
    await wait(199);
    expect(shown()).toBeNull();
    await wait(1);
    expect(shown()).toBe("Tomás");
  });

  it("plays a short list twice, then stops", async () => {
    await mount();
    const seen: string[] = [];
    await wait(4000);
    for (let i = 0; i < 12; i++) {
      const name = shown();
      if (name) seen.push(name);
      await wait(3350);
    }
    expect(seen).toEqual(["Priya", "Tomás", "Priya", "Tomás"]);
  });

  it("stops for the rest of the visit once closed", async () => {
    await mount();
    await wait(4000);
    await act(async () => (document.querySelector(".rb-close") as HTMLButtonElement).click());
    expect(shown()).toBeNull();
    expect(sessionStorage.getItem("rb-closed")).toBe("1");
    await wait(30_000);
    expect(shown()).toBeNull();
  });

  it("does not start at all in a visit that already closed it", async () => {
    sessionStorage.setItem("rb-closed", "1");
    await mount();
    await wait(10_000);
    expect(shown()).toBeNull();
  });

  it("still works where sessionStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await mount();
    await wait(4000);
    expect(shown()).toBe("Priya");
  });

  it("draws nothing with no cards, and nothing when the request fails", async () => {
    respond = body([]);
    await mount();
    await wait(10_000);
    expect(host.innerHTML).toBe("");
    respond = () => Promise.reject(new Error("offline"));
    await mount({ home: true });
    await wait(10_000);
    expect(host.innerHTML).toBe("");
  });

  it("sits above a bar fixed to the bottom, even one that appeared after the first card", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    await mount();
    await wait(4000);
    expect((document.querySelector(".rb-card") as HTMLElement).style.bottom).toBe("12px");
    const bar = document.createElement("div");
    bar.dataset.testBar = "";
    bar.style.position = "fixed";
    bar.getBoundingClientRect = () => ({ top: window.innerHeight - 64, bottom: window.innerHeight }) as DOMRect;
    document.body.appendChild(bar);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = () => [bar];
    await wait(3350);
    expect(shown()).toBe("Tomás");
    expect((document.querySelector(".rb-card") as HTMLElement).style.bottom).toBe("76px");
  });

  it("moves up when a bar slides in while a card is already showing", async () => {
    // The builder's sticky bar (Foundations Weekend's seat bar) slides in on
    // scroll, which can happen mid-card; the card would cover its button.
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    await mount();
    await wait(4000);
    expect((document.querySelector(".rb-card") as HTMLElement).style.bottom).toBe("12px");
    const bar = document.createElement("div");
    bar.dataset.testBar = "";
    bar.style.position = "fixed";
    bar.getBoundingClientRect = () => ({ top: window.innerHeight - 64, bottom: window.innerHeight }) as DOMRect;
    document.body.appendChild(bar);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = () => [bar];
    await wait(500);
    expect(shown()).toBe("Priya");
    expect((document.querySelector(".rb-card") as HTMLElement).style.bottom).toBe("76px");
  });

  it("finds a bar whose wrapper lets clicks through and whose pill floats above the edge", async () => {
    // Foundations Weekend: the fixed wrapper is pointer-events none, so a hit
    // test never returns it, and the pill inside sits 16px clear of the bottom.
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    const wrapper = document.createElement("div");
    wrapper.dataset.testBar = "";
    wrapper.style.position = "fixed";
    wrapper.getBoundingClientRect = () => ({ top: window.innerHeight - 80, bottom: window.innerHeight }) as DOMRect;
    const pill = document.createElement("div");
    wrapper.appendChild(pill);
    document.body.appendChild(wrapper);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = (_x: number, y: number) =>
      y >= window.innerHeight - 16 ? [document.body] : y >= window.innerHeight - 70 ? [pill] : [document.body];
    await mount();
    await wait(4000);
    expect((document.querySelector(".rb-card") as HTMLElement).style.bottom).toBe("92px");
  });

  it("shows no flag when there is none, and the initial when there is no picture", async () => {
    respond = body([card("Priya", { flagSvg: null, country: null })]);
    await mount();
    await wait(4000);
    expect(document.querySelector(".rb-flag")).toBeNull();
    expect(document.querySelector(".rb-initial")?.textContent).toBe("P");
  });

  it("names the buyer, the product and the age", async () => {
    await mount();
    await wait(4000);
    const text = document.querySelector(".rb-card")?.textContent ?? "";
    expect(text).toContain("enrolled in");
    expect(text).toContain("Book to Bestseller");
    expect(text).toContain("just now");
    expect(text).toContain("Verified");
  });
});
