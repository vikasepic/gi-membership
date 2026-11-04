import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * What the Access tab does when a database read goes wrong (final review,
 * 4 Nov 2026). A failed read must throw, never pass for "nobody": a Remove
 * that reads no purchases deletes nothing and reports success, and a list that
 * reads no people says "0 people can open this course".
 *
 * The happy paths run against real rows in course-access.integration.test.ts;
 * a database failure cannot be produced there, so this fakes one table at a time.
 */

type Result = { data: unknown; error: { message: string } | null };
const tables = vi.hoisted(() => ({ results: {} as Record<string, Result>, deletes: [] as string[] }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "or", "in", "order", "range", "upsert"]) q[m] = () => q;
      q.delete = () => {
        tables.deletes.push(table);
        return q;
      };
      q.maybeSingle = async () => ({ data: null, error: null });
      q.then = (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve(tables.results[table] ?? { data: [], error: null }).then(ok, bad);
      return q;
    },
  }),
}));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "store-1" }));
vi.mock("@/lib/members", () => ({ createMember: async () => ({ ok: true, userId: "u1", existed: true }) }));

const { listCourseAccess, removeCourseAccess } = await import("@/lib/course-access");

beforeEach(() => {
  tables.deletes = [];
  tables.results = { product_courses: { data: [{ product_id: "p1" }], error: null } };
});

describe("a failed read on the Access tab", () => {
  it("Remove throws instead of deleting nothing when the purchase read fails", async () => {
    tables.results.ownership = { data: null, error: { message: "boom" } };
    await expect(removeCourseAccess({ courseId: "c1", userId: "u1", by: "a" })).rejects.toThrow(/boom/);
    expect(tables.deletes).toEqual([]);
  });

  it("the list throws instead of reading as nobody when the purchase read fails", async () => {
    tables.results.ownership = { data: null, error: { message: "boom" } };
    await expect(listCourseAccess("c1")).rejects.toThrow(/boom/);
  });

  it("names people from the rows themselves, with no lookup by a growing list of ids", async () => {
    tables.results.ownership = {
      data: [
        { user_id: "u1", product_id: "p1", offer_id: null, source: "purchase", created_at: "2026-11-01T00:00:00Z", users: { email: "a@x.test", username: "Ann" } },
      ],
      error: null,
    };
    tables.results.products = { data: [{ id: "p1", title: "Deep Work" }], error: null };
    // A separate users read is the one that grows with the store: past 1000
    // holders PostgREST truncates it and its URL draws a 414.
    tables.results.users = { data: null, error: { message: "users read should not happen" } };
    const { people } = await listCourseAccess("c1");
    expect(people).toEqual([{ userId: "u1", email: "a@x.test", name: "Ann", how: ["Bought Deep Work"], since: "2026-11-01T00:00:00Z" }]);
  });
});
