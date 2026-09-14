import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Source-shape tests, the way lib/page-metadata.test.ts reads its action: the
// file is "use server" and imports server-only modules, so it cannot be
// imported into vitest. What is asserted is which cache paths each action
// clears, because a draft save clearing the storefront would be a lie and a
// publish that clears nothing would leave the old page up.
const src = readFileSync("app/admin/pages/actions.ts", "utf8");
const body = (name: string) => {
  const start = src.indexOf(`export async function ${name}`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
};

describe("draft and publish actions", () => {
  it("a draft save clears only the editor", () => {
    const s = body("saveSectionAction");
    expect(s).toContain("revalidatePath(adminPathFor(owner, ownerId))");
    expect(s).not.toContain('revalidatePath("/p"');
    expect(s).not.toContain('revalidatePath("/checkout/oto")');
    expect(s).not.toContain('revalidatePath("/", "layout")');
  });

  it("publish clears the whole store", () => {
    const s = body("publishPageAction");
    expect(s).toContain("await requireAdmin()");
    expect(s).toContain("publishPage(owner, ownerId, sectionKey || undefined)");
    expect(s).toContain('revalidatePath("/", "layout")');
  });

  it("discard returns the live row so the editor can show it", () => {
    const s = body("discardDraftAction");
    expect(s).toContain("await requireAdmin()");
    expect(s).toContain("discardDraft(owner, ownerId, sectionKey)");
    expect(s).toContain("return { row }");
  });

  it("settings merge over the draft, not over live", () => {
    expect(body("savePageSettingsAction")).toContain("getPageSettings(owner, ownerId, { draft: true })");
  });
});
