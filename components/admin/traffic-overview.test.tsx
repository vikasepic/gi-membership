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
    drop: { to: 1, percent: 80 },
    daily: [
      { day: "2026-09-08", hits: 40 },
      { day: "2026-09-09", hits: 60 },
    ],
    topSource: { source: "meta", hits: 60 },
    bumps: 0,
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
    bumps: null,
  },
];

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const r = mounted;
  mounted = null;
  if (r) act(() => r.unmount());
});

function mount(over: Record<string, string> = {}, rows: OverviewRow[] = ROWS) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  const filter = { ...overviewFilterFrom(over), preset: over.preset ?? "30" };
  act(() => {
    root.render(<TrafficOverview rows={rows} filter={filter} sources={["meta", "direct"]} />);
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

  it("drills into a funnel, carrying the state, and leaves a plain page unlinked", () => {
    // I1: the row link used to drop the query string entirely — reading a
    // 7-day, offers-only table and clicking through landed on an unfiltered
    // 30-day funnel with nothing on the destination saying the window
    // changed. `mount()` with no overrides can't catch that: every field is
    // already at its default, so the link is `/admin/traffic/book-writer`
    // either way. Non-default state is what makes this assertion able to
    // fail.
    mount({ preset: "7", kind: "offer" });
    expect(hrefs()).toContain("/admin/traffic/book-writer?preset=7&kind=offer");
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
    // The row link carries the same state, even though it never sorts —
    // filtering on `sort=` is how the loop above finds the header links, and
    // that filter would silently skip the row link forever if it were the
    // only check in this file.
    expect(hrefs()).toContain("/admin/traffic/book-writer?preset=7&kind=offer");
  });

  it("flips the direction of the column already sorted", () => {
    mount({ sort: "drop", dir: "desc" });
    expect(hrefs()).toContain("/admin/traffic?sort=drop&dir=asc");
  });

  it("shows Bought under a source filter now that orders carry a source", () => {
    mount({ source: "meta" });
    expect(text()).not.toContain("Orders are not attributed");
    expect(text()).toContain("Showing views and orders from");
    // 4 is now a real, source-scoped sale count; the views stay too.
    expect(text()).toContain("100");
    // `text()` is document.body.textContent, which never contains markup, so
    // a `not.toContain(">4<")` assertion on it passes no matter what the
    // component renders. Read the first row's own cells instead: the views
    // cell and the Bought cell must both show their real numbers.
    const cells = [...document.querySelectorAll("tbody tr")][0].querySelectorAll("td");
    expect(cells[1].textContent).toBe("100");
    expect(cells[4].textContent).toBe("4");
  });

  it("renders whatever drop overviewRows computed, unchanged", () => {
    // The component never computes a drop itself — it renders the `drop`
    // object overviewRows already worked out. This fixture is what
    // overviewRows still hands back for a caller with a real reason to
    // pass ordersKnown = false (the parameter overviewRows kept): a fourth
    // step that is not a measurement, so the checkout's real 60% drop is
    // reported instead of a claimed fall into the sale.
    const rows: OverviewRow[] = [
      { ...ROWS[0], steps: [500, 200, 150, 0], drop: { to: 1, percent: 60 } },
    ];
    mount({ source: "meta" }, rows);
    // 6, not 5: the Bump column sits between Bought and the drop.
    const cell = [...document.querySelectorAll("tbody tr")][0].querySelectorAll("td")[6];
    expect(cell.textContent).toBe("60% at the checkout");
  });

  it("shows dashes rather than zeroes for a page with no funnel", () => {
    mount();
    const cells = [...document.querySelectorAll("tbody tr")][1].querySelectorAll("td");
    expect(cells[1].textContent).toBe("70");
    // 5 is the bump: a page with no funnel has no sales to count it against.
    for (const i of [2, 3, 4, 5]) expect(cells[i].textContent).toBe("—");
  });

  it("counts the bump beside the sale, not as a step somebody drops out of", () => {
    // The header that started this: "Upsell" read as upsells SOLD. It is the
    // number of people who SAW the page — 12 of them, while 0 were bought.
    const rows: OverviewRow[] = [{ ...ROWS[0], steps: [500, 200, 12, 14], bumps: 5 }];
    mount({ source: "meta" }, rows);
    const cells = [...document.querySelectorAll("tbody tr")][0].querySelectorAll("td");
    expect(cells[3].textContent).toBe("12"); // saw the upsell
    expect(cells[4].textContent).toBe("14"); // bought
    expect(cells[5].textContent).toBe("5"); // of those, took the bump
    // And the header may never read as a count of upsells sold again.
    expect(document.body.textContent).toContain("Saw upsell");
    expect(document.body.textContent).toContain("Bump");
  });
});
