// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sectionLabels } from "@/components/scroll-tracker";

describe("naming the sections a visit scrolled through", () => {
  it("uses the first heading, then the first text, then a number", () => {
    document.body.innerHTML = `
      <section><h2>  Who this is
        for </h2></section>
      <section><p>no heading, so this line names it</p></section>
      <section><img alt=""></section>
      <section><h3>${"x".repeat(80)}</h3></section>`;
    const labels = sectionLabels(Array.from(document.querySelectorAll("section")));
    expect(labels[0]).toBe("Who this is for");
    expect(labels[1]).toBe("no heading, so this line names it");
    expect(labels[2]).toBe("Section 3");
    expect(labels[3]).toHaveLength(60);
  });
});

describe("where it is mounted", () => {
  it("is on both sales pages, and never for a preview", () => {
    for (const p of ["app/(store)/p/[slug]/page.tsx", "app/(store)/o/[key]/page.tsx"]) {
      const src = readFileSync(p, "utf8");
      expect(src).toMatch(/\{!preview && <ScrollTracker path=\{`\/(p|o)\/\$\{(slug|key)\}`\} \/>\}/);
    }
  });

  it("does not touch the checkout, which has no sections to scroll", () => {
    expect(readFileSync("app/(store)/checkout/page.tsx", "utf8")).not.toContain("ScrollTracker");
  });
});

describe("the route trusts nothing in the body", () => {
  const src = readFileSync("app/api/track/scroll/route.ts", "utf8");
  it("keys on the visit from the cookie, never a body field", () => {
    expect(src).toContain("await currentVisitId()");
    expect(src).not.toMatch(/body\.visit/);
  });
  it("clamps every number and truncates every string", () => {
    expect(src).toContain("int(body.depth, 0, 100)");
    expect(src).toContain("int(body.section, -1, MAX_SECTIONS - 1)");
    expect(src).toContain(".slice(0, 60)");
  });
});
