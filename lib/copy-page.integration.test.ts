import { describe, it, expect, afterAll } from "vitest";
import { saveSection, getPageSections, copyPage, listPageSources } from "@/lib/pages";
import { createServiceClient } from "@/lib/supabase/server";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Using one page as a template for another.
 *
 * The dangerous part is not the copying — it is what must NOT be copied. A
 * page carries prices and buy buttons that belong to whatever owns it, and a
 * copy that dragged those across would put one product's price on another
 * product's page, on a store taking real money.
 */
const A = "00000000-0000-0000-0000-00000000c001";
const B = "00000000-0000-0000-0000-00000000c002";

const input = (headline: string, style = "paper") => ({
  enabled: true,
  style,
  accent: "#123456",
  variant: null,
  content: { headline },
  background: null,
  cssId: "",
  cssClass: "",
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  await db.from("page_sections").delete().in("owner_id", [A, B]);
});

describe.skipIf(!canRun)("copying a page", () => {
  it("brings the structure and the presentation across", async () => {
    await saveSection("product", A, "problem", input("From A", "navy"));
    await saveSection("product", A, "hero", input("Hero A"));

    const n = await copyPage({ ownerType: "product", ownerId: A }, { ownerType: "product", ownerId: B });
    expect(n).toBe(2);

    const rows = await getPageSections("product", B);
    const problem = rows.find((r) => r.sectionKey === "problem")!;
    expect((problem.content as { headline: string }).headline).toBe("From A");
    // The band and the accent travel too: a section pasted without its
    // presentation looks like a different section.
    expect(problem.style).toBe("navy");
    expect(problem.accent).toBe("#123456");
  });

  it("replaces rather than merges", async () => {
    // Half one design and half another is not a thing anyone asked for, and
    // afterwards there is no telling which band came from where.
    await saveSection("product", B, "guarantee", input("Only on B"));
    await copyPage({ ownerType: "product", ownerId: A }, { ownerType: "product", ownerId: B });

    const stored = await getPageSections("product", B);
    // getPageSections merges onto the canonical list, so a section with no row
    // comes back at its default rather than missing — check the content.
    const guarantee = stored.find((r) => r.sectionKey === "guarantee");
    expect((guarantee?.content as { headline?: string })?.headline).not.toBe("Only on B");
  });

  it("refuses to copy a page onto itself", async () => {
    await expect(
      copyPage({ ownerType: "product", ownerId: A }, { ownerType: "product", ownerId: A }),
    ).rejects.toThrow(/same page/i);
  });

  it("refuses a source with nothing on it", async () => {
    await expect(
      copyPage(
        { ownerType: "product", ownerId: "00000000-0000-0000-0000-00000000c999" },
        { ownerType: "product", ownerId: B },
      ),
    ).rejects.toThrow(/nothing on it/i);
  });

  it("never offers a page whose product no longer exists", async () => {
    // These two owner ids have sections but no product row. Listing them would
    // put "undefined (2 sections)" in the picker and copy from a page nobody
    // can open.
    const sources = await listPageSources();
    expect(sources.some((s) => s.ownerId === A || s.ownerId === B)).toBe(false);
    // And everything it does offer is worth offering.
    for (const s of sources) {
      expect(s.sections).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
    }
  });
});
