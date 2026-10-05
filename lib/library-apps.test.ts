import { describe, it, expect } from "vitest";
import { mergeAppRows, channelBadges, appStatus, shortDescription, appInitials, offerPriceLine, offerBlurb, moreItems } from "@/lib/library-apps";

/**
 * What one app card in the library says.
 *
 * Asked for 5 Oct 2026: members did not know where to go, Instagram-only
 * buyers missed that LinkedIn was not in their plan, and a member who bought
 * LinkedIn after Instagram got a second Content Engine card.
 */

const row = (over: Partial<Parameters<typeof mergeAppRows>[0][number]>) => ({
  appId: "ce",
  status: "active" as const,
  channels: [] as string[],
  offerId: "o1",
  description: null as string | null,
  subscriptionId: null as string | null,
  ...over,
});

describe("mergeAppRows", () => {
  it("one card per app: two purchases of Content Engine become one, with both channels", () => {
    const apps = mergeAppRows([
      row({ appId: "ce", status: "trialing", channels: ["linkedin"], offerId: "li", subscriptionId: "sub_li" }),
      row({ appId: "ce", status: "active", channels: ["instagram"], offerId: "ig", subscriptionId: "sub_ig" }),
    ]);
    expect(apps).toHaveLength(1);
    expect(apps[0].appId).toBe("ce");
    // In the store's own order, whatever order they were bought in.
    expect(apps[0].channels).toEqual(["instagram", "linkedin"]);
    expect(apps[0].subscriptionIds).toEqual(["sub_li", "sub_ig"]);
  });

  it("keeps different apps apart, in the order they first appear", () => {
    const apps = mergeAppRows([row({ appId: "funnel" }), row({ appId: "ce" }), row({ appId: "funnel" })]);
    expect(apps.map((a) => a.appId)).toEqual(["funnel", "ce"]);
  });

  it("says payment failed if any purchase behind the app has, before trial or active", () => {
    // A failed card is the thing that stops the app opening; it is what the
    // member needs to see first.
    expect(mergeAppRows([row({ status: "active" }), row({ status: "past_due" })])[0].status).toBe("past_due");
    expect(mergeAppRows([row({ status: "active" }), row({ status: "trialing" })])[0].status).toBe("trialing");
    expect(mergeAppRows([row({ status: "active" })])[0].status).toBe("active");
  });

  it("takes the first description any of its offers has", () => {
    expect(mergeAppRows([row({ description: null }), row({ description: "Write carousels." })])[0].description).toBe("Write carousels.");
  });
});

describe("channelBadges", () => {
  const add = { linkedin: { href: "/o/content-engine-linkedin", priceLabel: "$29 a month" } };

  it("every channel the app has, marked included or not, in the store's order", () => {
    expect(channelBadges(["instagram", "linkedin"], ["instagram"], add)).toEqual([
      { channel: "instagram", label: "Instagram", included: true, addHref: null, addText: null },
      {
        channel: "linkedin",
        label: "LinkedIn",
        included: false,
        addHref: "/o/content-engine-linkedin",
        addText: "Add LinkedIn to your plan for $29 a month",
      },
    ]);
  });

  it("both owned: both included, nothing to add", () => {
    const b = channelBadges(["instagram", "linkedin"], ["linkedin", "instagram"], add);
    expect(b.map((x) => [x.channel, x.included])).toEqual([["instagram", true], ["linkedin", true]]);
    expect(b.every((x) => x.addHref === null)).toBe(true);
  });

  it("a missing channel with no offer that sells it on its own is still shown, without a link", () => {
    expect(channelBadges(["instagram", "linkedin"], ["linkedin"], {})[0]).toEqual({
      channel: "instagram",
      label: "Instagram",
      included: false,
      addHref: null,
      addText: null,
    });
  });

  it("an app with no channels has no badges", () => {
    expect(channelBadges([], [], {})).toEqual([]);
  });
});

describe("appStatus", () => {
  const now = new Date("2026-10-05T10:00:00Z");

  it("a trial says when it ends", () => {
    expect(appStatus("trialing", { trialEndsAt: "2026-10-08T15:29:38.000Z", cancelsAt: null }, now)).toEqual({ tone: "trial", text: "Free trial · ends 8 Oct" });
  });

  it("a trial that won't convert says so", () => {
    expect(appStatus("trialing", { trialEndsAt: "2026-10-08T15:29:38.000Z", cancelsAt: "2026-10-08T15:29:38.000Z" }, now)).toEqual({ tone: "warn", text: "Free trial · ends 8 Oct, won't renew" });
  });

  it("an active plan, and one set to end", () => {
    expect(appStatus("active", { trialEndsAt: null, cancelsAt: null }, now)).toEqual({ tone: "ok", text: "Active" });
    expect(appStatus("active", { trialEndsAt: null, cancelsAt: "2026-10-30T15:29:38.000Z" }, now)).toEqual({ tone: "warn", text: "Active until 30 Oct" });
  });

  it("a failed payment says what to do", () => {
    expect(appStatus("past_due", null, now)).toEqual({ tone: "bad", text: "Payment failed · update your card" });
  });

  it("no subscription details (a comp) is simply active", () => {
    expect(appStatus("active", null, now)).toEqual({ tone: "ok", text: "Active" });
    expect(appStatus("trialing", null, now)).toEqual({ tone: "trial", text: "Free trial" });
  });
});

describe("shortDescription", () => {
  it("keeps the first part, before a dashed list", () => {
    expect(
      shortDescription("Get inspiration from leaders in your industry. Write carousels and reels in proven formats. - Check what's working and emulate it"),
    ).toBe("Get inspiration from leaders in your industry. Write carousels and reels in proven formats.");
  });

  it("stops at a sentence once it is long enough, rather than mid-word", () => {
    const long = "One sentence that runs on for a while to set things up. " + "Another sentence follows it. ".repeat(10);
    const out = shortDescription(long)!;
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(".")).toBe(true);
  });

  it("nothing to say is null", () => {
    expect(shortDescription(null)).toBeNull();
    expect(shortDescription("   ")).toBeNull();
  });
});

describe("appInitials", () => {
  it("two letters from the first two words", () => {
    expect(appInitials("Content Engine")).toBe("CE");
    expect(appInitials("Micro-Product Builder")).toBe("MP");
    expect(appInitials("Funnel App")).toBe("FA");
    expect(appInitials("Notes")).toBe("N");
  });
});

describe("offerPriceLine", () => {
  const offer = { billingType: "recurring" as const, interval: "month" as const, intervalCount: 1, trialDays: 7, priceCents: 2900, currency: "usd" };
  it("a trial says how long it is free, then the price", () => {
    expect(offerPriceLine(offer)).toBe("7 days free, then $29 a month");
  });
  it("a subscription without a trial", () => {
    expect(offerPriceLine({ ...offer, trialDays: null })).toBe("$29 a month");
    expect(offerPriceLine({ ...offer, trialDays: 0, interval: "year", priceCents: 19900 })).toBe("$199 a year");
  });
  it("every few months", () => {
    expect(offerPriceLine({ ...offer, trialDays: null, intervalCount: 3, priceCents: 7900 })).toBe("$79 every 3 months");
  });
  it("a one-time price", () => {
    expect(offerPriceLine({ ...offer, billingType: "one_time", interval: null, trialDays: null, priceCents: 4700 })).toBe("$47, one payment");
  });
});

describe("offerBlurb", () => {
  it("uses the headline when it reads as a line of copy", () => {
    expect(offerBlurb({ headline: "Build the entire low-ticket funnel in one sitting.", description: "A product outline." })).toBe(
      "Build the entire low-ticket funnel in one sitting.",
    );
  });

  it("skips a headline that is the page's browser title and falls back to the description", () => {
    // Two live offers carry "Name | Greater Inside" as their headline.
    expect(
      offerBlurb({
        headline: "Viral Hook Generator for Instagram & Social Media | Greater Inside",
        description: "Generate viral hooks for Instagram carousels, posts, and LinkedIn content in seconds.",
      }),
    ).toBe("Generate viral hooks for Instagram carousels, posts, and LinkedIn content in seconds.");
  });

  it("is null when there is nothing to say", () => {
    expect(offerBlurb({ headline: "Micro-Product Builder | Greater Inside", description: null })).toBeNull();
  });
});

describe("moreItems", () => {
  const offer = (over: Record<string, unknown> = {}) => ({
    id: "fa-offer", key: "funnel-builder", name: "Funnel App", headline: "Build the entire low-ticket funnel in one sitting.",
    description: "A product outline.", imageUrl: "https://cdn.test/funnel.webp", grantType: "subscription" as const,
    grantAppId: "funnel", grantProductId: null, grantChannels: [] as string[], billingType: "recurring" as const,
    interval: "month", intervalCount: 1, trialDays: 7, priceCents: 2900, currency: "usd", ...over,
  });
  const product = (over: Record<string, unknown> = {}) => ({
    id: "p-carousels", slug: "the-guide-to-viral-carousels", title: "The Guide to Viral Carousels",
    tagline: "150 hooks, 5 formats.", coverUrl: "https://cdn.test/carousels.webp", priceCents: 1900, currency: "usd", ...over,
  });
  const nobody = { productIds: new Set<string>(), appIds: new Set<string>(), appChannels: new Map<string, Set<string>>() };

  it("lists the store's apps, then its courses, each going to its sales page", () => {
    const items = moreItems({ offers: [offer()], products: [product()], owned: nobody, excludeAppIds: [] });
    expect(items.map((i) => [i.kind, i.name, i.href])).toEqual([
      ["app", "Funnel App", "/library/offer/fa-offer"],
      ["course", "The Guide to Viral Carousels", "/p/the-guide-to-viral-carousels"],
    ]);
    expect(items[0].priceLine).toBe("7 days free, then $29 a month");
    expect(items[1].priceLine).toBe("$19, one payment");
    expect(items[1].imageUrl).toBe("https://cdn.test/carousels.webp");
  });

  it("leaves out what the member owns, and an app already on their shelf", () => {
    const owned = { ...nobody, productIds: new Set(["p-carousels"]) };
    const items = moreItems({
      offers: [offer(), offer({ id: "ce-offer", name: "Content Engine", grantAppId: "ce" })],
      products: [product()],
      owned,
      excludeAppIds: ["ce"],
    });
    expect(items.map((i) => i.name)).toEqual(["Funnel App"]);
  });

  it("does not list a course twice when an offer on the store already sells it", () => {
    const items = moreItems({
      offers: [offer({ id: "dpv-offer", name: "Validator bundle", grantType: "product", grantAppId: null, grantProductId: "p-carousels" })],
      products: [product()],
      owned: nobody,
      excludeAppIds: [],
    });
    expect(items.map((i) => [i.kind, i.name])).toEqual([["course", "Validator bundle"]]);
  });
});
