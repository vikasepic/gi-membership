import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HOME_COPY, homeStarterBlocks } from "@/lib/home-starter";
import { HOME_SECTION_KEYS } from "@/lib/page-sections";
import { blockRendersNothing, normalizeBlocks, walkBlocks } from "@/lib/blocks";

const starter = homeStarterBlocks();
const all = Object.values(starter).flat();

/**
 * "Start from the page the store is showing."
 *
 * The claim in that sentence is the thing worth testing: what comes out has to
 * be the page somebody was just looking at, and it has to be a page the editor
 * and the renderer both accept.
 */
describe("the home page starter", () => {
  it("fills only bands the storefront has", () => {
    for (const key of Object.keys(starter)) {
      expect(HOME_SECTION_KEYS as string[], key).toContain(key);
    }
  });

  it("puts the live catalogue and memberships in, rather than a picture of them", () => {
    const types = all.map((b) => b.type);
    expect(types).toContain("catalog");
    expect(types).toContain("memberships");
  });

  it("says what the storefront says", () => {
    // The one thing that would make the button a lie. Both read HOME_COPY, and
    // this is the line that fails if the page stops doing so.
    const page = readFileSync("app/(store)/page.tsx", "utf8");
    expect(page).toContain("HOME_COPY.headline");
    expect(page).toContain("HOME_COPY.subhead");
    expect(JSON.stringify(all)).toContain(HOME_COPY.headline);
  });

  it("survives the round trip through storage", () => {
    // Saved as JSON and read back by the page. A shape normalize rewrites is a
    // starter that changes the moment it is reloaded.
    const copy = JSON.parse(JSON.stringify(all));
    expect(normalizeBlocks(copy)).toEqual(all);
  });

  it("emits nothing the save would throw away", () => {
    // `blockRendersNothing` drops empty blocks. A starter block it discards is
    // a band that seeds itself empty and reports success.
    for (const b of walkBlocks(all)) {
      expect(blockRendersNothing(b), `${b.type} renders nothing`).toBe(false);
    }
  });

  it("gives every block its own id", () => {
    const ids = walkBlocks(all).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is a fresh set of ids each time", () => {
    // Pressed twice — or on two stores — the same ids would make one page's
    // edits land on the other's blocks.
    const again = Object.values(homeStarterBlocks()).flat();
    expect(again.map((b) => b.id)).not.toEqual(all.map((b) => b.id));
  });

  it("puts no placeholder prose in the closing band", () => {
    // There is nothing after the shelves on the built-in page, and seeding one
    // would hand somebody copy to delete before they could start.
    expect(starter.closing).toEqual([]);
  });

  it("never sells anything by itself", () => {
    // A Buy button here would have no price behind it: the storefront is not a
    // product page and there is no offer for it to charge for.
    for (const b of walkBlocks(all)) {
      if (b.type === "button") expect(b.props.action, "a storefront button links").toBe("link");
    }
  });
});

describe("seeding refuses to overwrite", () => {
  const src = readFileSync("lib/pages.ts", "utf8");
  const fn = src.slice(
    src.indexOf("export async function seedHomeFromDefault"),
    src.indexOf("export async function seedPage"),
  );

  it("skips a band that already holds a block", () => {
    // The whole safety of the button. Without this it is a Reset that calls
    // itself a Start.
    expect(fn).toContain("skipped.push");
    expect(fn).toContain("Array.isArray(existing) && existing.length > 0");
  });

  it("reports what it skipped rather than claiming to have done it", () => {
    expect(fn).toContain("return { written, skipped }");
  });
});
