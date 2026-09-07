import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The writer's decisions, without a database.
 *
 * `lib/duplicate.integration.test.ts` proves the same things through real
 * round trips and is the better test — but it is `skipIf` on a service-role
 * key, and two of the guarantees here cannot be reached from it at all: a
 * best-effort step FAILING, and a settings read failing. Neither can be
 * provoked with valid rows, and both are the states this feature exists to
 * report honestly.
 *
 * So the client is a stub that answers per table, records what was written,
 * and can be told to fail. `@/lib/pages` is stubbed for the same reason: the
 * page copy has to be able to throw.
 */

type Res = { data: unknown; error: { message: string } | null };
const ok = (data: unknown = null): Res => ({ data, error: null });
const fails = (message: string): Res => ({ data: null, error: { message } });

/** Answers, consumed in call order per `${table}:${insert|update|select}`. */
let answers: Record<string, Res[]>;
let inserted: { table: string; rows: unknown }[];
let updated: { table: string; patch: unknown }[];

vi.mock("@/lib/store", () => ({ getStoreId: async () => "store-1" }));

vi.mock("@/lib/supabase/server", () => {
  const from = (table: string) => {
    // The builder is one object that returns itself, and is itself a thenable
    // — the writer awaits some chains at `.insert(...)` and finishes others
    // with `.single()` or `.maybeSingle()`.
    let op = "select";
    const answer = async (): Promise<Res> => answers[`${table}:${op}`]?.shift() ?? ok(null);
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => b,
      insert: (rows: unknown) => {
        op = "insert";
        inserted.push({ table, rows });
        return b;
      },
      update: (patch: unknown) => {
        op = "update";
        updated.push({ table, patch });
        return b;
      },
      single: () => answer(),
      maybeSingle: () => answer(),
      then: (res: (v: Res) => unknown, rej: (e: unknown) => unknown) => answer().then(res, rej),
    };
    return b;
  };
  return { createServiceClient: () => ({ from }) };
});

const pages = {
  hasPageSections: vi.fn(async () => false),
  copyPage: vi.fn(async () => 0),
  getPageSettings: vi.fn(async () => ({
    customCss: "",
    customJs: "",
    snippets: [] as unknown[],
    metaTitle: "",
    metaDescription: "",
    shareImagePath: "",
  })),
  savePageSettings: vi.fn(async () => {}),
};
vi.mock("@/lib/pages", () => pages);

const { duplicateProduct, duplicateOffer } = await import("@/lib/duplicate-write");

const PRODUCT = {
  id: "prod-old",
  slug: "guide",
  title: "Guide",
  status: "published",
  bump_offer_id: "off-bump",
  // The bump OFFER's price ids — see lib/duplicate-write.ts. Not this
  // product's own prices, and not remappable through them.
  bump_price_ids: ["bump-monthly", "bump-yearly"],
  upsell_price_ids: ["bump-yearly"],
};

const OFFER = {
  id: "off-old",
  key: "content-engine",
  name: "Content Engine",
  active: true,
  oto_template: "visual",
  // This one really does name the offer's own prices.
  page_price_ids: ["price-old"],
};

const row = (t: "products" | "offers") => (t === "products" ? { ...PRODUCT } : { ...OFFER });

/** Source found, key free, insert answers with the new id. */
function base(table: "products" | "offers") {
  answers = {
    [`${table}:select`]: [ok(row(table)), ok(null)],
    [`${table}:insert`]: [ok({ id: "new-1" })],
  };
}

beforeEach(() => {
  inserted = [];
  updated = [];
  vi.clearAllMocks();
  pages.hasPageSections.mockResolvedValue(false);
  pages.copyPage.mockResolvedValue(0);
});

describe("what the copy is inserted with", () => {
  it("seeds a remapped array empty rather than carrying the original's ids", async () => {
    // The remap is a separate, failure-tolerant UPDATE. An insert holding the
    // original's price ids plus an update that fails is a copy whose page
    // sells the ORIGINAL's prices — silently, because these are jsonb with no
    // foreign key. "No options yet" is visible; that is not.
    base("offers");
    await duplicateOffer("off-old", "content-engine-two");
    const write = inserted.find((i) => i.table === "offers")!.rows as Record<string, unknown>;
    expect(write.page_price_ids).toEqual([]);
    expect(write.key).toBe("content-engine-two");
    expect(write.active).toBe(false);
  });

  it("carries a product's placement price ids, and never rewrites them", async () => {
    // They name the BUMP OFFER's prices, which the copy points at unchanged.
    // Remapping them through the product's own old-to-new table matches
    // nothing and writes [], and an empty list makes the checkout fall back to
    // the offer's first live price — a different add-on at a different price.
    base("products");
    answers["product_prices:select"] = [ok([{ id: "pp-old", product_id: "prod-old", price_cents: 4700 }])];
    await duplicateProduct("prod-old", "guide-two");
    const write = inserted.find((i) => i.table === "products")!.rows as Record<string, unknown>;
    expect(write.bump_price_ids).toEqual(["bump-monthly", "bump-yearly"]);
    expect(write.upsell_price_ids).toEqual(["bump-yearly"]);
    expect(write.bump_offer_id).toBe("off-bump");
    // And no second write puts them back. An UPDATE here is the bug.
    expect(updated.filter((u) => u.table === "products")).toEqual([]);
  });
});

describe("what else the copy is made of", () => {
  it("attaches the same courses", async () => {
    // In a join table, not on the row, so nothing that copies columns finds
    // it — and a copy that grants nothing takes the money anyway.
    base("products");
    answers["product_courses:select"] = [ok([{ course_id: "course-1", sort_order: 3 }])];
    const { warnings } = await duplicateProduct("prod-old", "guide-two");
    expect(warnings).toEqual([]);
    expect(inserted.find((i) => i.table === "product_courses")?.rows).toEqual([
      { course_id: "course-1", sort_order: 3, product_id: "new-1" },
    ]);
  });

  it("warns that a coded upsell page does not follow the new key", async () => {
    base("offers");
    answers["offers:select"] = [ok({ ...OFFER, oto_template: "custom" }), ok(null)];
    const { warnings } = await duplicateOffer("off-old", "content-engine-two");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Custom/);
  });
});

describe("what the copy could not carry", () => {
  it("reports a step that failed, and still returns the record", async () => {
    // Best-effort means the copy survives the failure. It does not mean the
    // failure goes unmentioned: this is the only route by which an admin
    // learns that the page they were duplicating is not on the copy.
    base("products");
    pages.hasPageSections.mockResolvedValue(true);
    pages.copyPage.mockRejectedValue(new Error("insert timed out"));

    const { id, warnings } = await duplicateProduct("prod-old", "guide-two");
    expect(id).toBe("new-1");
    expect(warnings).toEqual(["The sales page was not copied: insert timed out"]);
  });

  it("does not report a clean copy when the settings could not be read", async () => {
    // getPageSettings answers a read failure with the same empty settings it
    // gives a record that has none, so "nothing to copy" and "we could not
    // find out" are the same answer. Asking whether the row exists is what
    // keeps a transient failure from being reported as success on a copy that
    // has lost its SEO and its custom code.
    base("products");
    answers["page_settings:select"] = [fails("connection reset by peer")];

    const { warnings } = await duplicateProduct("prod-old", "guide-two");
    expect(warnings).toEqual(["The page settings were not copied: connection reset by peer"]);
    expect(pages.savePageSettings).not.toHaveBeenCalled();
  });

  it("says nothing when the record simply has no settings", async () => {
    base("products");
    const { warnings } = await duplicateProduct("prod-old", "guide-two");
    expect(warnings).toEqual([]);
    expect(pages.savePageSettings).not.toHaveBeenCalled();
  });
});
