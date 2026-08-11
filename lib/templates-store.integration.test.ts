import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import {
  listSavedTemplates,
  listGlobalBlocks,
  saveTemplate,
  deleteTemplate,
  getSavedTemplate,
  globalUsage,
} from "@/lib/templates-store";
import { saveSection } from "@/lib/pages";
import { newBlock } from "@/lib/blocks";

// Needs a real database. Skipped rather than failed without one, so the suite
// still runs on a machine that has never started Supabase.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

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

describe.skipIf(!canRun)("saved templates", () => {
  beforeEach(wipe);

  it("comes back as what went in", async () => {
    const id = await saveTemplate({ name: "A design", blocks: [heading("Kept")] });
    const back = await getSavedTemplate(id);
    expect(back?.name).toBe("A design");
    expect(back?.blocks[0].props.text).toBe("Kept");
    // Prefixed so a saved design and a built-in can never collide on id — the
    // popup keys off it and shows one merged list. The prefix names the kind,
    // so a card knows what it is holding without a second lookup.
    expect(back?.id).toBe(`template:${id}`);
    expect(back?.kind).toBe("template");
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

// A global block is the other kind: pages point at it rather than copying it,
// so the row it lives in is load-bearing for every page that links to it.
describe.skipIf(!canRun)("global blocks", () => {
  const OWNER = "00000000-0000-0000-0000-0000000009f1";

  const pointerTo = (globalId: string) => {
    const b = newBlock("global");
    return { ...b, props: { ...b.props, globalId } };
  };

  const rowWith = (blocks: ReturnType<typeof heading>[]) => {
    const r = newBlock("row");
    r.columns![0] = blocks;
    return r;
  };

  const usePointerOnAPage = async (globalId: string, nested = false) => {
    const p = pointerTo(globalId);
    await saveSection("product", OWNER, "benefits", {
      enabled: true,
      style: "paper",
      accent: null,
      variant: null,
      content: { blocks: [nested ? rowWith([p as never]) : p] },
    });
  };

  const clearPage = async () => {
    const db = createServiceClient();
    await db.from("page_sections").delete().eq("owner_id", OWNER);
  };

  beforeEach(async () => {
    await wipe();
    await clearPage();
  });

  it("is kept on its own shelf", async () => {
    await saveTemplate({ name: "A copy", blocks: [heading("copy")] });
    await saveTemplate({ name: "A global", blocks: [heading("linked")], kind: "global" });
    expect((await listSavedTemplates()).map((t) => t.name)).toEqual(["A copy"]);
    expect((await listGlobalBlocks()).map((t) => t.name)).toEqual(["A global"]);
  });

  it("refuses to delete while a page points at it", async () => {
    const id = await saveTemplate({ name: "In use", blocks: [heading("CTA")], kind: "global" });
    await usePointerOnAPage(id);
    await expect(deleteTemplate(id)).rejects.toThrow(/still used/i);
    expect(await getSavedTemplate(id)).not.toBeNull();
  });

  it("sees a pointer nested inside a row's column", async () => {
    // The whole reason usage is walked in application code: jsonb containment
    // would miss this one and delete something a live page was using.
    const id = await saveTemplate({ name: "Nested", blocks: [heading("CTA")], kind: "global" });
    await usePointerOnAPage(id, true);
    expect(await globalUsage(id)).toHaveLength(1);
    await expect(deleteTemplate(id)).rejects.toThrow(/still used/i);
  });

  it("deletes once nothing points at it", async () => {
    const id = await saveTemplate({ name: "Free", blocks: [heading("CTA")], kind: "global" });
    await usePointerOnAPage(id);
    await clearPage();
    await deleteTemplate(id);
    expect(await getSavedTemplate(id)).toBeNull();
  });

  it("lets a plain template go even while a page shows its blocks", async () => {
    // Inserting a template made a COPY, so the row underneath is nobody's
    // dependency — refusing here would be a guard with nothing to guard.
    const id = await saveTemplate({ name: "Copied", blocks: [heading("copy")] });
    await usePointerOnAPage(id);
    await deleteTemplate(id);
    expect(await getSavedTemplate(id)).toBeNull();
  });
});
