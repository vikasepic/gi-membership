import { describe, it, expect } from "vitest";
import { magicLinkEmailHtml } from "@/lib/auth-email";

/**
 * The sign-in email is sent by Supabase, not by this app — GoTrue fetches this
 * template and fills in its own placeholders. That makes two things load-
 * bearing: the placeholders must survive verbatim, and the markup must survive
 * an email client.
 */
describe("the sign-in email", () => {
  it("leaves GoTrue's placeholders untouched", async () => {
    // Escaped or renamed, GoTrue fills in nothing and the email ships with a
    // dead button — the one email where a dead button locks somebody out.
    const html = await magicLinkEmailHtml();
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).toContain("{{ .Email }}");
    expect(html).not.toContain("&#123;");
  });

  it("gives the link a button AND the address in full", async () => {
    // Some clients strip buttons and some people paste links into another
    // browser. A link that exists only inside an anchor is one those people
    // cannot use.
    const html = await magicLinkEmailHtml();
    expect(html).toContain(">\n                Sign in\n              </a>");
    expect(html).toContain("Paste this into your browser");
    // Twice: once in the button, once in the open.
    expect(html.split("{{ .ConfirmationURL }}").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("survives an email client", async () => {
    const html = await magicLinkEmailHtml();
    expect(html).not.toContain("<style");
    expect(html).not.toContain("display:flex");
    expect(html).toContain("<table");
    // Outlook renders a bgcolor table reliably where a styled anchor collapses
    // to plain text.
    expect(html).toContain('bgcolor="#b0532f"');
  });

  it("says what to do about one nobody asked for", async () => {
    // The question anybody asks when a sign-in email they did not request
    // arrives, and the answer that stops them panicking.
    const html = await magicLinkEmailHtml();
    expect(html).toContain("If that was not you");
  });

  it("is served where Supabase can fetch it", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync("app/email/magic-link/route.ts", "utf8");
    expect(route).toContain("text/html");
    // Public on purpose: GoTrue fetches it with no credentials, and a template
    // holds no link, no token and no address.
    expect(route).not.toContain("requireAdmin");
  });
});
