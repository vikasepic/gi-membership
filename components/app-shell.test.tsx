import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A buyer mid-payment should not be handed four ways to leave. The upsell page
// escaped the shell for that reason long before the checkout did.

const src = readFileSync("components/app-shell.tsx", "utf8");
const owns = (src.match(/OWNS_THE_WINDOW = \[([^\]]*)\]/)?.[1] ?? "")
  .split(",")
  .map((s) => s.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);

describe("which pages own the whole window", () => {
  it.each(["/checkout", "/checkout/offer", "/checkout/oto"])("%s does", (path) => {
    expect(owns).toContain(path);
  });

  it("thank-you does not", () => {
    // At that point the navigation is how someone reaches what they just
    // bought. Taking it away strands them on a receipt.
    expect(owns).not.toContain("/checkout/thank-you");
  });

  it("matches exactly, not by prefix", () => {
    // startsWith("/checkout") would have swallowed thank-you and every future
    // page under it, silently.
    expect(src).toContain("OWNS_THE_WINDOW.includes(pathname)");
  });
});
