// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buyClickOf, sectionLabels } from "@/components/scroll-tracker";

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

describe("telling a buy click from any other click", () => {
  // Built per test: the first describe replaces document.body when it runs,
  // so a page built at collection time is gone by the time these run.
  function page() {
    document.body.innerHTML = `
      <section><h2>Hero</h2><a href="/checkout/offer?offer=abc"><span>Get it for $29</span></a></section>
      <section><h2>Pricing</h2><a href="/checkout?product=x">Buy now</a><a href="/library">Library</a></section>
      <div class="sticky"><a href="/checkout/offer?offer=abc">Start</a></div>
      <section><h2>Other</h2><a href="/checkouts-guide">Read the guide</a></section>`;
    const sections = Array.from(document.querySelectorAll("section"));
    return { sections, labels: sectionLabels(sections) };
  }
  const at = (text: string) => Array.from(document.querySelectorAll("a")).find((a) => a.textContent === text)!;

  it("names the section and the words on the button, even when the click lands on a child", () => {
    const { sections, labels } = page();
    const inner = at("Get it for $29").querySelector("span")!;
    expect(buyClickOf(inner, sections, labels)).toEqual({ section: 0, sectionLabel: "Hero", button: "Get it for $29" });
    expect(buyClickOf(at("Buy now"), sections, labels)).toEqual({ section: 1, sectionLabel: "Pricing", button: "Buy now" });
  });

  it("marks a button outside every section, like a sticky bar", () => {
    const { sections, labels } = page();
    expect(buyClickOf(at("Start"), sections, labels)).toMatchObject({ section: -1, button: "Start" });
  });

  it("ignores links that do not go to a checkout", () => {
    const { sections, labels } = page();
    expect(buyClickOf(at("Library"), sections, labels)).toBeNull();
    expect(buyClickOf(at("Read the guide"), sections, labels)).toBeNull();
    expect(buyClickOf(document.body, sections, labels)).toBeNull();
  });
});

describe("the click route trusts nothing in the body", () => {
  const src = readFileSync("app/api/track/click/route.ts", "utf8");
  it("keys on the visit from the cookie and clamps the rest", () => {
    expect(src).toContain("await currentVisitId()");
    expect(src).not.toMatch(/body\.visit/);
    expect(src).toContain("Math.min(59, Math.max(-1");
    expect(src).toContain(".slice(0, 60)");
  });
});
