// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Posts the path once per page a member opens. Lives in the store layout, so
 * it has to notice client-side navigations itself: the layout is not
 * re-rendered for them, and a server-side record there would see only the
 * first page of a session.
 */

const nav = vi.hoisted(() => ({ path: "/library" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

const { MemberViewTracker } = await import("@/components/member-view-tracker");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const posted: { url: string; body: unknown }[] = [];

beforeEach(() => {
  posted.length = 0;
  nav.path = "/library";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    posted.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response("{}");
  }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = () => act(() => root.render(<MemberViewTracker />));

describe("the member view tracker", () => {
  it("posts the page it is on, once", () => {
    render();
    render();
    expect(posted).toEqual([{ url: "/api/track/view", body: { path: "/library" } }]);
  });

  it("posts again when the member navigates", () => {
    render();
    nav.path = "/o/funnel-app";
    render();
    expect(posted.map((p) => (p.body as { path: string }).path)).toEqual(["/library", "/o/funnel-app"]);
  });

  it("draws nothing", () => {
    render();
    expect(host.innerHTML).toBe("");
  });
});
