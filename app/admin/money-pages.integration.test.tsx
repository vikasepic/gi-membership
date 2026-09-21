// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The money screens render against the local store.
 *
 * Their arithmetic is unit-tested in lib/member-money.test.ts; this is the
 * other half — that the pages themselves load the rows, run the derivations
 * and draw, with the real database and only the admin guard replaced. A
 * page that throws on a null column is exactly what this catches.
 */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: async () => ({ id: "admin", email: "admin@example.com" }),
  adminEmails: () => ["admin@example.com"],
  isAdminEmail: (e: string) => e === "admin@example.com",
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));

describe.skipIf(!canRun)("the money screens (integration)", () => {
  it("Members renders its tiles, chips and rows", async () => {
    const { default: Page } = await import("@/app/admin/members/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Members");
    expect(html).toContain("Collected");
    expect(html).toContain("Last seen");
    expect(html).toContain("On trial");
    expect(html).toContain("Export CSV");
  });

  it("Members honours a filter in the URL", async () => {
    const { default: Page } = await import("@/app/admin/members/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ journey: "no access", sort: "total" }) }));
    expect(html).toContain('aria-current="page"');
  });

  it("Transactions renders totals and breakdowns for the range", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ range: "all" }) }));
    expect(html).toContain("Transactions");
    expect(html).toContain("Gross");
    expect(html).toContain("By product or offer");
  });

  it("Trials renders even with nothing to show", async () => {
    const { default: Page } = await import("@/app/admin/trials/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Trials");
    expect(html).toContain("On trial now");
  });

  it("a person page renders for a real member", async () => {
    const { loadMoneyData } = await import("@/lib/money-data");
    const data = await loadMoneyData();
    const someone = data.users[0];
    if (!someone) return;
    const { default: Page } = await import("@/app/admin/members/[id]/page");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: someone.id }) }));
    expect(html).toContain("Money timeline");
    expect(html).toContain("Subscriptions");
    expect(html).toContain(someone.email);
    // Whether they turned up, beside whether they paid.
    expect(html).toContain("Learning");
    expect(html).toContain("Last signed in");
    expect(html).toContain("Last opened");
  });
});
