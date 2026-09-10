// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import Chat from "@/components/apps/product-builder/Chat";

/**
 * What a 375px phone showed on 10 Sep 2026, and the rules that came out of it.
 *
 * jsdom lays nothing out, so the layout rules are pinned by their classes —
 * the honest minimum for CSS — and the one piece of behaviour (Enter on a
 * phone) is exercised for real. Each entry names the screenshot it came from.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("the built-in app header", () => {
  const src = read("components/apps/app-header.tsx");
  it("keeps Account off the bar until there is room, so the app's own name is not the thing that truncates", () => {
    // mpb-session.png: "Micro-Prod…" beside two full nav labels.
    expect(src).toMatch(/href="\/account"[^>]*className="[^"]*\bhidden\b[^"]*\bsm:inline\b/);
    expect(src).toMatch(/text-sm font-semibold text-navy sm:text-base/);
  });
});

describe("the product builder on a phone", () => {
  const ws = read("components/apps/product-builder/Workspace.tsx");
  const chat = read("components/apps/product-builder/Chat.tsx");

  it("bounds the pane height only where two panes stand side by side", () => {
    // 855px of page on an 812px viewport: the composer sat below the fold.
    expect(ws).not.toContain('style={{ height: "calc(100dvh - 150px)"');
    expect(ws.match(/lg:h-\[calc\(100dvh-150px\)\] lg:min-h-\[420px\]/g)).toHaveLength(2);
  });

  it("sticks the composer to the bottom on a phone and not at lg", () => {
    expect(chat).toMatch(/sticky bottom-0 z-10[^"]*lg:static/);
    expect(chat, "must clear the home indicator").toContain("env(safe-area-inset-bottom)");
  });

  it("scrolls the newest message into view whichever container scrolls", () => {
    // At lg the list scrolls; on a phone the page does. scrollTo on the list
    // does nothing in the second case.
    expect(chat).toContain("scrollIntoView(");
    expect(chat).not.toContain("el.scrollTo(");
  });

  it("keeps the placeholder to one line and moves the shortcut hint where a keyboard exists", () => {
    expect(chat).not.toContain("Enter sends, Shift+Enter for a new line.");
    expect(chat).toMatch(/hidden sm:inline">Enter sends/);
  });
});

describe("Enter in the coach's reply box", () => {
  let mounted: { unmount: () => void } | null = null;
  afterEach(() => {
    const r = mounted; mounted = null;
    if (r) act(() => r.unmount());
    vi.unstubAllGlobals();
  });

  function mountWith(finePointer: boolean) {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("pointer: fine") && finePointer, media: q, addEventListener() {}, removeEventListener() {} }));
    Element.prototype.scrollIntoView = () => {};
    document.body.innerHTML = "";
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host); mounted = root;
    const onSend = vi.fn();
    act(() => {
      root.render(
        <Chat messages={[]} streamingText={null} disabled={false} draft="my answer" onDraftChange={() => {}} onSend={onSend} canSkip={false} onSkip={() => {}} />,
      );
    });
    const ta = document.querySelector("textarea")!;
    act(() => { ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    return onSend;
  }

  it("sends with a mouse and keyboard, as it always did", () => {
    expect(mountWith(true)).toHaveBeenCalledWith("my answer");
  });

  it("does not send on a phone, where Enter is the only way to start a new line", () => {
    // The Send button is beside the box; every chat app on a phone does this.
    expect(mountWith(false)).not.toHaveBeenCalled();
  });
});

describe("the hook generator", () => {
  it("gives the example placeholder the four lines it takes at 375px", () => {
    // hooks.png: the fourth line of the example was cut off mid-word.
    expect(read("components/apps/hook-generator/Generator.tsx")).toMatch(/rows=\{4\}/);
  });
});

describe("a lesson body written by a client", () => {
  const src = read("components/library/lesson-view.tsx");
  it("breaks a long unbroken string instead of widening the page", () => {
    // lesson-text.png: one pasted URL made the page 1412px wide on a 375px phone.
    expect(src).toContain("[overflow-wrap:anywhere]");
  });
  it("keeps images, embeds, code and tables inside the column", () => {
    for (const rule of ["[&_img]:max-w-full", "[&_iframe]:max-w-full", "[&_pre]:overflow-x-auto", "[&_table]:overflow-x-auto"]) {
      expect(src).toContain(rule);
    }
  });
});

describe("the course page and the library on a phone", () => {
  it("stacks the progress line above the Continue button", () => {
    // course.png: "0 of 4 complete" crushed into a two-line column beside a two-line pill.
    expect(read("components/library/course-overview.tsx")).toMatch(/flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between/);
  });
  it("lets the Your apps heading and its kicker wrap instead of touching", () => {
    // library.png: "Your appsINCLUDED WITH YOUR PURCHASE".
    expect(read("app/(store)/library/page.tsx")).toMatch(/flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1/);
  });
});
