import { afterEach, describe, it, expect } from "vitest";
import { sourceOf, isBot } from "@/lib/traffic-source";

describe("where a visit came from", () => {
  it("prefers the campaign somebody named over one we inferred", () => {
    // A UTM is a deliberate label; a referrer is a guess. When both are
    // present the deliberate one wins, or the advertiser's own naming is
    // silently overridden by ours.
    expect(sourceOf("?utm_campaign=launch-week&fbclid=abc", "https://facebook.com/")).toBe(
      "launch-week",
    );
  });

  it("reads a Meta click id as meta", () => {
    expect(sourceOf("?fbclid=IwcGRvZg", null)).toBe("meta");
  });

  it("reads a Google click id as google", () => {
    expect(sourceOf("?gclid=abc123", null)).toBe("google");
  });

  it("calls a visit with no referrer direct", () => {
    expect(sourceOf("", null)).toBe("direct");
    expect(sourceOf("", "")).toBe("direct");
  });

  it("calls anything else a referral", () => {
    expect(sourceOf("", "https://someblog.example/post")).toBe("referral");
  });

  const REAL_SITE = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = REAL_SITE;
  });

  it("does not count our own pages as a referral", () => {
    // Stated here rather than inherited from whichever machine runs the suite.
    process.env.NEXT_PUBLIC_SITE_URL = "https://grow.greaterinside.com";
    expect(sourceOf("", "https://grow.greaterinside.com/p/x")).toBe("direct");
  });

  it("survives a query string that is not valid", () => {
    // Never throws: this runs on a page that takes money.
    expect(sourceOf("?%%%", null)).toBe("direct");
  });

  it("caps a campaign name rather than storing whatever arrives", () => {
    // The value is attacker-controlled — it is a query parameter.
    expect(sourceOf(`?utm_campaign=${"x".repeat(200)}`, null)).toHaveLength(60);
  });

  it("still accepts a normal campaign name", () => {
    expect(sourceOf("?utm_campaign=spring-sale.v2", null)).toBe("spring-sale.v2");
  });

  it("rejects an email address as a campaign and falls through instead", () => {
    // `source` is the one column that could carry an identifier. Several ESPs
    // default to `utm_campaign=<recipient email>`, and that must never land
    // in the database, malicious sender or not.
    expect(sourceOf("?utm_campaign=jane@example.com&fbclid=abc", null)).toBe("meta");
    expect(sourceOf("?utm_campaign=jane@example.com", null)).toBe("direct");
  });

  it("rejects a campaign with spaces or an @ in it", () => {
    expect(sourceOf("?utm_campaign=hello world", null)).toBe("direct");
    expect(sourceOf("?utm_campaign=a@b", null)).toBe("direct");
  });
});

describe("obvious robots", () => {
  it("spots the common ones", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0",
      "HeadlessChrome/127.0.0.0",
      "python-requests/2.31",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });

  it("leaves a real browser alone", () => {
    expect(
      isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/127.0"),
    ).toBe(false);
  });

  it("treats a missing user agent as a bot", () => {
    // Every real browser sends one. Something that does not is not a person,
    // and counting it inflates the only number this feature exists to give.
    expect(isBot(null)).toBe(true);
    expect(isBot("")).toBe(true);
  });
});
