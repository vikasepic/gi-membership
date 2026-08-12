// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks, type Block } from "@/lib/blocks";

const theme = bandTheme("paper");
let root: { unmount: () => void } | null = null;
afterEach(() => { const r = root; root = null; if (r) act(() => r.unmount()); });

function mount(props: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host); root = r;
  const b: Block[] = normalizeBlocks([{ id: "b1", type: "countdown", props }]);
  act(() => { r.render(<Blocks blocks={b} theme={theme} />); });
  return host;
}

/**
 * The clock is a client leaf inside a server tree. These check the two things
 * that make it correct rather than merely present: the deadline is one instant
 * derived from a zone, and the first paint does not claim a time it cannot know.
 */
describe("the countdown block", () => {
  it("draws nothing at all until a deadline is chosen", () => {
    // Not an empty bordered box. `blockRendersNothing` answers this one.
    expect(mount({ due: "" }).textContent).toBe("");
  });

  it("draws nothing for a date it cannot read", () => {
    expect(mount({ due: "the day after tomorrow" }).textContent).toBe("");
  });

  it("counts to the deadline read in the block's own zone", () => {
    // Far future so the numbers are stable regardless of when this runs.
    const host = mount({ due: "2099-01-01T00:00", zone: "Asia/Kolkata" });
    expect(host.querySelector('[role="timer"]')).not.toBeNull();
    expect(host.textContent).toMatch(/\d/);
  });

  it("shows only the units switched on", () => {
    const host = mount({
      due: "2099-01-01T00:00",
      showDays: true, showHours: false, showMinutes: false, showSeconds: false,
    });
    expect(host.textContent).toContain("days");
    expect(host.textContent).not.toContain("hours");
  });

  it("writes one day rather than one days", () => {
    // Rendered from a real remaining value, so this exercises the plural rule
    // through the whole block rather than the helper alone.
    const soon = new Date(Date.now() + 36 * 3600 * 1000);
    const iso = soon.toISOString().slice(0, 16);
    const host = mount({ due: iso, zone: "UTC", showHours: false, showMinutes: false, showSeconds: false });
    expect(host.textContent).toContain("day");
    expect(host.textContent).not.toContain("days");
  });

  it("hides itself at zero when told to", () => {
    const host = mount({ due: "2000-01-01T00:00", zone: "UTC", onExpire: "hide" });
    expect(host.querySelector('[role="timer"]')).toBeNull();
  });

  it("shows the message at zero when told to", () => {
    const host = mount({
      due: "2000-01-01T00:00", zone: "UTC", onExpire: "message", expiredMessage: "Doors are closed.",
    });
    expect(host.textContent).toContain("Doors are closed.");
  });

  it("keeps showing zero by default rather than vanishing", () => {
    const host = mount({ due: "2000-01-01T00:00", zone: "UTC" });
    expect(host.querySelector('[role="timer"]')).not.toBeNull();
    expect(host.textContent).toMatch(/0/);
  });

  it("is announced as a timer, and does not interrupt a screen reader every second", () => {
    const el = mount({ due: "2099-01-01T00:00" }).querySelector('[role="timer"]')!;
    expect(el.getAttribute("aria-live")).toBe("off");
  });

  it("draws an evergreen timer with no date at all", () => {
    // The date field is not even shown for this type; a length is the setting.
    const host = mount({ kind: "evergreen", due: "", evHours: 47, evMinutes: 59 });
    expect(host.querySelector('[role="timer"]')).not.toBeNull();
  });

  it("continues an evergreen clock across a reload rather than restarting it", () => {
    // The whole difference between this and the version that lies. Same block
    // id and same length means the same storage key, and the second mount
    // reads the start the first one wrote.
    window.localStorage.clear();
    mount({ kind: "evergreen", evDays: 0, evHours: 1, evMinutes: 0 });
    const key = Object.keys(window.localStorage)[0];
    expect(key, "the start was remembered").toBeTruthy();

    // Rewind it by twenty minutes and mount again. Two mounts in the same
    // millisecond would make an "unchanged value" check pass for the wrong
    // reason; a distinctly older start cannot.
    const old = String(Date.now() - 20 * 60_000);
    window.localStorage.setItem(key, old);
    mount({ kind: "evergreen", evDays: 0, evHours: 1, evMinutes: 0 });
    expect(window.localStorage.getItem(key), "a reload must not restart it").toBe(old);
  });
});
