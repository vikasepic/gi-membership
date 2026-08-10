import { execFileSync } from "node:child_process";
import { describe, it, expect, afterAll } from "vitest";
import { blockCssAt, blockRules } from "@/lib/block-style";
import { normalizeBlocks, type Block } from "@/lib/blocks";
import { bandTheme } from "@/lib/page-sections";
import { saveSection } from "@/lib/pages";
import { createServiceClient } from "@/lib/supabase/server";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * The migration that has to run with the change that made it necessary.
 *
 * Typography stopped being inherited by the narrower widths, so a block given a
 * size on desktop and left alone everywhere else no longer renders that size on
 * a phone — it falls through to the site's own type. Every page saved before
 * today was written under the old rule, and the value it renders today is the
 * one it is supposed to keep rendering.
 *
 * So this is the proof, against the real database and the real SQL: seed a
 * block with a desktop-only value, run 0042, and the block looks the same at
 * all three widths afterwards. Reimplementing the transform in TypeScript would
 * have proved that the reimplementation works.
 */
const DB = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const MIGRATION = "supabase/migrations/0042_pin_typography_per_device.sql";

const OWNER = "00000000-0000-0000-0000-0000000000e1";
const paper = bandTheme("paper");

/** A heading with a size, a weight and a colour set on the laptop and nowhere else. */
const desktopOnly = {
  id: "b_pin1",
  type: "heading",
  props: { text: "Hi", tag: "h2" },
  style: { size: 48, weight: 700, color: "#123456" },
};

const runMigration = () =>
  execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-q", "-f", MIGRATION], { encoding: "utf8" });

async function seed(): Promise<void> {
  await saveSection("product", OWNER, "hero", {
    enabled: true,
    style: "paper",
    accent: null,
    variant: null,
    content: { blocks: [desktopOnly] },
    background: null,
    cssId: "",
    cssClass: "",
  });
}

async function readBack(): Promise<Block> {
  const db = createServiceClient();
  const { data } = await db
    .from("page_sections")
    .select("content")
    .eq("owner_type", "product")
    .eq("owner_id", OWNER)
    .eq("section_key", "hero")
    .single();
  const content = data?.content as { blocks: unknown[] };
  // Through the reader the page itself uses, so what is asserted is what a
  // visitor gets rather than what the jsonb happens to look like.
  return normalizeBlocks(content.blocks)[0];
}

/** The declarations inside one width's rule, or "" when it emits none. */
function scope(css: string, at: string): string {
  const head = `@media (${at}){`;
  const i = css.indexOf(head);
  if (i < 0) return "";
  return css.slice(css.indexOf("{", i + head.length) + 1, css.indexOf("}}", i));
}

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  await db.from("page_sections").delete().eq("owner_id", OWNER);
});

describe.skipIf(!canRun)("a desktop-only value, across the migration", () => {
  it("stops reaching the narrower widths before the migration runs", async () => {
    await seed();
    const before = blockRules(await readBack(), paper);
    // The point of the change: nothing is said about size below 1024px, which
    // is what leaves room for the site's own `:root h2`.
    expect(before).toContain("@media (min-width:1024px)");
    expect(scope(before, "min-width:1024px")).toContain("font-size:48px");
    expect(before).not.toContain("max-width:");
  });

  it("renders the same at every width once the migration has run", async () => {
    await seed();
    runMigration();
    const block = await readBack();

    // The look at a width, as the editor canvas and the emitted rules both
    // resolve it. Identical across all three is the whole claim.
    const desktop = blockCssAt(block, paper, "desktop");
    expect(blockCssAt(block, paper, "tablet")).toEqual(desktop);
    expect(blockCssAt(block, paper, "mobile")).toEqual(desktop);
    expect(desktop.fontSize).toBe("48px");
    expect(desktop.fontWeight).toBe(700);
    expect(desktop.color).toBe("#123456");

    // And in the stylesheet, said once per width rather than once and inherited.
    const css = blockRules(block, paper);
    for (const at of ["min-width:1024px", "max-width:1023px", "max-width:767px"]) {
      expect(scope(css, at), at).toContain("font-size:48px");
      expect(scope(css, at), at).toContain("color:#123456");
    }
    // `revert` would roll back the whole author origin, taking the site's own
    // typography with it. There is nothing to undo here, so nothing says so.
    expect(css).not.toContain("revert");
  });

  it("does nothing the second time", async () => {
    await seed();
    runMigration();
    const once = await readBack();
    const stamp = async () => {
      const db = createServiceClient();
      const { data } = await db
        .from("page_sections")
        .select("updated_at")
        .eq("owner_id", OWNER)
        .single();
      return data?.updated_at as string;
    };
    const before = await stamp();
    runMigration();
    expect(await readBack()).toEqual(once);
    // Not merely the same content: the row is not written at all. `updated_at`
    // is the builder's stale-edit token, and moving it tells anyone with the
    // page open that their work is out of date.
    expect(await stamp()).toBe(before);
  });
});
