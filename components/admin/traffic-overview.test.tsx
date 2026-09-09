// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TrafficOverview } from "@/components/admin/traffic-overview";
import { overviewFilterFrom, type OverviewRow } from "@/lib/traffic-overview";

const ROWS: OverviewRow[] = [
  {
    key: "book-writer",
    title: "Book Writer",
    path: "/o/book-writer",
    kind: "offer",
    steps: [100, 20, 5, 4],
    drop: { from: 0, percent: 80 },
    daily: [
      { day: "2026-09-08", hits: 40 },
      { day: "2026-09-09", hits: 60 },
    ],
    topSource: { source: "meta", hits: 60 },
  },
  {
    key: null,
    title: "/",
    path: "/",
    kind: "other",
    steps: [70],
    drop: null,
    daily: [],
    topSource: { source: "direct", hits: 70 },
  },
];

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

function mount(over: Record<string, string> = {}) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  const filter = { ...overviewFilterFrom(over), preset: over.preset ?? "30" };
  act(() => {
    root.render(<TrafficOverview rows={ROWS} filter={filter} sources={["meta", "direct"]} />);
  });
}
const text = () => document.body.textContent ?? "";
const hrefs = () => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");

describe("the traffic table", () => {
  it("puts a funnel and a plain page in the same list", () => {
    mount();
    expect(text()).toContain("Book Writer");
    expect(text()).toContain("/o/book-writer");
    // The assertion above already implies the document contains "/" — it's
    // a substring of "/o/book-writer" — so it proves nothing on its own.
    // What "a plain page in the same list" actually claims is that the
    // funnel-less page is its own row, with its path standing in as its
    // title (it has no funnel, so it has no other name).
    const rows = [...document.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(2);
    expect(rows[1].querySelector("td span")!.textContent).toBe("/");
  });

  it("drills into a funnel and leaves a plain page unlinked", () => {
    mount();
    expect(hrefs()).toContain("/admin/traffic/book-writer");
    expect(hrefs().some((h) => h.startsWith("/admin/traffic/") && h.endsWith("/"))).toBe(false);
  });

  it("says where the biggest drop happened, in words", () => {
    mount();
    expect(text()).toContain("80% at the checkout");
  });

  it("keeps the window and the filters in every sort link", () => {
    // A sorted link that dropped the preset would silently change the window
    // under the numbers being sorted.
    mount({ preset: "7", kind: "offer" });
    const sortLinks = hrefs().filter((h) => h.includes("sort="));
    expect(sortLinks.length).toBeGreaterThan(0);
    for (const h of sortLinks) {
      expect(h).toContain("preset=7");
      expect(h).toContain("kind=offer");
    }
  });

  it("flips the direction of the column already sorted", () => {
    mount({ sort: "drop", dir: "desc" });
    expect(hrefs()).toContain("/admin/traffic?sort=drop&dir=asc");
  });

  it("blanks Bought under a source filter, and says why", () => {
    mount({ source: "meta" });
    expect(text()).toContain("not attributed to a source");
    // 4 is the only step the source filter cannot honour; the views stay.
    expect(text()).toContain("100");
    // `text()` is document.body.textContent, which never contains markup, so
    // a `not.toContain(">4<")` assertion on it passes no matter what the
    // component renders. Read the first row's own cells instead: the views
    // cell must still show its number while the Bought cell is blanked.
    const cells = [...document.querySelectorAll("tbody tr")][0].querySelectorAll("td");
    expect(cells[1].textContent).toBe("100");
    expect(cells[4].textContent).toBe("—");
  });

  it("shows dashes rather than zeroes for a page with no funnel", () => {
    mount();
    const cells = [...document.querySelectorAll("tbody tr")][1].querySelectorAll("td");
    expect(cells[1].textContent).toBe("70");
    for (const i of [2, 3, 4]) expect(cells[i].textContent).toBe("—");
  });
});
