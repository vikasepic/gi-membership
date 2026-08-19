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

  it("is admin-only, proved by something a frame can actually carry", () => {
    // requireAdmin() was the gate and it could never pass: a SameSite=Lax
    // cookie is not sent when a document is loaded into an iframe, so the
    // framed request had no session, redirected to /login and on to the store
    // root — which refuses framing outright. The panel showed a broken
    // document while the server answered 200 the whole time.
    expect(preview).toContain('verifyPreviewToken(t, "checkout")');
    // The CALL, not the comment explaining why it is gone.
    expect(preview).not.toContain("await requireAdmin()");
  });

  it("refuses by rendering, not by navigating", () => {
    // A redirect inside a frame is the thing that broke it. A 404 in place is
    // something an admin can see and act on.
    expect(preview).toContain("notFound()");
    expect(preview).not.toContain("redirect(");
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
    // `v`, not `t` — `t` is the token now, and reusing it would have made the
    // cache-buster overwrite the authorisation.
    expect(form).toContain("`&v=${state.saved}`");
  });

  it("carries the token the frame cannot prove for itself", () => {
    expect(form).toContain("previewToken");
  });
});

describe("the preview token", () => {
  const token = readFileSync("lib/preview-token.ts", "utf8");

  it("is minted where a session exists, not inside the frame", () => {
    const page = readFileSync("app/admin/checkout/page.tsx", "utf8");
    expect(page).toContain("await requireAdmin()");
    expect(page).toContain('signPreviewToken("checkout")');
  });

  it("expires", () => {
    // A URL copied out of devtools has to stop working.
    expect(token).toContain("exp > Math.floor(now / 1000)");
    expect(token).toContain("TTL_SECONDS");
  });

  it("is scoped to one kind of preview", () => {
    // They all grant little, but "little" is not "the same little".
    expect(token).toContain("payload.kind === kind");
  });

  it("compares lengths before comparing bytes", () => {
    // timingSafeEqual throws on a length mismatch rather than returning false,
    // and a thrown comparison is a 500 on a preview.
    expect(token).toContain("a.length !== b.length || !timingSafeEqual(a, b)");
  });

  it("fixes the other two panels that had the same gate", () => {
    // Same cookie, same frame, same broken document.
    const oto = readFileSync("app/oto-preview/[id]/page.tsx", "utf8");
    const course = readFileSync("app/course-preview/[id]/page.tsx", "utf8");
    for (const [src, kind] of [[oto, "oto"], [course, "course"]] as const) {
      expect(src).toContain(`verifyPreviewToken(t, "${kind}")`);
      expect(src).not.toContain("await requireAdmin()");
    }
  });
});
