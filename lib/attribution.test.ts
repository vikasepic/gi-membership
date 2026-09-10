// lib/attribution.test.ts
import { describe, it, expect } from "vitest";
import {
  parseLabels,
  landingReferrer,
  parseCookie,
  mergeAttribution,
  serializeCookie,
  attributionOf,
  attributionFromCookie,
  stripeAttributionMetadata,
  attributionFromMetadata,
  orderAttributionColumns,
  EMPTY_ATTRIBUTION,
} from "@/lib/attribution";

const META = "?utm_source=meta&utm_medium=paid_social&utm_campaign=AJ+%7C+LAL+%7C+Book+Writer&utm_adset=LAL+1%25&utm_content=Reel+3&utm_term=120250834047950282&utm_id=120250833683450282&fbclid=IwZX";

describe("parseLabels", () => {
  it("keeps the seven keys and nothing else", () => {
    const l = parseLabels(META);
    expect(l).toEqual({
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_campaign: "AJ | LAL | Book Writer",
      utm_adset: "LAL 1%",
      utm_content: "Reel 3",
      utm_term: "120250834047950282",
      utm_id: "120250833683450282",
    });
    expect("fbclid" in l).toBe(false);
  });

  it("preserves case: the ads team matches on what they typed", () => {
    expect(parseLabels("?utm_campaign=Launch+Week").utm_campaign).toBe("Launch Week");
  });

  it("drops a value with an @ — a per-recipient link names a person", () => {
    expect(parseLabels("?utm_campaign=jane@example.com&utm_source=mail")).toEqual({ utm_source: "mail" });
  });

  it("drops empty values and trims", () => {
    expect(parseLabels("?utm_source=&utm_medium=+cpc+")).toEqual({ utm_medium: "cpc" });
  });

  it("cuts a value at 120 characters", () => {
    const long = "x".repeat(200);
    expect(parseLabels(`?utm_content=${long}`).utm_content).toHaveLength(120);
  });

  it("returns nothing for no query, and never throws on garbage", () => {
    expect(parseLabels("")).toEqual({});
    expect(parseLabels("?%E0%A4%A")).toEqual({});
  });
});

describe("landingReferrer", () => {
  it("keeps origin and path from a foreign host, never the query", () => {
    expect(landingReferrer("https://l.facebook.com/l.php?u=abc&h=def", "https://grow.greaterinside.com")).toBe(
      "https://l.facebook.com/l.php",
    );
  });

  it("ignores our own pages", () => {
    expect(landingReferrer("https://grow.greaterinside.com/p/x", "https://grow.greaterinside.com")).toBeNull();
  });

  it("ignores nothing, blanks and unparseable strings", () => {
    expect(landingReferrer(null, "https://x.test")).toBeNull();
    expect(landingReferrer("   ", "https://x.test")).toBeNull();
    expect(landingReferrer("not a url", "https://x.test")).toBeNull();
  });

  it("cuts at 200 characters", () => {
    const r = landingReferrer(`https://a.test/${"p".repeat(400)}`, "https://x.test")!;
    expect(r).toHaveLength(200);
  });
});

describe("parseCookie", () => {
  it("reads a stored record back", () => {
    const raw = serializeCookie({ f: { utm_source: "ig" }, l: { utm_source: "meta" }, fa: "2026-09-01T00:00:00.000Z", la: "2026-09-10T00:00:00.000Z", r: "https://l.facebook.com/l.php" });
    expect(parseCookie(raw)).toEqual({ f: { utm_source: "ig" }, l: { utm_source: "meta" }, fa: "2026-09-01T00:00:00.000Z", la: "2026-09-10T00:00:00.000Z", r: "https://l.facebook.com/l.php" });
  });

  it("treats garbage, arrays and non-objects as absent", () => {
    expect(parseCookie("not json")).toBeNull();
    expect(parseCookie("[1,2]")).toBeNull();
    expect(parseCookie("42")).toBeNull();
    expect(parseCookie("")).toBeNull();
    expect(parseCookie(undefined)).toBeNull();
  });

  it("ignores keys it does not know and non-string values", () => {
    expect(parseCookie('{"f":{"utm_source":"meta","evil":"x","utm_medium":7},"z":1}')).toEqual({
      f: { utm_source: "meta" },
      l: undefined,
      fa: undefined,
      la: undefined,
      r: undefined,
    });
  });
});

describe("mergeAttribution", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const later = new Date("2026-09-11T12:00:00.000Z");
  const meta = { utm_source: "meta", utm_campaign: "A" };
  const ig = { utm_source: "ig", utm_campaign: "B" };

  it("sets first and last to the same set on first sight", () => {
    expect(mergeAttribution(null, meta, "https://l.facebook.com/l.php", now)).toEqual({
      f: meta,
      l: meta,
      fa: now.toISOString(),
      la: now.toISOString(),
      r: "https://l.facebook.com/l.php",
    });
  });

  it("replaces only last on a later, different set", () => {
    const first = mergeAttribution(null, meta, "https://l.facebook.com/l.php", now)!;
    expect(mergeAttribution(first, ig, "https://instagram.com/", later)).toEqual({
      ...first,
      l: ig,
      la: later.toISOString(),
    });
  });

  it("writes nothing when the same set arrives again", () => {
    const first = mergeAttribution(null, meta, null, now)!;
    expect(mergeAttribution(first, meta, null, later)).toBeNull();
  });

  it("writes a referrer-only record for a foreign landing with no labels", () => {
    expect(mergeAttribution(null, {}, "https://someblog.example/post", now)).toEqual({ r: "https://someblog.example/post" });
  });

  it("keeps a stored referrer when labels arrive later, and fills first from them", () => {
    const refOnly = { r: "https://someblog.example/post" };
    expect(mergeAttribution(refOnly, meta, "https://l.facebook.com/l.php", later)).toEqual({
      f: meta,
      l: meta,
      fa: later.toISOString(),
      la: later.toISOString(),
      r: "https://someblog.example/post",
    });
  });

  it("writes nothing on a plain request with an existing cookie", () => {
    const first = mergeAttribution(null, meta, null, now)!;
    expect(mergeAttribution(first, {}, "https://someblog.example/post", later)).toBeNull();
    expect(mergeAttribution({ r: "x" }, {}, null, later)).toBeNull();
  });

  it("writes nothing for a plain request with no cookie and our own referrer", () => {
    expect(mergeAttribution(null, {}, null, now)).toBeNull();
  });
});

describe("attributionOf / attributionFromCookie", () => {
  it("is empty for no cookie", () => {
    expect(attributionOf(null)).toEqual(EMPTY_ATTRIBUTION);
    expect(attributionFromCookie(undefined)).toEqual({ first: {}, last: {}, referrer: null });
  });

  it("reads all three parts", () => {
    const raw = serializeCookie({ f: { utm_source: "ig" }, l: { utm_source: "meta" }, r: "https://a.test/" });
    expect(attributionFromCookie(raw)).toEqual({ first: { utm_source: "ig" }, last: { utm_source: "meta" }, referrer: "https://a.test/" });
  });
});

describe("stripeAttributionMetadata", () => {
  it("emits last as utm_*, first as first_utm_*, and the referrer", () => {
    expect(
      stripeAttributionMetadata({
        first: { utm_source: "ig", utm_campaign: "B" },
        last: { utm_source: "meta", utm_medium: "paid_social", utm_adset: "LAL 1%" },
        referrer: "https://l.facebook.com/l.php",
      }),
    ).toEqual({
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_adset: "LAL 1%",
      first_utm_source: "ig",
      first_utm_campaign: "B",
      referrer: "https://l.facebook.com/l.php",
    });
  });

  it("emits nothing for an organic sale", () => {
    expect(stripeAttributionMetadata(EMPTY_ATTRIBUTION)).toEqual({});
    expect(stripeAttributionMetadata(null)).toEqual({});
    expect(stripeAttributionMetadata(undefined)).toEqual({});
  });

  it("round-trips through attributionFromMetadata", () => {
    const a = { first: { utm_source: "ig" }, last: { utm_source: "meta", utm_id: "1" }, referrer: "https://a.test/b" };
    expect(attributionFromMetadata({ store_created: "true", ...stripeAttributionMetadata(a) })).toEqual(a);
    expect(attributionFromMetadata({ store_created: "true" })).toEqual(EMPTY_ATTRIBUTION);
    expect(attributionFromMetadata(null)).toEqual(EMPTY_ATTRIBUTION);
  });
});

describe("orderAttributionColumns", () => {
  it("shapes the three columns, empty objects and null when there is nothing", () => {
    expect(orderAttributionColumns(null)).toEqual({ utm_first: {}, utm_last: {}, referrer: null });
    expect(orderAttributionColumns({ first: { utm_source: "a" }, last: { utm_source: "b" }, referrer: "https://r.test/" })).toEqual({
      utm_first: { utm_source: "a" },
      utm_last: { utm_source: "b" },
      referrer: "https://r.test/",
    });
  });
});
