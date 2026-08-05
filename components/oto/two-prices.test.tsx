import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Offer } from "@/lib/types";

vi.mock("@/app/(store)/checkout/oto/actions", () => ({ acceptOtoAction: () => {} }));
const { OtoActions } = await import("@/components/oto/shell");

// Two prices for the same thing, both one click on a card already on file.

const offer = (over: Partial<Offer>): Offer =>
  ({
    id: "o1",
    key: "funnel-monthly",
    name: "Funnel App",
    grantType: "subscription",
    grantProductId: null,
    grantAppId: "a1",
    grantEntitlementKey: "funnel",
    altOfferId: null,
    billingType: "recurring",
    interval: "month",
    intervalCount: 1,
    trialDays: 7,
    priceCents: 2900,
    compareAtCents: null,
    currency: "usd",
    headline: "Funnel App",
    description: null,
    bullets: [],
    imageUrl: null,
    acceptLabel: "Yes, add Funnel App",
    declineLabel: "No thanks",
    ...over,
  }) as Offer;

const monthly = offer({});
const yearly = offer({ id: "o2", key: "funnel-yearly", interval: "year", priceCents: 19900 });

const view = (alt: Offer | null) => ({
  offer: monthly,
  altOffer: alt,
  token: "tok",
  chargeNowCents: 0,
  recurringNote: null,
});

const render = (alt: Offer | null) => renderToStaticMarkup(<OtoActions view={view(alt)} />);

describe("the second price", () => {
  it("is not there when the offer declares none", () => {
    const out = render(null);
    expect(out).not.toContain('name="choice"');
    expect(out.match(/<form/g)).toHaveLength(1);
  });

  it("appears as its own one-click form", () => {
    const out = render(yearly);
    expect(out.match(/<form/g)).toHaveLength(2);
    expect(out).toContain("$199 / year");
  });

  it("sends a side, never an offer id", () => {
    // The whole guard: a tampered form can pick the alternative it was shown
    // and nothing else, because the server resolves it through the offer row.
    const out = render(yearly);
    expect(out).toContain('name="choice" value="alt"');
    expect(out).not.toContain(yearly.id);
  });

  it("carries the same token as the first button", () => {
    const out = render(yearly);
    expect(out.match(/name="token" value="tok"/g)).toHaveLength(2);
  });

  it("works out what the year saves, rather than being told", () => {
    // 12 × $29 is $348; $199 is five whole months less. A typed number would
    // survive the next price change and start lying.
    expect(render(yearly)).toContain("5 months free");
  });

  it("says nothing about savings when there are none", () => {
    const dearer = offer({ id: "o3", interval: "year", priceCents: 40000 });
    expect(render(dearer)).not.toContain("free");
  });

  it("says nothing when the two are not monthly and yearly", () => {
    const weekly = offer({ id: "o4", interval: "week", priceCents: 900 });
    expect(render(weekly)).not.toContain("months free");
  });

  it("leads with the first price — the second is quieter", () => {
    const out = render(yearly);
    // The primary is filled; the alternative is outlined. A page with two equal
    // buttons has asked the reader to decide before it made a case.
    expect(out).toContain("bg-[#b0532f]");
    expect(out.split("choice")[1]).toContain("border");
  });

  it("takes its ink from the band rather than a fixed brand colour", () => {
    // This button lands on whichever band the section is painted. Terracotta on
    // the navy band is 2.0:1 — the only colour it can safely use is the one the
    // band already reads with.
    const alt = render(yearly).split("choice")[1];
    expect(alt).toContain("text-current");
    expect(alt).toContain("currentColor");
    expect(alt).not.toContain("#b0532f");
    expect(alt).not.toContain("text-white");
  });
});
