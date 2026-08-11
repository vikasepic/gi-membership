import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { listSavedTemplates, saveTemplate, deleteTemplate, getSavedTemplate } from "@/lib/templates-store";
import { newBlock } from "@/lib/blocks";

// Designs the owner saves. A template is page content stored somewhere else,
// so it gets page content's rules: sanitized in, normalized out, never trusted
// in between.

const heading = (text: string) => {
  const b = newBlock("heading");
  return { ...b, props: { ...b.props, text } };
};

const wipe = async () => {
  const db = createServiceClient();
  await db.from("templates").delete().eq("store_id", await getStoreId());
};

describe("saved templates", () => {
  beforeEach(wipe);

  it("comes back as what went in", async () => {
    const id = await saveTemplate({ name: "A design", blocks: [heading("Kept")] });
    const back = await getSavedTemplate(id);
    expect(back?.name).toBe("A design");
    expect(back?.blocks[0].props.text).toBe("Kept");
    // Prefixed so a saved design and a built-in can never collide on id — the
    // popup keys off it and shows one merged list.
    expect(back?.id.startsWith("saved:")).toBe(true);
  });

  it("strips a script on the way in", async () => {
    // The same sanitizer a page save uses, because this lands on a live sales
    // page the moment somebody inserts it.
    const nasty = { ...newBlock("html"), props: { code: "<p>ok</p><script>steal()</script>" } };
    const id = await saveTemplate({ name: "Nasty", blocks: [nasty] });
    const back = await getSavedTemplate(id);
    expect(JSON.stringify(back?.blocks)).not.toContain("steal()");
    expect(String(back?.blocks[0].props.code)).toContain("<p>ok</p>");
  });

  it("refuses a design with nothing in it", async () => {
    await expect(saveTemplate({ name: "Empty", blocks: [] })).rejects.toThrow(/not a template/i);
  });

  it("updates in place rather than making a second one", async () => {
    const id = await saveTemplate({ name: "First", blocks: [heading("One")] });
    await saveTemplate({ id, name: "Renamed", blocks: [heading("Two")] });
    const all = await listSavedTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Renamed");
    expect(all[0].blocks[0].props.text).toBe("Two");
  });

  it("keeps the band a design was drawn on", async () => {
    const id = await saveTemplate({
      name: "On lilac",
      blocks: [heading("Band")],
      band: { style: "paper", color: "#e9dde6", layout: { width: "full" } },
    });
    const back = await getSavedTemplate(id);
    expect(back?.band?.color).toBe("#e9dde6");
    expect(back?.band?.layout?.width).toBe("full");
  });

  it("stores no band at all when the design takes whatever it lands on", async () => {
    const id = await saveTemplate({ name: "Anywhere", blocks: [heading("Free")] });
    expect((await getSavedTemplate(id))?.band).toBeUndefined();
  });

  it("deletes", async () => {
    const id = await saveTemplate({ name: "Gone", blocks: [heading("Bye")] });
    await deleteTemplate(id);
    expect(await getSavedTemplate(id)).toBeNull();
    expect(await listSavedTemplates()).toHaveLength(0);
  });
});
