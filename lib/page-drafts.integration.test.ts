import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getPageSections, hasPageSections, getPageSettings } from "@/lib/pages";
import { getStoreId } from "@/lib/store";

// Runs against the real database. What is under test is the line between
// the row a visitor reads and the row the editor reads: one column apart,
// and the whole feature is that the first never sees the second.

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = () => createServiceClient();
const owners: string[] = [];
const owner = () => {
  const id = crypto.randomUUID();
  owners.push(id);
  return id;
};

/** A section row written straight to the table, so the read is tested alone. */
async function rawSection(ownerId: string, key: string, over: Record<string, unknown>) {
  const { error } = await db().from("page_sections").insert({
    store_id: await getStoreId(),
    owner_type: "product",
    owner_id: ownerId,
    section_key: key,
    position: 0,
    enabled: true,
    style: "cream",
    content: { blocks: [] },
    ...over,
  });
  if (error) throw new Error(error.message);
}

describe.skipIf(!canRun)("draft-aware reads (integration)", () => {
  it("a live read ignores the draft and a draft read prefers it", async () => {
    const id = owner();
    await rawSection(id, "hero", {
      content: { blocks: [{ type: "heading", props: { text: "LIVE" } }] },
      draft: { enabled: true, style: "navy", content: { blocks: [{ type: "heading", props: { text: "DRAFT" } }] } },
    });
    const live = (await getPageSections("product", id)).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(live.content)).toContain("LIVE");
    expect(live.style).toBe("cream");
    expect(live.hasDraft).toBe(true);

    const draft = (await getPageSections("product", id, { draft: true })).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(draft.content)).toContain("DRAFT");
    expect(draft.style).toBe("navy");
    expect(draft.hasDraft).toBe(true);
  });

  it("a never-published row is absent from a live read and from hasPageSections", async () => {
    const id = owner();
    await rawSection(id, "hero", {
      published_at: null,
      content: { blocks: [{ type: "heading", props: { text: "GHOST" } }] },
    });
    const live = (await getPageSections("product", id)).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(live.content)).not.toContain("GHOST");
    expect(await hasPageSections("product", id)).toBe(false);
    expect(await hasPageSections("product", id, { includeDrafts: true })).toBe(true);
    const draft = (await getPageSections("product", id, { draft: true })).find((r) => r.sectionKey === "hero")!;
    expect(JSON.stringify(draft.content)).toContain("GHOST");
  });

  it("settings read the draft only when asked", async () => {
    const id = owner();
    const { error } = await db().from("page_settings").insert({
      store_id: await getStoreId(),
      owner_type: "product",
      owner_id: id,
      custom_css: "live{}",
      draft: { custom_css: "draft{}" },
    });
    if (error) throw new Error(error.message);
    expect((await getPageSettings("product", id)).customCss).toBe("live{}");
    const d = await getPageSettings("product", id, { draft: true });
    expect(d.customCss).toBe("draft{}");
    expect(d.hasDraft).toBe(true);
  });
});

afterAll(async () => {
  if (!canRun) return;
  await db().from("page_sections").delete().in("owner_id", owners);
  await db().from("page_settings").delete().in("owner_id", owners);
});
