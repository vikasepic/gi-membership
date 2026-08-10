import { describe, it, expect, afterAll } from "vitest";
import { getPageSections } from "@/lib/pages";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * A row that reached the table without going through a save.
 *
 * Headings, card titles and FAQ answers render their markup now, which is what
 * makes a word emphasised — and what makes a stored script tag a script tag on
 * a live sales page. Saving sanitizes, but saving is not the only way a row
 * gets written: an older page from before these fields rendered HTML, an
 * import, a direct write, a copy of another page.
 *
 * This writes the dangerous row exactly the way none of those go through the
 * editor, then reads it back the way the page does. It failed before the read
 * side was guarded — the script came out whole.
 */
const OWNER = "product" as const;
const OWNER_ID = "00000000-0000-0000-0000-00000000d001";

afterAll(async () => {
  if (!canRun) return;
  await createServiceClient().from("page_sections").delete().eq("owner_id", OWNER_ID);
});

describe.skipIf(!canRun)("reading a section nobody sanitized", () => {
  it("strips what executes and keeps what formats", async () => {
    const db = createServiceClient();
    await db.from("page_sections").insert({
      store_id: await getStoreId(),
      owner_type: OWNER,
      owner_id: OWNER_ID,
      section_key: "hero",
      position: 0,
      enabled: true,
      style: "paper",
      content: {
        blocks: [
          {
            id: "h1",
            type: "heading",
            props: { tag: "h1", text: 'Keep <b>this</b><script>alert(1)</script>' },
            style: {},
          },
          {
            id: "f1",
            type: "faq",
            props: { items: [{ q: '<i>Q</i><img src=x onerror=alert(1)>', a: "A" }] },
            style: {},
          },
        ],
      },
    });

    const rows = await getPageSections(OWNER, OWNER_ID);
    const blocks = (rows.find((r) => r.sectionKey === "hero")?.content as { blocks: never[] }).blocks;
    const json = JSON.stringify(blocks);

    expect(json).toContain("<b>this</b>");
    expect(json).toContain("<i>Q</i>");
    expect(json).not.toContain("<script");
    expect(json).not.toContain("onerror");
    expect(json).not.toContain("<img");
  });
});
