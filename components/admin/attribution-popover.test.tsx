import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AttributionBlock, SourcePill } from "@/components/admin/attribution-popover";
import type { OrderRow } from "@/lib/orders";

const base: OrderRow = {
  id: "o1",
  email: "b@t.com",
  buyerName: null,
  status: "paid",
  currency: "usd",
  totalCents: 100,
  taxCents: null,
  buyerCountry: null,
  stripePaymentIntentId: null,
  livemode: true,
  createdAt: "2026-09-10T00:00:00Z",
  items: [],
  utmFirst: {},
  utmLast: {},
  referrer: null,
};

describe("AttributionBlock", () => {
  it("lists every last-touch label, first touch only when it differs, and the referrer", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock
        order={{
          ...base,
          utmLast: {
            utm_source: "meta",
            utm_medium: "paid_social",
            utm_campaign: "Spring Push",
            utm_adset: "LAL 1%",
            utm_content: "Reel",
            utm_term: "brandterm",
            utm_id: "camp-42",
          },
          utmFirst: { utm_source: "instaparty", utm_campaign: "Winter B" },
          referrer: "https://l.facebook.com/l.php",
        }}
      />,
    );
    // Every value here must be one that genuinely fails if its label stops
    // rendering — "A" collided with "Ad"/"Ad set" (utm_adset/utm_content
    // labels), "t" with the surrounding markup's own text, "1" with a
    // Tailwind class fragment. These replacements can't collide with markup.
    for (const v of ["meta", "paid_social", "Spring Push", "LAL 1%", "Reel", "brandterm", "camp-42"]) expect(out).toContain(v);
    expect(out).toContain("First touch");
    // "ig" was a substring of "Campaign" — the label the last-touch block
    // renders unconditionally — so it passed even with the whole first-touch
    // section deleted. "instaparty"/"Winter B" can't collide with markup.
    expect(out).toContain("instaparty");
    expect(out).toContain("Winter B");
    expect(out).toContain("l.facebook.com/l.php");
  });

  it("does not repeat first touch when it is the same as last", () => {
    const same = { utm_source: "meta", utm_campaign: "Fall Reset" };
    const out = renderToStaticMarkup(<AttributionBlock order={{ ...base, utmLast: same, utmFirst: same }} />);
    expect(out).not.toContain("First touch");
  });

  it("says so when there is nothing but a referrer, and renders nothing when there is nothing at all", () => {
    expect(renderToStaticMarkup(<AttributionBlock order={{ ...base, referrer: "https://someblog.example/post" }} />)).toContain("someblog.example");
    expect(renderToStaticMarkup(<AttributionBlock order={base} />)).toBe("");
  });
});

describe("SourcePill", () => {
  it("reads source · medium, or the source alone, or direct", () => {
    expect(renderToStaticMarkup(<SourcePill order={{ ...base, utmLast: { utm_source: "meta", utm_medium: "paid_social" } }} />)).toContain("meta · paid_social");
    expect(renderToStaticMarkup(<SourcePill order={{ ...base, utmLast: { utm_source: "meta" } }} />)).toContain("meta");
    expect(renderToStaticMarkup(<SourcePill order={base} />)).toContain("direct");
  });

  it("is a button, so a phone can open it", () => {
    expect(renderToStaticMarkup(<SourcePill order={base} />)).toMatch(/<button[^>]*type="button"/);
  });
});
