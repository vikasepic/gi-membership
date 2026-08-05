// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NavCounts } from "@/lib/admin-nav";

let path = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
const { AdminSidebar } = await import("@/components/admin/sidebar");

/** The store as it actually stands. */
const REAL: NavCounts = {
  products: 2, courses: 2, offers: 1, orders: 8, members: 6,
  apps: { active: 1, total: 2 }, errors: 0,
};

const render = (at: string, counts: NavCounts = REAL, live = true) => {
  path = at;
  return renderToStaticMarkup(<AdminSidebar counts={counts} live={live} />);
};

describe("the admin sidebar", () => {
  it("groups the nine items into three", () => {
    const out = render("/admin");
    for (const g of ["Catalogue", "Customers", "System"]) expect(out).toContain(g);
  });

  it("still reaches every section", () => {
    const out = render("/admin");
    for (const href of ["/admin", "/admin/courses", "/admin/offers", "/admin/orders",
      "/admin/members", "/admin/apps", "/admin/errors", "/admin/settings"]) {
      expect(out, href).toContain(`href="${href}"`);
    }
  });

  it("carries the counts, which is what it is worth its width for", () => {
    const out = render("/admin");
    expect(out).toContain(">8<");  // orders
    expect(out).toContain(">6<");  // members
  });

  it("says one of two apps is not connected, from the navigation", () => {
    expect(render("/admin")).toContain("1/2");
  });

  it("marks that app count as needing attention", () => {
    const out = render("/admin");
    const badge = out.split("1/2")[0];
    expect(badge).toContain("f0c98a"); // the warning ground
  });

  it("does not mark a fully connected set", () => {
    const out = render("/admin", { ...REAL, apps: { active: 2, total: 2 } });
    expect(out).toContain("2/2");
    expect(out.split("2/2")[0]).not.toContain("f0c98a");
  });

  it("hides a count of zero rather than showing a zero", () => {
    // "Errors 0" is noise; Errors with no badge says the same thing quietly.
    expect(render("/admin")).not.toMatch(/Errors<\/?[^>]*>?\s*<span[^>]*>0</);
  });

  it("shows an error count when there is one, and flags it", () => {
    const out = render("/admin", { ...REAL, errors: 3 });
    expect(out).toContain(">3<");
    expect(out.split(">3<")[0]).toContain("f0c98a");
  });

  it("keeps Products lit only on Products", () => {
    // "/admin" is a prefix of every other admin route — the bug this guards is
    // Products staying current on all nine pages.
    const current = (out: string) =>
      out.split("</a>").filter((c) => c.includes('aria-current="page"'));
    expect(current(render("/admin"))[0]).toContain("Products");
    const onOrders = current(render("/admin/orders"));
    expect(onOrders[0]).toContain("Orders");
    expect(onOrders.join()).not.toContain("Products");
  });

  it("keeps a section lit on a page nested inside it", () => {
    const out = render("/admin/courses/abc/details");
    const current = out.split("</a>").find((c) => c.includes('aria-current="page"'));
    expect(current).toContain("Courses");
  });

  it("marks exactly one item current, on every route", () => {
    for (const at of ["/admin", "/admin/courses", "/admin/offers", "/admin/orders",
      "/admin/members", "/admin/apps", "/admin/errors", "/admin/settings"]) {
      // Rendered twice — desktop and the phone drawer — so two per route.
      expect(render(at).match(/aria-current="page"/g)?.length, at).toBe(2);
    }
  });

  it("keeps the payment mode visible without shouting it", () => {
    const live = render("/admin", REAL, true);
    expect(live).toContain("Live payments");
    expect(live).not.toContain("bg-primary px-2.5");
    expect(render("/admin", REAL, false)).toContain("Stripe test mode");
  });

  it("gives the phone a way in", () => {
    const out = render("/admin");
    expect(out).toContain('aria-controls="admin-nav"');
    expect(out).toContain('aria-expanded="false"');
  });
});
