import { afterEach, describe, it, expect } from "vitest";
import { sourceOf, isBot, sourceOfOrder } from "@/lib/traffic-source";

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

  it("slugifies a campaign name written for humans", () => {
    // What Meta's {{campaign.name}} actually expands to. Refusing it sent
    // every campaign to the `meta` bucket instead, which looks like working
    // tracking and answers none of the questions it was built for.
    expect(sourceOf("?utm_campaign=AJ | Product Validator | Sales&fbclid=abc", null)).toBe(
      "aj-product-validator-sales",
    );
    expect(sourceOf("?utm_campaign=hello world", null)).toBe("hello-world");
  });

  it("files one campaign under one name however it was typed", () => {
    // Case is not a distinction anybody means. Two spellings of one campaign
    // would otherwise be two rows and two lines on the funnel.
    const each = ["Spring Sale", "spring sale", "SPRING  SALE"].map((c) =>
      sourceOf(`?utm_campaign=${c}`, null),
    );
    expect(new Set(each)).toEqual(new Set(["spring-sale"]));
  });

  it("still refuses an email, which slugifying would hide rather than remove", () => {
    // jane@example.com would slugify to jane-example-com — no longer matching
    // the old charset rule, and still naming a person. The @ has to be
    // refused BEFORE any cleaning, or this guard quietly stops working.
    expect(sourceOf("?utm_campaign=a@b", null)).toBe("direct");
    expect(sourceOf("?utm_campaign=Jane Doe <jane@example.com>", null)).toBe("direct");
  });

  it("falls through when there is nothing left after cleaning", () => {
    expect(sourceOf("?utm_campaign=---", null)).toBe("direct");
    expect(sourceOf("?utm_campaign=%20%20", null)).toBe("direct");
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

describe("where an order came from", () => {
  it("buckets by the campaign, the same slug a view gets", () => {
    const search = "?utm_campaign=AJ%20%7C%20LAL%20%7C%20Book%20Writer&utm_source=meta";
    expect(sourceOfOrder({ utm_campaign: "AJ | LAL | Book Writer", utm_source: "meta" }, null)).toBe(sourceOf(search, null));
    expect(sourceOfOrder({ utm_campaign: "AJ | LAL | Book Writer" }, null)).toBe("aj-lal-book-writer");
  });

  it("falls back to the source, with Meta's and Google's names folded", () => {
    for (const s of ["fb", "ig", "meta", "facebook", "instagram", "Meta"]) expect(sourceOfOrder({ utm_source: s }, null)).toBe("meta");
    for (const s of ["google", "adwords"]) expect(sourceOfOrder({ utm_source: s }, null)).toBe("google");
    expect(sourceOfOrder({ utm_source: "Newsletter Weekly" }, null)).toBe("newsletter-weekly");
  });

  it("refuses a campaign that names a person and uses the source instead", () => {
    expect(sourceOfOrder({ utm_campaign: "jane@example.com", utm_source: "mail" }, null)).toBe("mail");
  });

  it("calls a foreign referrer a referral and nothing at all direct", () => {
    expect(sourceOfOrder({}, "https://someblog.example/post")).toBe("referral");
    expect(sourceOfOrder({}, `${process.env.NEXT_PUBLIC_SITE_URL}/p/x`)).toBe("direct");
    expect(sourceOfOrder({}, null)).toBe("direct");
    expect(sourceOfOrder(null, undefined)).toBe("direct");
  });
});

describe("a view and the order it produces land in the same bucket", () => {
  // The whole point of a per-source Bought column is that a VIEW and the
  // SALE it produced are counted under the same name. `sourceOf` (views) and
  // `sourceOfOrder` (orders) share one internal ranking now, but a shared
  // implementation can still be miscalled from either side — these pin the
  // outward behaviour, not the internals, so a future edit that reintroduces
  // a difference fails here first.

  it("agrees when only utm_source names a channel — no campaign, no click id", () => {
    // This was the actual defect: a bare `?utm_source=newsletter` link
    // bucketed its view as direct/referral and its sale as "newsletter".
    expect(sourceOf("?utm_source=newsletter", null)).toBe(
      sourceOfOrder({ utm_source: "newsletter" }, null),
    );
    expect(sourceOf("?utm_source=newsletter", null)).toBe("newsletter");
  });

  it("agrees when utm_source is a Meta name with no campaign — both fold to meta", () => {
    expect(sourceOf("?utm_source=fb", null)).toBe(sourceOfOrder({ utm_source: "fb" }, null));
    expect(sourceOf("?utm_source=fb", null)).toBe("meta");
  });

  it("agrees when a campaign and a source are both present — the campaign wins on both", () => {
    expect(sourceOf("?utm_campaign=X&utm_source=newsletter", null)).toBe(
      sourceOfOrder({ utm_campaign: "X", utm_source: "newsletter" }, null),
    );
  });

  it("agrees when utm_source is an email address — refused by campaignSlug on both", () => {
    expect(sourceOf("?utm_source=jane@example.com", null)).toBe(
      sourceOfOrder({ utm_source: "jane@example.com" }, null),
    );
  });

  it("agrees on a foreign referrer with no labels at all", () => {
    expect(sourceOf("", "https://someblog.example/post")).toBe(
      sourceOfOrder({}, "https://someblog.example/post"),
    );
    expect(sourceOf("", "https://someblog.example/post")).toBe("referral");
  });

  it("agrees on no labels and no referrer", () => {
    expect(sourceOf("", null)).toBe(sourceOfOrder({}, null));
    expect(sourceOf("", null)).toBe("direct");
  });
});
