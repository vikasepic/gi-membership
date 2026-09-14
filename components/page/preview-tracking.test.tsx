// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const post = vi.fn(async () => ({ json: async () => ({}) }));
vi.stubGlobal("fetch", post);
// next/script injects into the document head and renders nothing in place
// under jsdom, which would make "no script" pass whether or not the pixel
// mounted. A plain tag in place is what makes the assertion below real.
vi.mock("next/script", () => ({
  default: (p: { id?: string; src?: string }) => <script id={p.id} src={p.src} />,
}));

const { AttributionTracker } = await import("@/components/attribution-tracker");
const { Analytics } = await import("@/components/analytics");

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
  post.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function mount(node: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host!).render(node));
  return host;
}

describe("a preview is not a visit", () => {
  it("the attribution tracker posts nothing", async () => {
    window.history.replaceState(null, "", "/p/x?preview=1&utm_source=meta");
    mount(<AttributionTracker />);
    await act(async () => {});
    expect(post).not.toHaveBeenCalled();
  });

  it("the same tracker does post on a real visit", async () => {
    // So the test above cannot pass by the tracker being broken.
    window.history.replaceState(null, "", "/p/x?utm_source=meta");
    mount(<AttributionTracker />);
    await act(async () => {});
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("the pixel does not mount", async () => {
    window.history.replaceState(null, "", "/?preview=1");
    const el = mount(<Analytics ids={{ metaPixelId: "1" }} />);
    await act(async () => {});
    expect(el.querySelector("script#meta-pixel")).toBeNull();
  });

  it("the same pixel does mount on a real visit", async () => {
    window.history.replaceState(null, "", "/");
    const el = mount(<Analytics ids={{ metaPixelId: "1" }} />);
    await act(async () => {});
    expect(el.querySelector("script#meta-pixel")).not.toBeNull();
  });
});
