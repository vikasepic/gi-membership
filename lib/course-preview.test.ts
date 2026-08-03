import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// The preview reaches paid content, so what it must NOT do matters more than
// what it does. These read the real files, because every failure here is silent
// — a leak looks exactly like a working preview until someone finds it.

describe("the course preview does not weaken the learner gates", () => {
  it("keeps ownership on the learner pages", () => {
    for (const p of [
      "app/(store)/library/[slug]/page.tsx",
      "app/(store)/library/[slug]/[itemId]/page.tsx",
    ]) {
      const s = read(p);
      expect(s, `${p} lost its ownership check`).toContain("userOwnsCourse");
      expect(s, `${p} lost its redirect`).toContain("redirect");
      // An admin must NOT skip ownership on the learner route. Preview lives at
      // its own path; letting admins through here would change what a real page
      // shows and make the gate untestable from the outside.
      expect(s, `${p} now lets admins bypass ownership`).not.toContain("userIsAdmin");
    }
  });

  it("keeps the draft lesson and draft chapter checks on the learner page", () => {
    const s = read("app/(store)/library/[slug]/[itemId]/page.tsx");
    expect(s).toContain("!item.isPublished");
    expect(s).toContain("parent?.isPublished");
  });

  it("gates the preview route on admin, not on nothing", () => {
    // It sits outside /admin so it can render bare in an iframe, which means
    // the middleware's admin gate does not cover it.
    const s = read("app/course-preview/[id]/page.tsx");
    expect(s).toContain("requireAdmin");
  });

  it("never writes progress from a preview", () => {
    const s = read("app/course-preview/[id]/page.tsx");
    expect(s).toContain("interactive={false}");
    // Progress is built from the query string, not read from the viewer.
    expect(s).not.toContain("completedItemIds");
  });

  it("serves preview media through the same checked route", () => {
    // Not a second, unchecked path. The one branch is inside the existing route.
    const s = read("app/course-preview/[id]/page.tsx");
    expect(s).toContain("/api/media/item/");
    expect(s).not.toMatch(/signedItemAsset|storage\/v1\/object/);
  });

  it("lets an admin past ownership only inside the existing media routes", () => {
    for (const p of [
      "app/api/media/item/[itemId]/[index]/route.ts",
      "app/api/media/course/[courseId]/[index]/route.ts",
    ]) {
      const s = read(p);
      expect(s, `${p} lost its ownership check`).toContain("userOwnsCourse");
      expect(s, `${p} should let an admin preview`).toContain("userIsAdmin");
      // Anonymous callers are still refused before anything else happens.
      expect(s).toContain("Unauthorized");
    }
  });

  it("still hides drafts from a non-admin in the media route", () => {
    const s = read("app/api/media/item/[itemId]/[index]/route.ts");
    // The published checks must be conditional on NOT being an admin, not
    // deleted — a learner must still get a 404 for a draft lesson's file.
    expect(s).toContain("!admin && !item.isPublished");
    expect(s).toContain("!admin && item.parentId");
  });

  it("allows the preview to be framed, and nothing else to frame it", () => {
    // Next applies every matching headers() rule in order and the last wins, so
    // a specific rule placed before the catch-all is silently overwritten.
    const cfg = read("next.config.ts");
    const deny = cfg.indexOf('source: "/:path*"');
    const preview = cfg.indexOf('source: "/course-preview/:path*"');
    expect(preview, "course-preview rule missing").toBeGreaterThan(-1);
    expect(preview, "catch-all DENY would override it").toBeGreaterThan(deny);
    expect(cfg.slice(preview)).toContain("frame-ancestors 'self'");
  });
});

describe("the preview renders the same components as the live pages", () => {
  it("uses the extracted views on both sides", () => {
    // A preview built from its own copy of the markup drifts the first time one
    // side changes, and nobody notices until a buyer sees the difference.
    const previewSrc = read("app/course-preview/[id]/page.tsx");
    for (const [live, comp] of [
      ["app/(store)/library/[slug]/page.tsx", "CourseOverview"],
      ["app/(store)/library/[slug]/[itemId]/page.tsx", "LessonView"],
    ]) {
      expect(read(live), `${live} does not use ${comp}`).toContain(comp);
      expect(previewSrc, `preview does not use ${comp}`).toContain(comp);
    }
  });
});

describe("the lesson editor's type field", () => {
  it("drives the panels from state, not from the saved value", () => {
    // The field is labelled "decides the fields below". Branching on the saved
    // type meant it decided nothing until you saved and the page came back —
    // pick Audio, still see a Video URL box.
    const s = read("components/admin/lesson-type-fields.tsx");
    expect(s).toContain('"use client"');
    expect(s).toMatch(/useState<ItemType>\(item\.itemType\)/);
    expect(s).toMatch(/type === "video"/);
    expect(s, "still branching on the saved value").not.toMatch(/item\.itemType === /);
  });

  it("keeps a URL that the type was switched away from", () => {
    // An unrendered input posts nothing, so without these the act of changing
    // type would silently wipe an address that was already typed.
    const s = read("components/admin/lesson-type-fields.tsx");
    expect(s).toContain('type !== "video" && <input type="hidden" name="videoEmbedUrl"');
    expect(s).toContain('type !== "audio" && <input type="hidden" name="audioUrl"');
  });
});

describe("audio from a link", () => {
  it("prefers the link over an upload, and says nothing when there is neither", () => {
    const s = read("components/library/lesson-view.tsx");
    expect(s).toMatch(/item\.audioUrl \?[\s\S]{0,120}AudioPlayer src=\{item\.audioUrl\}/);
    expect(s).toContain("hasn't been added yet");
  });

  it("warns that a pasted link is not ownership-checked", () => {
    // An upload is served through a signed, ownership-checked URL; a link is
    // playable by anyone who has it. The difference is invisible once saved,
    // so the editor has to say it at the point of choosing.
    const s = read("components/admin/lesson-type-fields.tsx");
    expect(s).toMatch(/Anyone with the address can play it/);
  });
});
