import { describe, it, expect, vi } from "vitest";

/**
 * The read-side sanitizer, without a database.
 *
 * `lib/section-read-safety.integration.test.ts` proves the same thing through a
 * real round trip, and it is the better test — but it is `skipIf` on a
 * service-role key and CI's unit step has none, so that guard could be deleted
 * and every pipeline would stay green. The guarantee itself does not need a
 * database: sanitizing is pure, and the only part `getPageSections` contributes
 * is that it CALLS it on the way out. So the row arrives from a stubbed client
 * instead of from Postgres, and the assertion is unchanged.
 *
 * Mutation this catches: dropping `sanitizeSectionContent(...)` from the map in
 * `getPageSections` — i.e. handing the page whatever is stored. The stored
 * script comes back whole and both cases fail.
 */

type Row = Record<string, unknown>;
let rows: Row[] = [];

// The call in getPageSections is .from().select().eq().eq().order() — every
// step returns the builder and only the last one resolves.
vi.mock("@/lib/supabase/server", () => {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: async () => ({ data: rows, error: null }),
  };
  return { createServiceClient: () => ({ from: () => builder }) };
});

const { getPageSections } = await import("@/lib/pages");

const row = (sectionKey: string, blocks: unknown[]): Row => ({
  section_key: sectionKey,
  position: 0,
  enabled: true,
  style: "paper",
  accent: null,
  variant: null,
  content: { blocks },
  background: null,
  css_id: null,
  css_class: null,
  updated_at: "2026-01-01T00:00:00Z",
});

const hostileHeading = {
  id: "h1",
  type: "heading",
  props: { tag: "h1", text: "Keep <b>this</b><script>alert(1)</script>" },
  style: {},
};

const contentOf = async (key: string) =>
  JSON.stringify((await getPageSections("product", "p1")).find((r) => r.sectionKey === key)?.content);

describe("reading a section nobody sanitized", () => {
  it("strips what executes and keeps what formats", async () => {
    rows = [
      row("hero", [
        hostileHeading,
        {
          id: "f1",
          type: "faq",
          props: { items: [{ q: "<i>Q</i><img src=x onerror=alert(1)>", a: "A" }] },
          style: {},
        },
      ]),
    ];
    const json = await contentOf("hero");
    expect(json).toContain("<b>this</b>");
    expect(json).toContain("<i>Q</i>");
    expect(json).not.toContain("<script");
    expect(json).not.toContain("onerror");
    expect(json).not.toContain("<img");
  });

  it("cleans every stored row, not the first one it finds", async () => {
    // The sanitize sits inside the map. Hoisted out of it — or applied to
    // `data[0]` while the rest went through camelize alone — a page whose
    // second band carries the script would still ship it.
    rows = [row("hero", []), row("benefits", [hostileHeading])];
    expect(await contentOf("benefits")).not.toContain("<script");
  });
});
