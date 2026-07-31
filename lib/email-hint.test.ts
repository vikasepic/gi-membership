import { describe, it, expect } from "vitest";
import { suggestEmail, looksLikeEmail } from "@/lib/email-hint";

describe("looksLikeEmail", () => {
  it("accepts the awkward addresses that are still real", () => {
    // Every one of these is a genuine address people use, and every one gets
    // rejected by a regex someone wrote in a hurry.
    expect(looksLikeEmail("jane+store@gmail.com")).toBe(true);
    expect(looksLikeEmail("a.b.c@sub.domain.co.uk")).toBe(true);
    expect(looksLikeEmail("me@new-tld.marketing")).toBe(true);
    expect(looksLikeEmail("O'Brien@example.com")).toBe(true);
  });

  it("rejects what cannot be an address", () => {
    expect(looksLikeEmail("jane")).toBe(false);
    expect(looksLikeEmail("jane@")).toBe(false);
    expect(looksLikeEmail("jane@@gmail.com")).toBe(false);
    expect(looksLikeEmail("jane doe@gmail.com")).toBe(false);
    expect(looksLikeEmail("jane@gmail")).toBe(false);
    expect(looksLikeEmail("jane@gmail.c")).toBe(false); // truncated mid-typing
    expect(looksLikeEmail("jane@.com")).toBe(false);
  });
});

describe("suggestEmail", () => {
  it("catches the domain typos people actually make", () => {
    expect(suggestEmail("jane@gmial.com")).toBe("jane@gmail.com");
    expect(suggestEmail("jane@gmai.com")).toBe("jane@gmail.com");
    expect(suggestEmail("jane@hotmial.com")).toBe("jane@hotmail.com");
    expect(suggestEmail("jane@yahooo.com")).toBe("jane@yahoo.com");
    expect(suggestEmail("jane@outlok.com")).toBe("jane@outlook.com");
    expect(suggestEmail("jane@iclod.com")).toBe("jane@icloud.com");
  });

  it("catches truncated and slipped TLDs", () => {
    expect(suggestEmail("jane@gmail.co")).toBe("jane@gmail.com");
    expect(suggestEmail("jane@gmail.con")).toBe("jane@gmail.com");
    expect(suggestEmail("jane@yahoo.co")).toBe("jane@yahoo.com");
  });

  // The expensive failure mode is a false positive: telling someone their own
  // correct company address is wrong.
  it("stays quiet on addresses that are already right", () => {
    expect(suggestEmail("jane@gmail.com")).toBeNull();
    expect(suggestEmail("jane@yahoo.co.uk")).toBeNull();
    expect(suggestEmail("jane@greaterinside.com")).toBeNull();
    expect(suggestEmail("jane@some-tiny-startup.io")).toBeNull();
    expect(suggestEmail("jane@nhs.uk")).toBeNull();
  });

  it("does not guess when the domain is two or more edits away", () => {
    // "gmoil.co.uk" is not obviously gmail.com; guessing here would rewrite a
    // real address into someone else's.
    expect(suggestEmail("jane@qmoil.co.uk")).toBeNull();
  });

  it("preserves the local part exactly, including plus-addressing", () => {
    expect(suggestEmail("jane+store@gmial.com")).toBe("jane+store@gmail.com");
  });
});
