import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { matchRedirect, normalizePath, redirectsSchema, type StoreRedirect } from "@/lib/redirects";

const rule = (from: string, to: string, permanent = true): StoreRedirect => ({ from, to, permanent });

describe("a path is matched however it was typed", () => {
  it("settles the slashes and the case", () => {
    // People type all four variants of one rule and expect them to work. A
    // field that accepts all four and matches one is a rule that looks
    // configured and does nothing.
    for (const v of ["/o/funnel", "o/funnel", "/o/funnel/", "/O/Funnel"]) {
      expect(normalizePath(v), v).toBe("/o/funnel");
    }
  });

  it("takes the path out of a pasted URL", () => {
    // Copying the address bar is the obvious way to fill this in.
    expect(normalizePath("https://grow.greaterinside.com/o/funnel")).toBe("/o/funnel");
  });

  it("drops a query string and a hash", () => {
    expect(normalizePath("/o/funnel?utm_source=ig#top")).toBe("/o/funnel");
  });

  it("keeps the root as the root", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("is nothing when there is nothing", () => {
    expect(normalizePath("   ")).toBe("");
  });
});

describe("which rule wins", () => {
  it("matches whatever the visitor typed against whatever was configured", () => {
    const rules = [rule("O/Funnel/", "/p/funnel-app")];
    expect(matchRedirect(rules, "/o/funnel")?.to).toBe("/p/funnel-app");
  });

  it("takes the first match, so a specific rule can sit above a broad one", () => {
    const rules = [rule("/old", "/new-one"), rule("/old", "/new-two")];
    expect(matchRedirect(rules, "/old")?.to).toBe("/new-one");
  });

  it("ignores a half-typed rule", () => {
    // Somebody mid-thought is not a rule they want applied to the live site.
    expect(matchRedirect([rule("/old", "")], "/old")).toBeNull();
    expect(matchRedirect([rule("", "/new")], "/old")).toBeNull();
  });

  it("refuses a rule that points at itself", () => {
    // A browser follows a loop about twenty times before saying something
    // unhelpful, and the page it was meant to fix never renders.
    expect(matchRedirect([rule("/old", "/old/")], "/old")).toBeNull();
    expect(matchRedirect([rule("/old", "OLD")], "/old")).toBeNull();
  });

  it("allows an external target that looks like the same path", () => {
    // Only a same-site target can loop.
    expect(matchRedirect([rule("/old", "https://elsewhere.com/old")], "/old")?.to).toBe(
      "https://elsewhere.com/old",
    );
  });

  it("says nothing about a path with no rule", () => {
    expect(matchRedirect([rule("/old", "/new")], "/something-else")).toBeNull();
  });

  it("carries whether it is permanent", () => {
    expect(matchRedirect([rule("/a", "/b", true)], "/a")?.permanent).toBe(true);
    expect(matchRedirect([rule("/a", "/b", false)], "/a")?.permanent).toBe(false);
  });
});

describe("what gets stored", () => {
  it("defaults to permanent", () => {
    // A renamed page has really moved, and that is what tells a search engine
    // to bring its index across.
    const parsed = redirectsSchema.parse([{ from: "/a", to: "/b" }]);
    expect(parsed[0].permanent).toBe(true);
  });

  it("reads an empty list", () => {
    expect(redirectsSchema.parse(undefined)).toEqual([]);
  });
});

describe("where they are checked", () => {
  const src = readFileSync("app/not-found.tsx", "utf8");

  it("runs at the 404 boundary, not in middleware", () => {
    // A redirect only matters once the router has decided there is nothing
    // here. In middleware it would cost a settings read on every request to
    // every working page, to answer a question almost always answered "no".
    expect(src).toContain("matchRedirect");
    const mw = readFileSync("middleware.ts", "utf8");
    expect(mw).not.toContain("matchRedirect");
  });

  it("cannot take the 404 page down with it", () => {
    // This page is the last thing standing between a bad link and a stack
    // trace, so an unreadable settings row costs it its redirects and nothing
    // more.
    expect(src).toContain("catch");
  });

  it("lets the redirect itself through the catch", () => {
    // `redirect` throws by design in Next — that is how it stops rendering.
    // Swallowing it would turn every working redirect back into a 404.
    const fn = src.slice(src.indexOf("async function sendAnywhereItShould"));
    expect(fn.indexOf("permanentRedirect(")).toBeGreaterThan(fn.indexOf("} catch {"));
  });
});
