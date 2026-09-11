// lib/visit-fields.test.ts
import { describe, it, expect } from "vitest";
import {
  deviceOf, browserOf, osOf, sanitizeQuery, foreignReferrer, hashIp, clientIpOf,
} from "@/lib/visit-fields";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const LINUX_FF = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("deviceOf", () => {
  it("calls a phone a phone and a tablet a tablet", () => {
    expect(deviceOf(IPHONE)).toBe("phone");
    expect(deviceOf(PIXEL)).toBe("phone");
    expect(deviceOf(IPAD)).toBe("tablet");
  });
  it("calls everything else desktop, including nothing at all", () => {
    expect(deviceOf(MAC_CHROME)).toBe("desktop");
    expect(deviceOf(WIN_EDGE)).toBe("desktop");
    expect(deviceOf(null)).toBe("desktop");
    expect(deviceOf("")).toBe("desktop");
  });
  it("does not call an Android tablet a phone", () => {
    // Android tablets omit "Mobile"; that absence is the only signal there is.
    expect(deviceOf("Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("tablet");
  });
});

describe("browserOf", () => {
  it("puts Edge and Samsung before Chrome, because both claim to be Chrome", () => {
    expect(browserOf(WIN_EDGE)).toBe("Edge");
    expect(browserOf(SAMSUNG)).toBe("Samsung Internet");
    expect(browserOf(MAC_CHROME)).toBe("Chrome");
  });
  it("puts Chrome before Safari, because Chrome claims to be Safari", () => {
    expect(browserOf(PIXEL)).toBe("Chrome");
    expect(browserOf(IPHONE)).toBe("Safari");
  });
  it("reads Firefox, and gives up honestly", () => {
    expect(browserOf(LINUX_FF)).toBe("Firefox");
    expect(browserOf("curl/8.4.0")).toBe("Other");
    expect(browserOf(null)).toBe("Other");
  });
  it("reads mobile Edge, which sends EdgA/ or EdgiOS/ instead of Edg/", () => {
    const ANDROID_EDGE = "Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.116 Mobile Safari/537.36 EdgA/46.3.4.5155";
    const IOS_EDGE = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 EdgiOS/46.3.14 Mobile/15E148 Safari/604.1";
    expect(browserOf(ANDROID_EDGE)).toBe("Edge");
    expect(browserOf(IOS_EDGE)).toBe("Edge");
  });
});

describe("osOf", () => {
  it("reads each family", () => {
    expect(osOf(IPHONE)).toBe("iOS");
    expect(osOf(IPAD)).toBe("iOS");
    expect(osOf(PIXEL)).toBe("Android");
    expect(osOf(MAC_CHROME)).toBe("macOS");
    expect(osOf(WIN_EDGE)).toBe("Windows");
    expect(osOf(LINUX_FF)).toBe("Linux");
    expect(osOf(null)).toBe("Other");
  });
  it("does not read an Android device as Linux, though it says Linux", () => {
    expect(osOf(PIXEL)).not.toBe("Linux");
  });
});

describe("sanitizeQuery", () => {
  it("keeps the whole query, click ids included — it is the link the ad used", () => {
    expect(sanitizeQuery("?utm_source=meta&fbclid=IwZXh0bgNhZW0")).toBe("utm_source=meta&fbclid=IwZXh0bgNhZW0");
  });
  it("drops a parameter whose value names a person", () => {
    expect(sanitizeQuery("?utm_campaign=jane@example.com&utm_source=mail")).toBe("utm_source=mail");
  });
  it("returns null for nothing at all", () => {
    expect(sanitizeQuery("")).toBeNull();
    expect(sanitizeQuery("?")).toBeNull();
    expect(sanitizeQuery(null)).toBeNull();
    expect(sanitizeQuery("?email=a@b.com")).toBeNull();
  });
  it("caps at 500 characters and never throws on rubbish", () => {
    expect(sanitizeQuery(`?x=${"y".repeat(900)}`)!.length).toBe(500);
    expect(() => sanitizeQuery("?%E0%A4%A")).not.toThrow();
  });
  it("keeps the query verbatim rather than re-encoding it through URLSearchParams", () => {
    expect(sanitizeQuery("?fbclid=Iw|abc")).toBe("fbclid=Iw|abc");
    expect(sanitizeQuery("?q=a%20b")).toBe("q=a%20b");
    expect(sanitizeQuery("?q=a~b")).toBe("q=a~b");
    expect(sanitizeQuery("?q=(paren)")).toBe("q=(paren)");
  });
  it("still drops a value naming a person even when it arrives percent-encoded", () => {
    expect(sanitizeQuery("?utm_campaign=jane%40example.com&utm_source=mail")).toBe("utm_source=mail");
  });
  it("keeps a value containing = intact, rather than splitting on every =", () => {
    expect(sanitizeQuery("?token=a=b=c")).toBe("token=a=b=c");
  });
});

describe("foreignReferrer", () => {
  const SITE = "https://grow.greaterinside.com";
  it("keeps a foreign referrer whole, query and all, with its host", () => {
    expect(foreignReferrer("https://l.facebook.com/l.php?u=abc&h=def", SITE)).toEqual({
      url: "https://l.facebook.com/l.php?u=abc&h=def",
      host: "l.facebook.com",
    });
  });
  it("ignores our own pages — an internal move is not a referral", () => {
    expect(foreignReferrer(`${SITE}/p/x`, SITE)).toBeNull();
  });
  it("drops one that names a person, and anything unparseable", () => {
    expect(foreignReferrer("https://mail.example/r?to=jane@example.com", SITE)).toBeNull();
    expect(foreignReferrer("not a url", SITE)).toBeNull();
    expect(foreignReferrer(null, SITE)).toBeNull();
    expect(foreignReferrer("   ", SITE)).toBeNull();
  });
  it("caps the url at 500 characters", () => {
    const r = foreignReferrer(`https://a.test/${"p".repeat(900)}`, SITE)!;
    expect(r.url.length).toBe(500);
    expect(r.host).toBe("a.test");
  });
  it("keeps a fediverse profile referral — the @ guard is for the query, not the path", () => {
    expect(foreignReferrer("https://mastodon.social/@someone", SITE)).toEqual({
      url: "https://mastodon.social/@someone",
      host: "mastodon.social",
    });
    expect(foreignReferrer("https://mastodon.social/@someone?ref=jane@example.com", SITE)).toBeNull();
  });
});

describe("hashIp", () => {
  it("is stable, salted, and never the address", () => {
    const a = hashIp("203.0.113.9", "pepper")!;
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(hashIp("203.0.113.9", "pepper"));
    expect(a).not.toBe(hashIp("203.0.113.9", "other-pepper"));
    expect(a).not.toContain("203.0.113.9");
  });
  it("returns null rather than falling back to a raw address", () => {
    expect(hashIp("203.0.113.9", undefined)).toBeNull();
    expect(hashIp("203.0.113.9", "")).toBeNull();
    expect(hashIp(null, "pepper")).toBeNull();
  });
});

describe("clientIpOf", () => {
  it("takes the first entry of the forwarded list, which is the client", () => {
    expect(clientIpOf("203.0.113.9, 10.0.0.1, 10.0.0.2", null)).toBe("203.0.113.9");
  });
  it("falls back to x-real-ip, then to nothing", () => {
    expect(clientIpOf(null, "198.51.100.4")).toBe("198.51.100.4");
    expect(clientIpOf(null, null)).toBeNull();
    expect(clientIpOf("  ", "  ")).toBeNull();
  });
});
