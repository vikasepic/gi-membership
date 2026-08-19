import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The design editor's preview, which never loaded.
 *
 * It framed /checkout, and /checkout is covered by the catch-all
 * X-Frame-Options: DENY and frame-ancestors 'none' in next.config.ts. That
 * header is not incidental — a transparent frame over a pay button is the
 * textbook clickjack — so the fix is not to relax it. It is a second URL,
 * admin-only, framable by this site alone, exactly as /oto-preview and
 * /course-preview already are.
 */

const config = readFileSync("next.config.ts", "utf8");
const preview = readFileSync("app/(store)/checkout-preview/page.tsx", "utf8");
const form = readFileSync("components/admin/checkout-design-form.tsx", "utf8");

describe("the real checkout", () => {
  it("still refuses to be framed by anyone", () => {
    const first = config.slice(config.indexOf('source: "/:path*"'), config.indexOf("/checkout-preview"));
    expect(first).toContain('{ key: "X-Frame-Options", value: "DENY" }');
    expect(first).toContain("frame-ancestors 'none'");
  });
});

describe("the preview URL", () => {
  it("may be framed by this site and nothing else", () => {
    const rule = config.slice(config.indexOf('source: "/checkout-preview"'));
    expect(rule).toContain('{ key: "X-Frame-Options", value: "SAMEORIGIN" }');
    expect(rule).toContain("frame-ancestors 'self'");
  });

  it("is declared AFTER the catch-all", () => {
    // Next applies every matching rule in order and the last one wins, so a
    // specific rule placed first is silently overwritten by the general one.
    expect(config.indexOf('source: "/:path*"')).toBeLessThan(config.indexOf('source: "/checkout-preview"'));
  });

  it("is admin-only", () => {
    // Otherwise it is a public checkout clone that anybody may frame — the
    // exact thing the DENY header exists to prevent.
    expect(preview).toContain("await requireAdmin()");
  });

  it("is not indexable", () => {
    expect(preview).toContain("NOINDEX");
  });
});

describe("what the preview renders", () => {
  it("is the checkout itself, not a copy of it", () => {
    // A preview that renders its own approximation is a second renderer to
    // keep in step, and the editor's claim — "there is no second renderer to
    // fall out of step" — stops being true the first time one changes.
    expect(preview).toContain('import CheckoutPage from "@/app/(store)/checkout/page"');
    expect(preview).toContain("<CheckoutPage {...props} />");
  });

  it("is what the editor actually points at", () => {
    expect(form).toContain("/checkout-preview?product=");
    expect(form).not.toContain("`/checkout?product=");
  });

  it("still busts its own cache on save", () => {
    // Otherwise the frame shows the colours from before you pressed Save.
    expect(form).toContain("state?.saved ? `&t=${state.saved}`");
  });
});
