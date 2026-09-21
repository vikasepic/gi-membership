// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VideoPlayer } from "@/components/library/video-player";

/**
 * The bridge between a player we do not control and a row in our database.
 *
 * Everything here is about trusting the right sender. The page frames a third
 * party, any frame on a page can post a message, and a message is all it
 * takes to move a member's playhead or mark a lesson finished. The origin
 * check is the whole guard, so it gets the tests.
 */

vi.mock("@/components/analytics", () => ({ track: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
const posts: { url: string; body: unknown }[] = [];

const VIMEO = "https://player.vimeo.com";
const YOUTUBE = "https://www.youtube.com";
const HOSTILE = "https://evil.example.com";

/** A timeupdate as Vimeo sends it. */
const vimeoMessage = (seconds: number, duration: number) =>
  JSON.stringify({ event: "timeupdate", data: { seconds, percent: seconds / duration, duration } });

/** An infoDelivery as YouTube sends it. */
const youtubeMessage = (currentTime: number, duration: number) =>
  JSON.stringify({ event: "infoDelivery", info: { currentTime, duration } });

function send(origin: string, data: string) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { origin, data }));
  });
}

function render(props: Partial<Parameters<typeof VideoPlayer>[0]> = {}) {
  act(() => {
    root.render(
      <VideoPlayer
        itemId="item-1"
        courseId="course-1"
        url="https://vimeo.com/123456789"
        watch={null}
        interactive
        {...props}
      />,
    );
  });
}

beforeEach(() => {
  posts.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      posts.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return { ok: true, json: async () => ({ ok: true, completed: true }) } as unknown as Response;
    }),
  );
  // sendBeacon is what the unload path uses; record it the same way.
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(Object.getPrototypeOf(window.navigator)), window.navigator, {
      sendBeacon: vi.fn((url: string, blob: Blob) => {
        void blob;
        posts.push({ url, body: "beacon" });
        return true;
      }),
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("who is allowed to move the playhead", () => {
  it("ignores a message from any origin we did not frame", () => {
    render();
    // A forged completion is the prize here: one postMessage would otherwise
    // mark a three-hour lesson finished without it being watched.
    send(HOSTILE, vimeoMessage(9999, 10000));
    expect(posts).toHaveLength(0);
  });

  it("takes a position from Vimeo", () => {
    render();
    send(VIMEO, vimeoMessage(1800, 10800));
    // Under the save interval, so nothing is written yet; the unmount flush
    // is what proves the position was taken at all.
    act(() => root.unmount());
    const saved = posts.find((p) => typeof p.body === "object" && p.body !== null);
    expect(saved?.url).toBe("/api/progress");
  });

  it("takes a position from YouTube", () => {
    render({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    send(YOUTUBE, youtubeMessage(1800, 10800));
    act(() => root.unmount());
    expect(posts.some((p) => p.url === "/api/progress")).toBe(true);
  });
});

describe("finishing a lesson", () => {
  it("completes at ninety percent, not before", () => {
    render();
    send(VIMEO, vimeoMessage(9000, 10800)); // 83%
    expect(posts.filter((p) => (p.body as { completed?: boolean })?.completed).length).toBe(0);
    send(VIMEO, vimeoMessage(9800, 10800)); // 91%
    const done = posts.find((p) => (p.body as { completed?: boolean })?.completed);
    expect(done?.body).toMatchObject({ itemId: "item-1", productId: "course-1", completed: true, source: "video" });
  });

  it("reports the completion once, however many messages arrive after it", () => {
    render();
    send(VIMEO, vimeoMessage(10000, 10800));
    send(VIMEO, vimeoMessage(10400, 10800));
    send(VIMEO, vimeoMessage(10700, 10800));
    expect(posts.filter((p) => (p.body as { completed?: boolean })?.completed).length).toBe(1);
  });

  it("writes nothing at all in a preview", () => {
    // The admin previewing a lesson must not record progress against their
    // own account, and the player is part of what they are checking.
    render({ interactive: false });
    send(VIMEO, vimeoMessage(10400, 10800));
    act(() => root.unmount());
    expect(posts).toHaveLength(0);
  });
});

describe("coming back to a long video", () => {
  it("asks before it resumes, naming the time", () => {
    render({ watch: { completed: false, positionSeconds: 6130, durationSeconds: 10800 } });
    expect(host.textContent).toContain("You stopped at 1:42:10");
    expect(host.textContent).toContain("Continue from 1:42:10");
    expect(host.textContent).toContain("Start from the beginning");
    // The player is not mounted until the question is answered, so nothing
    // starts playing behind the prompt.
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("starts the player at that point when the member continues", () => {
    render({ watch: { completed: false, positionSeconds: 6130, durationSeconds: 10800 } });
    const resume = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Continue from"));
    act(() => resume?.click());
    expect(host.querySelector("iframe")?.getAttribute("src")).toContain("#t=6130s");
  });

  it("starts at the beginning when the member asks for that instead", () => {
    render({ watch: { completed: false, positionSeconds: 6130, durationSeconds: 10800 } });
    const over = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Start from"));
    act(() => over?.click());
    const src = host.querySelector("iframe")?.getAttribute("src") ?? "";
    expect(src).not.toContain("#t=");
  });

  it("asks nothing when there is nowhere worth returning to", () => {
    render({ watch: { completed: false, positionSeconds: 4, durationSeconds: 10800 } });
    expect(host.textContent).not.toContain("You stopped at");
    expect(host.querySelector("iframe")).not.toBeNull();
  });
});

describe("a link we cannot play", () => {
  it("says so rather than framing it", () => {
    // Before this, a lesson's video URL went straight into an iframe src,
    // which framed whatever was pasted on a page behind the paywall.
    render({ url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef" });
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.textContent).toContain("not one we can play");
  });
});
