// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The report pages as a read-only person sees them (users.is_viewer): the
 * same rows, and nothing to press. Each page is drawn twice against the local
 * store, once as an admin and once as a viewer, so every "absent" below is
 * proved present for the admin first.
 *
 * Hiding a button is tidiness; app/admin/viewer-refused.test.ts is the proof
 * that the actions behind them refuse.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const who = vi.hoisted(() => ({ role: "admin" as "admin" | "viewer" }));
vi.mock("@/lib/admin-guard", () => {
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "admin@example.com" };
  const role = async () => ({ user, role: who.role });
  return {
    requireViewer: role,
    getAdminRole: role,
    // What every page called before. A viewer must never be asked to pass it.
    requireAdmin: async () => {
      if (who.role === "viewer") throw new Error("redirect:/login");
      return user;
    },
    adminEmails: () => ["admin@example.com"],
    isAdminEmail: (e: string) => e === "admin@example.com",
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("notFound"); },
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/admin/orders",
  useSearchParams: () => new URLSearchParams(),
}));

const stamp = Date.now();
const userId = crypto.randomUUID();
const email = `zz-viewer-pages-${stamp}@example.test`;
let orderId = "";

const REFUND_BUTTON = /<button[^>]*>\s*Refund\s*<\/button>/;
const as = async (role: "admin" | "viewer", draw: () => Promise<React.ReactElement>) => {
  who.role = role;
  return renderToStaticMarkup(await draw());
};

describe.skipIf(!canRun)("the report pages for a read-only person (integration)", () => {
  beforeAll(async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { getStoreId } = await import("@/lib/store");
    const db = createServiceClient();
    const storeId = await getStoreId();
    const u = await db.from("users").insert({ id: userId, store_id: storeId, email });
    if (u.error) throw new Error(`fixture user: ${u.error.message}`);
    const o = await db.from("orders").insert({ store_id: storeId, user_id: userId, email, status: "paid", livemode: false, total_cents: 2900, subtotal_cents: 2900, currency: "usd" }).select("id").single();
    if (o.error || !o.data) throw new Error(`fixture order: ${o.error?.message}`);
    orderId = o.data.id as string;
    const i = await db.from("order_items").insert({ store_id: storeId, order_id: orderId, kind: "product", description: `zz viewer thing ${stamp}`, amount_cents: 2900 });
    if (i.error) throw new Error(`fixture item: ${i.error.message}`);
  });

  afterAll(async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const db = createServiceClient();
    if (orderId) {
      await db.from("order_items").delete().eq("order_id", orderId);
      await db.from("orders").delete().eq("id", orderId);
    }
    await db.from("users").delete().eq("id", userId);
  });

  beforeEach(() => {
    who.role = "admin";
  });

  it("Transactions: the rows and the download, without the refund button", async () => {
    const { default: Page } = await import("@/app/admin/orders/page");
    const draw = () => Page({ searchParams: Promise.resolve({ range: "all", live: "0", q: email }) });
    const admin = await as("admin", draw);
    const viewer = await as("viewer", draw);
    expect(admin).toMatch(REFUND_BUTTON);
    expect(viewer).not.toMatch(REFUND_BUTTON);
    for (const text of [email, "Gross", "Export CSV"]) expect(viewer).toContain(text);
  });

  it("Members: the list and the download, without Add a member", async () => {
    const { default: Page } = await import("@/app/admin/members/page");
    const draw = () => Page({ searchParams: Promise.resolve({ q: email }) });
    const admin = await as("admin", draw);
    const viewer = await as("viewer", draw);
    expect(admin).toContain("Add a member");
    expect(viewer).not.toContain("Add a member");
    for (const text of [email, "Collected", "Export CSV"]) expect(viewer).toContain(text);
  });

  it("a person's page: everything about them, and not one button or form", async () => {
    const { default: Page } = await import("@/app/admin/members/[id]/page");
    const draw = () => Page({ params: Promise.resolve({ id: userId }) });
    const admin = await as("admin", draw);
    const viewer = await as("viewer", draw);
    const levers = ["Make admin", "Give read-only access", "Open the store as them", "Hide from recent buyers"];
    for (const text of levers) expect(admin, text).toContain(text);
    expect(admin).toMatch(REFUND_BUTTON);
    expect(admin).toContain("<form");
    for (const text of levers) expect(viewer, text).not.toContain(text);
    expect(viewer).not.toContain("<form");
    expect(viewer).not.toContain("<button");
    for (const text of [email, "Money timeline", `zz viewer thing ${stamp}`]) expect(viewer).toContain(text);
  });

  it.each([
    ["Traffic", "@/app/admin/traffic/page", {}],
    ["Attribution", "@/app/admin/attribution/page", {}],
    ["Attribution, scroll", "@/app/admin/attribution/scroll/page", {}],
    ["Attribution, sources", "@/app/admin/attribution/sources/page", {}],
    ["Attribution, visits", "@/app/admin/attribution/visits/page", {}],
  ])("%s opens for a read-only person and asks who they are", async (_name, path, sp) => {
    const { default: Page } = (await import(/* @vite-ignore */ path)) as { default: (p: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactElement> };
    who.role = "viewer";
    const guard = await import("@/lib/admin-guard");
    const asked = vi.spyOn(guard, "requireViewer");
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve(sp) })).length).toBeGreaterThan(0);
    expect(asked).toHaveBeenCalled();
    asked.mockRestore();
  });

  it.each([
    ["Transactions", "@/app/admin/orders/export/route", "/admin/orders/export?range=all&live=0"],
    ["Members", "@/app/admin/members/export/route", "/admin/members/export"],
  ])("the %s download works for a read-only person", async (_name, path, url) => {
    const { GET } = (await import(/* @vite-ignore */ path)) as { GET: (req: Request) => Promise<Response> };
    who.role = "viewer";
    const res = await GET(new Request(`https://grow.greaterinside.com${url}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain(email);
  });
});
