import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getPageSections, hasPageSections, saveSection, seedPage } from "@/lib/pages";
import { SECTION_KEYS, listOf, textOf } from "@/lib/page-sections";
import { buildSectionView } from "@/lib/page-sections";

// Runs against the real database. The claim under test is the one the whole
// per-section design rests on: saving one section writes one row.

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = () => createServiceClient();
const OFFER = "00000000-0000-0000-0000-0000000000c1";
const owners: string[] = [];

function owner(): string {
  // A random uuid rather than a real product: these rows are keyed by owner id
  // and nothing enforces that the owner exists, so the test needs no fixture.
  const id = crypto.randomUUID();
  owners.push(id);
  return id;
}

describe.skipIf(!canRun)("page sections (integration)", () => {
  it("returns a full default page before anything is saved", async () => {
    const id = owner();
    expect(await hasPageSections("product", id)).toBe(false);
    const rows = await getPageSections("product", id);
    expect(rows.map((r) => r.sectionKey)).toEqual(SECTION_KEYS);
    // Every one renders, so a page can be switched on before it is written.
    expect(rows.every((r) => buildSectionView(r) !== null)).toBe(true);
  });

  it("saves one section without touching the others", async () => {
    // The reason each section is its own row. With a single jsonb blob, the
    // second save below would read a stale copy and silently drop the first.
    const id = owner();
    await seedPage("product", id);

    await saveSection("product", id, "solution", {
      enabled: true,
      style: "navy",
      accent: null,
      variant: null,
      content: { heading: "Solution edited first" },
    });
    await saveSection("product", id, "cta", {
      enabled: true,
      style: "plum",
      accent: null,
      variant: null,
      content: { heading: "CTA edited second" },
    });

    const rows = await getPageSections("product", id);
    const solution = rows.find((r) => r.sectionKey === "solution")!;
    const cta = rows.find((r) => r.sectionKey === "cta")!;
    expect(textOf(buildSectionView(solution)!.c, "heading")).toBe("Solution edited first");
    expect(textOf(buildSectionView(cta)!.c, "heading")).toBe("CTA edited second");
    expect(solution.style).toBe("navy");
    expect(cta.style).toBe("plum");
  });

  it("is idempotent — saving the same section twice updates rather than duplicates", async () => {
    const id = owner();
    await saveSection("product", id, "hero", {
      enabled: true, style: "navy", accent: null, variant: null, content: { headline: "One" },
    });
    await saveSection("product", id, "hero", {
      enabled: true, style: "navy", accent: null, variant: null, content: { headline: "Two" },
    });
    const { data } = await db().from("page_sections").select("id").eq("owner_id", id).eq("section_key", "hero");
    expect(data).toHaveLength(1);
    const rows = await getPageSections("product", id);
    expect(textOf(buildSectionView(rows.find((r) => r.sectionKey === "hero")!)!.c, "headline")).toBe("Two");
  });

  it("keeps a disabled section's copy", async () => {
    // Switching a section off must not be a delete — turning it back on should
    // return the words, not a blank.
    const id = owner();
    await saveSection("product", id, "proof", {
      enabled: false, style: "sand", accent: null, variant: null, content: { heading: "Kept" },
    });
    const off = (await getPageSections("product", id)).find((r) => r.sectionKey === "proof")!;
    expect(off.enabled).toBe(false);
    expect(buildSectionView(off)).toBeNull();

    await saveSection("product", id, "proof", {
      enabled: true, style: "sand", accent: null, variant: null, content: { heading: "Kept" },
    });
    const on = (await getPageSections("product", id)).find((r) => r.sectionKey === "proof")!;
    expect(textOf(buildSectionView(on)!.c, "heading")).toBe("Kept");
  });

  it("rejects an unknown section rather than storing it", async () => {
    await expect(
      saveSection("product", owner(), "not-a-section", {
        enabled: true, style: "paper", accent: null, variant: null, content: {},
      }),
    ).rejects.toThrow(/unknown section/);
  });

  it("falls back on a style or variant it does not recognise", async () => {
    const id = owner();
    await saveSection("product", id, "benefits", {
      enabled: true,
      style: "chartreuse",
      accent: null,
      variant: "spiral",
      content: {},
    });
    const row = (await getPageSections("product", id)).find((r) => r.sectionKey === "benefits")!;
    expect(row.style).toBe("rose");   // the section's own default
    expect(row.variant).toBeNull();
  });

  it("keeps an offer's page separate from a product's", async () => {
    // Both owner types share one table; a leak between them would put the
    // upsell's copy on the store page.
    const productId = owner();
    await saveSection("product", productId, "hero", {
      enabled: true, style: "navy", accent: null, variant: null, content: { headline: "Product copy" },
    });
    await saveSection("offer", OFFER, "hero", {
      enabled: true, style: "navy", accent: null, variant: null, content: { headline: "Offer copy" },
    });
    owners.push(OFFER);

    const p = await getPageSections("product", productId);
    const o = await getPageSections("offer", OFFER);
    expect(textOf(buildSectionView(p.find((r) => r.sectionKey === "hero")!)!.c, "headline")).toBe("Product copy");
    expect(textOf(buildSectionView(o.find((r) => r.sectionKey === "hero")!)!.c, "headline")).toBe("Offer copy");
  });

  it("stores list content intact", async () => {
    const id = owner();
    await saveSection("product", id, "solution", {
      enabled: true,
      style: "sand",
      accent: null,
      variant: null,
      content: { steps: [{ title: "A", body: "one" }, { title: "B", body: "two" }] },
    });
    const row = (await getPageSections("product", id)).find((r) => r.sectionKey === "solution")!;
    expect(listOf(buildSectionView(row)!.c.steps, ["title", "body"])).toEqual([
      { title: "A", body: "one" },
      { title: "B", body: "two" },
    ]);
  });
});

afterAll(async () => {
  if (!canRun) return;
  for (const id of owners) await db().from("page_sections").delete().eq("owner_id", id);
});
