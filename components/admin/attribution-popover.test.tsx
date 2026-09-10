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
          utmLast: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "A", utm_adset: "LAL 1%", utm_content: "Reel", utm_term: "t", utm_id: "1" },
          utmFirst: { utm_source: "ig", utm_campaign: "B" },
          referrer: "https://l.facebook.com/l.php",
        }}
      />,
    );
    for (const v of ["meta", "paid_social", "A", "LAL 1%", "Reel", "t", "1"]) expect(out).toContain(v);
    expect(out).toContain("First touch");
    expect(out).toContain("ig");
    expect(out).toContain("l.facebook.com/l.php");
  });

  it("does not repeat first touch when it is the same as last", () => {
    const same = { utm_source: "meta", utm_campaign: "A" };
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
