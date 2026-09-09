import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { appKindFrom, appKindTabs, appsOfKind } from "@/lib/app-kind-filter";

const apps = [
  { key: "content-engine", kind: "external" as const },
  { key: "funnel", kind: "external" as const },
  { key: "book-writer", kind: "external" as const },
  { key: "hook-generator", kind: "internal" as const },
  { key: "micro-product-builder", kind: "internal" as const },
];

describe("which apps the list shows", () => {
  it("defaults to all, so the page opens as it always did", () => {
    expect(appKindFrom({})).toBe("all");
  });

  it("reads the tab off the URL", () => {
    expect(appKindFrom({ kind: "internal" })).toBe("internal");
    expect(appKindFrom({ kind: "external" })).toBe("external");
  });

  it("falls back rather than rendering nothing for a value it does not know", () => {
    // The value comes off the URL. An unrecognised one has to select a view.
    expect(appKindFrom({ kind: "builtin" })).toBe("all");
    expect(appKindFrom({ kind: ["internal", "external"] })).toBe("internal");
    expect(appKindFrom({ kind: "" })).toBe("all");
    expect(appKindFrom({ kind: "constructor" })).toBe("all");
  });

  it("filters to one kind, and 'all' filters nothing", () => {
    expect(appsOfKind(apps, "internal").map((a) => a.key)).toEqual([
      "hook-generator",
      "micro-product-builder",
    ]);
    expect(appsOfKind(apps, "external")).toHaveLength(3);
    expect(appsOfKind(apps, "all")).toHaveLength(5);
  });
});

describe("the tabs themselves", () => {
  it("counts each kind", () => {
    expect(appKindTabs(apps)).toEqual([
      { key: "all", label: "All", count: 5 },
      { key: "internal", label: "Built-in", count: 2 },
      { key: "external", label: "Connected", count: 3 },
    ]);
  });

  it("draws none when there is only one kind to show", () => {
    // A tab standing permanently empty is worse than no tab.
    expect(appKindTabs(apps.filter((a) => a.kind === "external"))).toEqual([]);
    expect(appKindTabs(apps.filter((a) => a.kind === "internal"))).toEqual([]);
    expect(appKindTabs([])).toEqual([]);
  });

  it("says Connected, the word the rest of the admin already uses", () => {
    // The page intro, the per-app badge and the offer form's grant picker all
    // say "connected". Renaming it here alone would make three screens
    // disagree about what an app is.
    const labels = appKindTabs(apps).map((t) => t.label);
    expect(labels).toContain("Connected");
    expect(labels).not.toContain("External");
    const form = readFileSync("components/admin/offer-form.tsx", "utf8");
    expect(form).toContain('"built in" : "connected"');
  });
});
