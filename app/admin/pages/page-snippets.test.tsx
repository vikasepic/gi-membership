// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { SnippetFields } from "@/components/admin/snippet-fields";

let root: { unmount: () => void } | null = null;
afterEach(() => { const r = root; root = null; if (r) act(() => r.unmount()); });

function posted(name: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host); root = r;
  act(() => {
    r.render(
      <SnippetFields
        name={name}
        snippets={[{ name: "Pixel", place: "head", code: "<script>x</script>", on: true, onCheckout: false }]}
      />,
    );
  });
  return host.querySelector<HTMLInputElement>('input[type="hidden"]');
}

/**
 * The list posted a name nothing read.
 *
 * `SnippetFields` hardcoded `codeSnippets`, which is what the site-wide action
 * reads — so that form worked. The page-level action reads `snippets`, so the
 * page list posted a key that was never looked at, saved an empty array, and
 * said "Saved." An integration test that called `savePageSettings` directly
 * passed the whole time, because the fault was in the form layer it skipped.
 */
describe("the snippet list posts what its action reads", () => {
  it("posts under the name it is given", () => {
    expect(posted("snippets")?.name).toBe("snippets");
    expect(posted("codeSnippets")?.name).toBe("codeSnippets");
  });

  it("carries the snippets as JSON", () => {
    expect(JSON.parse(posted("snippets")!.value)[0].name).toBe("Pixel");
  });

  it("has no name of its own to fall back on", () => {
    // A default would let a third form be added that silently posts the wrong
    // key — which is the bug, not a variation of it.
    const src = readFileSync("components/admin/snippet-fields.tsx", "utf8");
    expect(src).not.toContain('name="codeSnippets"');
    expect(src).toContain("name={name}");
  });

  it("is given, at each call site, the key that form's action reads", () => {
    // The two ends, checked against each other rather than assumed to agree.
    const pageForm = readFileSync("components/admin/page-settings.tsx", "utf8");
    const pageAction = readFileSync("app/admin/pages/actions.ts", "utf8");
    expect(pageForm).toContain('name="snippets"');
    expect(pageAction).toContain('formData.get("snippets")');

    const siteForm = readFileSync("components/admin/settings-screen.tsx", "utf8");
    const siteAction = readFileSync("app/admin/settings/actions.ts", "utf8");
    expect(siteForm).toContain('name="codeSnippets"');
    expect(siteAction).toContain('"codeSnippets"');
  });
});
