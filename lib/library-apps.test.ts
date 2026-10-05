import { describe, it, expect } from "vitest";
import { mergeAppRows, channelBadges, appStatus, shortDescription, appInitials, offerPriceLine } from "@/lib/library-apps";

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
