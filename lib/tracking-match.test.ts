import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildMetaEvent, type PurchaseEvent } from "@/lib/tracking";
import { fbcFrom, nameParts, countryHash, hashed, matchIdentity } from "@/lib/tracking-fields";

/**
 * Everything Meta matches a conversion on.
 *
 * These all fail the same way: silently and expensively. A malformed fbc, a
 * missing fbp, an IP that never got populated — none of them error, none of
 * them show up in a log, and the only symptom is an attribution number that
 * feels low and a cost-per-acquisition nobody can explain. So each one is
 * pinned here rather than left to be noticed.
 */

const base: PurchaseEvent = {
  eventId: "Purchase.order-1",
  eventName: "Purchase",
  email: "Buyer@Example.COM",
  valueCents: 2700,
  currency: "usd",
  orderId: "order-1",
  clickIds: {},
  occurredAt: 1_700_000_000,
};

describe("the click identifiers", () => {
  it("builds fbc from an fbclid when no cookie survived", () => {
    expect(fbcFrom({ fbclid: "abc" }, 1_700_000_000_000)).toBe("fb.1.1700000000000.abc");
  });

  it("prefers the cookie, which carries the real click time", () => {
    // The pixel writes _fbc itself. Ours is a reconstruction and a guess at
    // the timestamp; Meta's is the truth.
    expect(fbcFrom({ fbclid: "abc", fbc: "fb.1.999.xyz" })).toBe("fb.1.999.xyz");
  });

  it("sends nothing rather than something malformed", () => {
    expect(fbcFrom({})).toBeUndefined();
    expect(buildMetaEvent(base).data[0].user_data).not.toHaveProperty("fbc");
  });

  it("passes fbp through untouched", () => {
    // It is Meta's own browser id. Hashing it would make it match nothing,
    // which looks identical to sending it correctly.
    const p = buildMetaEvent({ ...base, clickIds: { fbp: "fb.1.123.456" } });
    expect(p.data[0].user_data.fbp).toBe("fb.1.123.456");
  });
});

describe("who the buyer is", () => {
  it("hashes everything that identifies a person", () => {
    const p = buildMetaEvent({
      ...base,
      fullName: "Ada Byron Lovelace",
      country: "GB",
      userId: "user-9",
    });
    const raw = JSON.stringify(p);
    for (const secret of ["Buyer@Example.COM", "buyer@example.com", "Ada", "Lovelace", "user-9"]) {
      expect(raw, `${secret} must not travel in the clear`).not.toContain(secret);
    }
    expect(p.data[0].user_data.em).toEqual([hashed("buyer@example.com")]);
    expect(p.data[0].user_data.external_id).toEqual([hashed("user-9")]);
  });

  it("takes the first and last word of a name and drops the middle", () => {
    // A middle name in the `ln` field matches nobody, which is worse than
    // sending no last name at all.
    const { fn, ln } = nameParts("Ada Byron Lovelace");
    expect(fn).toBe(hashed("ada"));
    expect(ln).toBe(hashed("lovelace"));
    expect(nameParts("Cher")).toEqual({ fn: hashed("cher") });
    expect(nameParts("  ")).toEqual({});
  });

  it("refuses a country that is not two letters", () => {
    expect(countryHash("GB")).toBe(hashed("gb"));
    expect(countryHash("United Kingdom")).toBeUndefined();
    expect(countryHash(null)).toBeUndefined();
  });

  it("carries the request the conversion came from", () => {
    const p = buildMetaEvent({
      ...base,
      clientIp: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      sourceUrl: "https://grow.greaterinside.com/checkout",
    });
    // These were declared on the type and passed as undefined by every call
    // site, so the match rate was as low as it can be while still reporting.
    expect(p.data[0].user_data.client_ip_address).toBe("203.0.113.7");
    expect(p.data[0].user_data.client_user_agent).toBe("Mozilla/5.0");
    expect(p.data[0].event_source_url).toBe("https://grow.greaterinside.com/checkout");
  });

  it("omits a field it has no answer for, rather than sending it empty", () => {
    const u = buildMetaEvent(base).data[0].user_data as Record<string, unknown>;
    for (const k of ["fn", "ln", "country", "external_id", "fbp", "fbc", "client_ip_address"]) {
      expect(u, `${k} absent`).not.toHaveProperty(k);
    }
  });
});

describe("what was bought", () => {
  it("names the product on the server copy too", () => {
    // The browser copy always carried this. On ad-blocked traffic the server
    // copy is the only one that arrives, and it named nothing.
    const p = buildMetaEvent({ ...base, contentIds: ["prod-1"], contentName: "The Guide", numItems: 1 });
    expect(p.data[0].custom_data).toMatchObject({
      content_ids: ["prod-1"],
      content_type: "product",
      content_name: "The Guide",
      num_items: 1,
    });
  });

  it("still refuses to invent revenue", () => {
    const p = buildMetaEvent({ ...base, eventName: "Lead" });
    expect(p.data[0].custom_data).not.toHaveProperty("value");
    expect(p.data[0].custom_data).not.toHaveProperty("currency");
  });
});

describe("being able to test any of this", () => {
  it("names the test event code when one is set", () => {
    // Without it a server event cannot be seen in Events Manager's Test Events
    // tab at all — which is why the gaps above went unnoticed for so long.
    expect(buildMetaEvent(base, "TEST1234")).toMatchObject({ test_event_code: "TEST1234" });
    expect(buildMetaEvent(base)).not.toHaveProperty("test_event_code");
  });
});

describe("the upper funnel", () => {
  const relay = readFileSync("app/api/track/event/route.ts", "utf8");
  const analytics = readFileSync("components/analytics.tsx", "utf8");

  it("goes to Meta only, never to GA4", () => {
    // GA4 does not deduplicate and the browser already reported these to it. A
    // second copy would double every upper-funnel number by however much of
    // the traffic runs a blocker.
    expect(relay).toContain('only: ["meta"]');
  });

  it("refuses an event it was not told to relay", () => {
    // An open endpoint that forwards any name to Meta is one somebody else can
    // fill your pixel with.
    expect(relay).toContain("ALLOWED.has(event)");
    expect(relay).toContain("no-event-id");
  });

  it("takes the identity from the request, not the caller", () => {
    // A caller may say which event happened. It may not say whose it was.
    expect(relay).toContain("x-forwarded-for");
    expect(relay).toContain('h.get("user-agent")');
    expect(relay).toMatch(/from\("visitors"\)/);
  });

  it("survives the page it fires on being left", () => {
    // Two of these fire as the buyer navigates away — a checkout redirecting
    // to Stripe, a buy button. Without keepalive the browser cancels the
    // request on unload, exactly when the event matters most.
    expect(analytics).toContain("keepalive: true");
  });

  it("never hands the address to the pixel in the clear", () => {
    // Advanced matching sends whatever it is given. The email travels on the
    // relay, where the server hashes it.
    expect(analytics).toContain("serverOnly?: { email?: string | null }");
    expect(analytics).not.toMatch(/params\.email/);
  });
});

describe("a refusal from Meta", () => {
  const tracking = readFileSync("lib/tracking.ts", "utf8");

  it("is noticed", () => {
    // fetch resolves for any status, so a 400 counted as a successful send and
    // a malformed field could be discarded for months.
    expect(tracking).toContain("if (!res.ok)");
    expect(tracking).toContain('source: "tracking"');
  });
});

describe("the id both sides have to agree on", () => {
  // pixelMatch initialises the browser pixel with hashed(user.id) when signed
  // in and hashed(anon) otherwise. The server copy of an upper-funnel event
  // sent no external_id at all until 12 Sep 2026, so every pair carried the key
  // on one side only — Meta reported 44% External ID coverage on AddToCart.
  it("uses the anonymous cookie for a reader who is not signed in", () => {
    expect(matchIdentity(null, "anon-7", undefined)).toEqual({ userId: "anon-7", email: "" });
  });

  it("uses the account id once they are signed in, which is what the pixel switches to", () => {
    expect(matchIdentity({ id: "user-9", email: "a@b.test" }, "anon-7", undefined)).toEqual({
      userId: "user-9",
      email: "a@b.test",
    });
  });

  it("produces the SAME external_id the browser would send", () => {
    // The whole point. A different value on each side is worth no more than
    // sending nothing.
    const { userId } = matchIdentity(null, "anon-7", undefined);
    const p = buildMetaEvent({ ...base, userId });
    expect(p.data[0].user_data.external_id).toEqual([hashed("anon-7")]);
  });

  it("prefers a typed address over the account's, because checkout knows first", () => {
    expect(matchIdentity({ id: "u", email: "old@b.test" }, "a", "typed@b.test").email).toBe(
      "typed@b.test",
    );
  });

  it("sends no external_id when there is genuinely nothing to send", () => {
    const { userId } = matchIdentity(null, undefined, undefined);
    expect(userId).toBeUndefined();
    expect(buildMetaEvent({ ...base, userId }).data[0].user_data.external_id).toBeUndefined();
  });
});
