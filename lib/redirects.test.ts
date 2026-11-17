import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  isProtectedPath,
  matchRedirect,
  normalizePath,
  redirectSchema,
  redirectsSchema,
  traceRedirect,
  validateRules,
  type StoreRedirect,
} from "@/lib/redirects";

/** The redirect manager's rules. Spec: docs/superpowers/specs/2026-11-17-redirect-manager-design.md. */
const r = (o: Partial<StoreRedirect>): StoreRedirect => redirectSchema.parse({ to: "https://greaterinside.com", ...o });

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
  it("reads an old rule with today's defaults", () => {
    expect(redirectSchema.parse({ from: "/a", to: "/b", permanent: false })).toEqual({
      name: "", from: "/a", to: "/b", match: "exact", permanent: false, query: "keep", enabled: true,
    });
  });

  it("protects the admin, checkout and members' areas on a segment boundary", () => {
    for (const p of ["/admin", "/Admin/members", "/checkout", "/checkout-preview", "/account", "/library/x", "/apps", "/reset", "/api/webhooks/stripe", "/robots.txt", "/_next/data"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
    for (const p of ["/", "/o/foundation-weekend", "/appsy", "/libraryx", "/p/guide"]) expect(isProtectedPath(p), p).toBe(false);
  });

  it("matches an exact rule however the address was typed, 301 by default, 302 when temporary", () => {
    expect(matchRedirect([r({ from: "/o/Old/" })], "/o/old")).toEqual({ location: "https://greaterinside.com/", status: 301, ruleIndex: 0 });
    expect(matchRedirect([r({ from: "/o/old", permanent: false })], "/o/old")?.status).toBe(302);
  });

  it("reuses a pattern's captures with the visitor's letter case", () => {
    expect(matchRedirect([r({ match: "pattern", from: "^/blog/(.*)$", to: "https://x.test/news/$1" })], "/blog/My-Post/")?.location).toBe(
      "https://x.test/news/My-Post",
    );
  });

  it("keeps the visitor's query by default, the destination's own value winning, and never passes _rsc", () => {
    expect(matchRedirect([r({ from: "/a", to: "https://x.test/b?utm_source=site" })], "/a", "?utm_source=meta&fbclid=9&_rsc=abc")?.location).toBe(
      "https://x.test/b?utm_source=site&fbclid=9",
    );
    expect(matchRedirect([r({ from: "/a", to: "/b", query: "drop" })], "/a", "?utm_source=meta")?.location).toBe("/b");
  });

  it("skips switched-off rules, half-typed rules, self-loops and stored patterns that no longer compile", () => {
    expect(matchRedirect([r({ from: "/a", enabled: false }), r({ from: "/a", to: "/b" })], "/a")?.ruleIndex).toBe(1);
    expect(matchRedirect([r({ from: "", to: "/b" }), r({ from: "/a", to: "/a/" }), r({ match: "pattern", from: "(" })], "/a")).toBeNull();
  });

  it("takes the first match", () => {
    expect(matchRedirect([r({ from: "/a", to: "/one" }), r({ match: "pattern", from: "^/(.*)$", to: "/two" })], "/a")?.location).toBe("/one");
  });

  it("never matches a protected address, even with a pattern that would", () => {
    expect(matchRedirect([r({ match: "pattern", from: "^/(.*)$" })], "/admin")).toBeNull();
    expect(matchRedirect([r({ match: "pattern", from: "^/(.*)$" })], "/o/x")).not.toBeNull();
  });

  it("says nothing about a path with no rule", () => {
    expect(matchRedirect([r({ from: "/a" })], "/b")).toBeNull();
  });
});

describe("checked on save", () => {
  const bad = (rules: StoreRedirect[]) => validateRules(rules).map((p) => p.index);

  it("refuses a protected exact address, a bad scheme, and a bad, slow or long pattern", () => {
    expect(bad([r({ from: "/checkout" })])).toEqual([0]);
    expect(bad([r({ from: "/a", to: "javascript:alert(1)" })])).toEqual([0]);
    expect(bad([r({ match: "pattern", from: "(" })])).toEqual([0]);
    expect(bad([r({ match: "pattern", from: "^/(a+)+$" })])).toEqual([0]);
    expect(bad([r({ match: "pattern", from: "^/" + "a".repeat(300) })])).toEqual([0]);
  });

  it("refuses rules that send visitors in a circle", () => {
    expect(bad([r({ from: "/a", to: "/b" }), r({ from: "/b", to: "/a" })])).toEqual([0, 1]);
    expect(bad([r({ match: "pattern", from: "^/(.*)$", to: "/new/$1" })])).toEqual([0]);
  });

  it("accepts rules that end somewhere", () => {
    expect(bad([r({ match: "pattern", from: "^/old/(.*)$", to: "/new/$1" }), r({ from: "/x", to: "https://greaterinside.com" })])).toEqual([]);
  });

  it("says why, in plain words", () => {
    expect(validateRules([r({ from: "/checkout" })])[0].message).toBe(
      "That address is part of the admin, checkout or members' area, so it can't be redirected.",
    );
  });
});

describe("the address test", () => {
  it("follows an address through every rule it meets", () => {
    const rules = [r({ from: "/a", to: "/b" }), r({ from: "/b", to: "https://greaterinside.com" })];
    expect(traceRedirect(rules, "/a")).toEqual({
      steps: [
        { ruleIndex: 0, location: "/b", status: 301 },
        { ruleIndex: 1, location: "https://greaterinside.com/", status: 301 },
      ],
      protectedPath: false,
      loop: false,
    });
  });

  it("says a protected address is never redirected, even pasted as a full URL", () => {
    expect(traceRedirect([r({ match: "pattern", from: "^/(.*)$" })], "https://grow.greaterinside.com/admin").protectedPath).toBe(true);
  });

  it("spots a circle", () => {
    expect(traceRedirect([r({ from: "/a", to: "/b" }), r({ from: "/b", to: "/a" })], "/a").loop).toBe(true);
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
    const mw = readFileSync("proxy.ts", "utf8");
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
