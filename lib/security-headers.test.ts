import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

// The preview iframe needs one route to be frameable. Everything else must not
// be: a checkout that can be framed can be clickjacked.
//
// This also pins an ordering dependency that is invisible in the file. Next
// applies every matching header rule and the LAST one wins, so putting the
// specific rule before the catch-all silently reverts it to DENY — which is
// exactly what happened, and curl still returned 200 while the browser refused
// to render the frame.

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

async function rules(): Promise<Rule[]> {
  const fn = (nextConfig as { headers?: () => Promise<Rule[]> }).headers;
  if (!fn) throw new Error("next.config has no headers()");
  return fn();
}

/** What a browser ends up with: last matching rule wins per header key. */
function effective(all: Rule[], path: string, key: string): string | undefined {
  let value: string | undefined;
  for (const r of all) {
    const pattern = "^" + r.source.replace(/:\w+\*/g, ".*").replace(/:\w+/g, "[^/]+") + "$";
    if (new RegExp(pattern).test(path)) {
      const hit = r.headers.find((h) => h.key.toLowerCase() === key.toLowerCase());
      if (hit) value = hit.value;
    }
  }
  return value;
}

describe("frame protection", () => {
  it("lets the preview frame be embedded by this site only", async () => {
    const all = await rules();
    const p = "/oto-preview/abc";
    expect(effective(all, p, "X-Frame-Options")).toBe("SAMEORIGIN");
    expect(effective(all, p, "Content-Security-Policy")).toBe("frame-ancestors 'self'");
  });

  it("refuses framing everywhere else, including checkout and the preview shell", async () => {
    const all = await rules();
    for (const p of [
      "/",
      "/checkout",
      "/checkout/oto",
      "/admin",
      "/admin/offers/abc/preview",
      "/library",
    ]) {
      expect(effective(all, p, "X-Frame-Options"), p).toBe("DENY");
      expect(effective(all, p, "Content-Security-Policy"), p).toBe("frame-ancestors 'none'");
    }
  });

  it("keeps the other security headers on both", async () => {
    const all = await rules();
    for (const p of ["/", "/oto-preview/abc"]) {
      expect(effective(all, p, "X-Content-Type-Options"), p).toBe("nosniff");
      expect(effective(all, p, "Strict-Transport-Security"), p).toContain("max-age=");
    }
  });
});
