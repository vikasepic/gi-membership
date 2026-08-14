import { describe, it, expect } from "vitest";
import {
  POST_PURCHASE_DEFAULTS,
  buildPostPurchaseEmail,
  firstNameOf,
} from "@/lib/post-purchase-email";

const build = (over: Parameters<typeof buildPostPurchaseEmail>[0]) => buildPostPurchaseEmail(over);

describe("the greeting", () => {
  it("uses their first name", () => {
    expect(build({ firstName: "Priya", products: ["A"] }).html).toContain("hi Priya");
  });

  it("says just “hi” when we have no name, not “hi ,”", () => {
    // A member who signed up without a name, and every anonymous buyer whose
    // name field we never got. "hi there" is a mail merge that failed and
    // everybody can tell; "hi ," is worse.
    const out = build({ firstName: "", products: ["A"] }).html;
    expect(out).toContain(">hi<");
    expect(out).not.toContain("hi ,");
    expect(out).not.toMatch(/hi\s+</);
  });

  it("does not greet somebody by their email address", () => {
    // Browsers autofill an address into a name field often enough that this
    // reaches production on its own.
    expect(firstNameOf("jane@gmail.com")).toBe("");
    expect(firstNameOf("Jane Okafor")).toBe("Jane");
    expect(firstNameOf(null)).toBe("");
  });
});

describe("what they bought", () => {
  it("lists every purchase, in order", () => {
    const html = build({ firstName: "A", products: ["Base", "The bump", "The upsell"] }).html;
    const at = (s: string) => html.indexOf(s);
    expect(at("Base")).toBeGreaterThan(-1);
    expect(at("The bump")).toBeGreaterThan(at("Base"));
    expect(at("The upsell")).toBeGreaterThan(at("The bump"));
  });

  it("reads fine with exactly one", () => {
    const html = build({ firstName: "A", products: ["Only this"] }).html;
    expect(html).toContain("Only this");
    expect(html).toContain("<ul");
  });

  it("draws no empty list when there is nothing to list", () => {
    // Should never happen — somebody bought something — but an empty <ul> in an
    // email is a stray bullet with nothing beside it.
    expect(build({ firstName: "A", products: [] }).html).not.toContain("<ul");
  });

  it("escapes a product name rather than letting it become markup", () => {
    const html = build({ firstName: "A", products: ['<img src=x onerror="alert(1)">'] }).html;
    // The characters survive as characters; what must not survive is a tag.
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;alert(1)&quot;");
  });
});

describe("the email survives an inbox", () => {
  const mail = build({ firstName: "Priya", products: ["A", "B"] });

  it("carries no stylesheet, because Gmail strips them", () => {
    expect(mail.html).not.toContain("<style");
    expect(mail.html).toContain("style=");
  });

  it("uses tables rather than flexbox for its layout", () => {
    expect(mail.html).toContain("<table");
    expect(mail.html).not.toContain("display:flex");
  });

  it("shows the band colour when the header picture is blocked", () => {
    // On a first email from an unknown sender a lot of clients block images.
    // Without a colour behind it the email opens with a white gap.
    expect(mail.html).toContain(POST_PURCHASE_DEFAULTS.headerBackground);
  });

  it("has a plain-text version carrying the same facts", () => {
    expect(mail.text).toContain("Priya");
    expect(mail.text).toContain(POST_PURCHASE_DEFAULTS.accessUrl);
    expect(mail.text).toContain("- A");
  });

  it("makes the addresses and the link clickable", () => {
    expect(mail.html).toContain(`href="${POST_PURCHASE_DEFAULTS.accessUrl}"`);
    expect(mail.html).toContain('href="mailto:support@greaterinside.com"');
    expect(mail.html).toContain('href="mailto:a@ajitnawalkha.com"');
  });
});

describe("the copy is the copy", () => {
  it("keeps the voice it was written in", () => {
    // Lowercase on purpose. A "corrected" version with capital letters is a
    // different person writing, and this email is signed by a person.
    expect(POST_PURCHASE_DEFAULTS.greeting).toBe("hi {{first_name}}");
    expect(POST_PURCHASE_DEFAULTS.intro).toBe(
      "you are officially now a part of greater inside community. welcome!",
    );
    expect(POST_PURCHASE_DEFAULTS.subject).toBe("You’re in. Welcome to Greater Inside.");
  });

  it("ships switched off", () => {
    // It replaces an email that currently works. Nothing changes for buyers
    // until somebody turns it on deliberately.
    expect(POST_PURCHASE_DEFAULTS.enabled).toBe(false);
  });

  it("bundles no photograph", () => {
    // Both pictures come from the media library. One compiled in is one nobody
    // can change without a deploy.
    expect(POST_PURCHASE_DEFAULTS.headerImageUrl).toBe("");
    expect(POST_PURCHASE_DEFAULTS.signatureImageUrl).toBe("");
  });
});
