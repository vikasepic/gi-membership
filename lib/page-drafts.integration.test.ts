import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getPageSections,
  hasPageSections,
  getPageSettings,
  saveSection,
  savePageSettings,
  publishPage,
  discardDraft,
  copyPage,
} from "@/lib/pages";
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

  const input = (text: string) => ({
    enabled: true,
    style: "cream",
    accent: null,
    variant: null,
    content: { blocks: [{ type: "heading", props: { text } }] },
    background: null,
    cssId: null,
    cssClass: null,
  });
  const heroText = async (id: string, draft = false) =>
    JSON.stringify((await getPageSections("product", id, { draft })).find((r) => r.sectionKey === "hero")!.content);

  it("save leaves the live read alone and the draft read shows the edit", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("FIRST"));
    expect(await hasPageSections("product", id)).toBe(false);
    expect(await heroText(id)).not.toContain("FIRST");
    expect(await heroText(id, true)).toContain("FIRST");
  });

  it("publishes one section and leaves the other's draft waiting", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("H"));
    await saveSection("product", id, "problem", input("P"));
    const res = await publishPage("product", id, "hero");
    expect(res.published).toBe(1);
    expect(Object.keys(res.updatedAt)).toEqual(["hero"]);
    const rows = await getPageSections("product", id);
    expect(JSON.stringify(rows.find((r) => r.sectionKey === "hero")!.content)).toContain("H");
    expect(rows.find((r) => r.sectionKey === "hero")!.hasDraft).toBe(false);
    expect(JSON.stringify(rows.find((r) => r.sectionKey === "problem")!.content)).not.toContain("P");
    expect(
      (await getPageSections("product", id, { draft: true })).find((r) => r.sectionKey === "problem")!.hasDraft,
    ).toBe(true);
  });

  it("publishes the whole page with its settings", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("H"));
    await saveSection("product", id, "problem", input("P"));
    await savePageSettings("product", id, {
      customCss: "x{}",
      customJs: "",
      snippets: [],
      metaTitle: "T",
      metaDescription: "",
      shareImagePath: "",
    });
    expect((await getPageSettings("product", id)).metaTitle).toBe("");
    const res = await publishPage("product", id);
    expect(res.published).toBe(3);
    expect(await heroText(id)).toContain("H");
    const s = await getPageSettings("product", id);
    expect(s.metaTitle).toBe("T");
    expect(s.customCss).toBe("x{}");
    expect(s.hasDraft).toBe(false);
  });

  it("a second save after publish still refuses a stale baseline", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("A"));
    const { updatedAt } = await publishPage("product", id, "hero");
    await saveSection("product", id, "hero", input("B"), updatedAt.hero);
    await expect(saveSection("product", id, "hero", input("C"), updatedAt.hero)).rejects.toThrow(
      /changed by someone else/,
    );
  });

  it("discard restores live, and deletes a section that was never published", async () => {
    const id = owner();
    await saveSection("product", id, "hero", input("LIVE"));
    await publishPage("product", id, "hero");
    await saveSection("product", id, "hero", input("SCRAP"));
    const back = await discardDraft("product", id, "hero");
    expect(JSON.stringify(back.content)).toContain("LIVE");
    expect(back.hasDraft).toBe(false);

    await saveSection("product", id, "problem", input("NEVER"));
    const gone = await discardDraft("product", id, "problem");
    expect(JSON.stringify(gone.content)).not.toContain("NEVER");
    const { count } = await db()
      .from("page_sections")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", id)
      .eq("section_key", "problem");
    expect(count).toBe(0);
  });

  it("copying a page changes no live read on the target", async () => {
    const from = owner();
    const to = owner();
    await saveSection("product", from, "hero", input("SRC-DRAFT"));
    await saveSection("product", to, "hero", input("DEST"));
    await publishPage("product", to, "hero");
    await copyPage({ ownerType: "product", ownerId: from }, { ownerType: "product", ownerId: to });
    expect(await heroText(to)).toContain("DEST");
    expect(await heroText(to, true)).toContain("SRC-DRAFT");
    // Every band on the target now holds a draft, so Publish page publishes a
    // complete copy rather than a mix of two designs.
    const drafts = await getPageSections("product", to, { draft: true });
    expect(drafts.every((r) => r.hasDraft)).toBe(true);
  });
});

afterAll(async () => {
  if (!canRun) return;
  await db().from("page_sections").delete().in("owner_id", owners);
  await db().from("page_settings").delete().in("owner_id", owners);
});
