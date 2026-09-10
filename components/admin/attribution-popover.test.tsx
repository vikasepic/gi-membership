import { readFileSync } from "node:fs";
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

  // jsdom has no layout, so the popover's open state can't be rendered and
  // measured here — this is a source-level guard for a fact measured in a
  // real headless Chrome run against a production build, not a substitute
  // for having looked. At 1280px the popover sat left:1026 right:1314 while
  // the table's horizontal scroll container ended at right:1248, clipping
  // campaign, ad set, ad name and referrer — left-0 opened it past the
  // scroller. right-0 opens it back into the table instead. At 390px the
  // popover's right edge sat at x:273 while the scroller started at x:20 —
  // the full w-72 (288px) panel opened at left:-15, still 35px clipped past
  // the scroller's left edge even right-anchored. 15rem (240px) lands the
  // left edge at 33, inside the scroller with room to spare, and only below
  // `sm` — desktop and laptop keep the full w-72.
  it("anchors the popover to the pill's right edge, not its left, and caps its width below sm", () => {
    const src = readFileSync(new URL("./attribution-popover.tsx", import.meta.url), "utf8");
    const popoverClass = src.match(/role="dialog"[\s\S]*?className="([^"]+)"/)?.[1];
    expect(popoverClass).toContain("right-0");
    expect(popoverClass).not.toContain("left-0");
    expect(popoverClass).toContain("max-w-[15rem]");
    expect(popoverClass).toContain("sm:max-w-none");
  });
});
