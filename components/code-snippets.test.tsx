import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CodeSnippets } from "@/components/code-snippets";
import { codeSnippetsSchema, type CodeSnippet } from "@/lib/code-snippets";

const snips = (...o: Partial<CodeSnippet>[]): CodeSnippet[] =>
  codeSnippetsSchema.parse(o.map((x) => ({ code: "x", ...x })));

const html = (list: CodeSnippet[], place: "head" | "bodyStart" | "bodyEnd", onCheckout = false) =>
  renderToStaticMarkup(<CodeSnippets snippets={list} place={place} onCheckout={onCheckout} />);

describe("pasted code reaches the page", () => {
  it("emits a body snippet as the markup it was given", () => {
    const out = html(snips({ place: "bodyEnd", code: '<script src="/a.js"></script>' }), "bodyEnd");
    expect(out).toContain('<script src="/a.js">');
  });

  it("emits head tags as real elements React can hoist", () => {
    // Not innerHTML: nothing may wrap the contents of a head, so these have to
    // be elements or they cannot get there at all.
    const out = html(snips({ place: "head", code: '<script async src="https://x/a.js"></script>' }), "head");
    expect(out).toContain('src="https://x/a.js"');
    expect(out).toContain("async");
  });

  it("keeps an inline head script's code", () => {
    const out = html(snips({ place: "head", code: "<script>window.x=1;</script>" }), "head");
    expect(out).toContain("window.x=1;");
  });

  it("draws nothing at all when there is nothing to draw", () => {
    expect(html([], "bodyEnd")).toBe("");
    expect(html(snips({ place: "bodyEnd", on: false }), "bodyEnd")).toBe("");
  });

  it("puts each snippet only in its own position", () => {
    const list = snips({ place: "head", code: "<script>A</script>" }, { place: "bodyEnd", code: "<script>B</script>" });
    expect(html(list, "head")).toContain("A");
    expect(html(list, "head")).not.toContain("B");
    expect(html(list, "bodyEnd")).toContain("B");
  });
});

/**
 * The checkout is the reason this feature needed thinking about rather than
 * just building. Card fields live in Stripe's own frame, so nothing pasted here
 * can read a card number — but a script on that page reads the email and the
 * name, and a payment page is meant to carry a known, deliberate list.
 */
describe("the checkout stays clean unless told otherwise", () => {
  const list = snips(
    { name: "chat", place: "bodyEnd", code: "<script>chat()</script>" },
    { name: "pixel", place: "bodyEnd", code: "<script>pixel()</script>", onCheckout: true },
  );

  it("runs only the snippets that opted in", () => {
    const out = html(list, "bodyEnd", true);
    expect(out).toContain("pixel()");
    expect(out).not.toContain("chat()");
  });

  it("runs both everywhere else", () => {
    const out = html(list, "bodyEnd", false);
    expect(out).toContain("pixel()");
    expect(out).toContain("chat()");
  });

  it("fails safe when the path is unknown", () => {
    // The layout treats a missing x-pathname as the checkout, so a proxy
    // that stopped setting it costs a snippet firing — visible, and reported —
    // rather than putting a third-party script on a payment page unnoticed.
    const layout = readFileSync("app/(store)/layout.tsx", "utf8");
    expect(layout).toContain("path === null || path.startsWith(\"/checkout\")");
  });

  it("has the header it depends on actually set", () => {
    // The guard above is only as good as the thing that feeds it.
    expect(readFileSync("proxy.ts", "utf8")).toContain('set("x-pathname"');
  });
});
