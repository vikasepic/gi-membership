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
  visitId: null,
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

describe("the open layout on an expanded order", () => {
  it("lays last touch and first touch out side by side, both named", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock
        layout="open"
        order={{
          ...base,
          utmLast: { utm_source: "meta", utm_campaign: "Spring Push", utm_adset: "LAL Buyers" },
          utmFirst: { utm_source: "instaparty", utm_campaign: "Winter B" },
          referrer: "https://l.facebook.com/l.php",
        }}
      />,
    );
    expect(out).toContain("Last touch");
    expect(out).toContain("First touch");
    expect(out).toContain("Spring Push");
    expect(out).toContain("instaparty");
  });

  it("links to the visit when the order has one", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock layout="open" order={{ ...base, visitId: "v-123", utmLast: { utm_source: "meta" } }} />,
    );
    expect(out).toContain("/admin/attribution/visits");
  });

  it("carries the order's own visit id on the link (I5), not the bare list page", () => {
    // The bare "/admin/attribution/visits" default page is the last 30 days,
    // 100 rows — an older order's visit is just not there. This has to
    // assert the id itself, not merely the path prefix: a bare link also
    // contains "/admin/attribution/visits" and would pass a weaker check.
    const out = renderToStaticMarkup(
      <AttributionBlock layout="open" order={{ ...base, visitId: "v-123", utmLast: { utm_source: "meta" } }} />,
    );
    expect(out).toContain("/admin/attribution/visits?visit=v-123");
  });

  it("does not draw the link when the order predates visit tracking", () => {
    const out = renderToStaticMarkup(<AttributionBlock layout="open" order={{ ...base, visitId: null, utmLast: { utm_source: "meta" } }} />);
    expect(out).not.toContain("/admin/attribution/visits");
  });

  it("still shows both columns and the visit link for a direct order with no UTM data and no referrer", () => {
    // The commonest order outside active ad spend: tracked (it has a visit)
    // but nothing to attribute it to. The shared "nothing at all" guard used
    // to fire before layout was even considered, hiding this entirely.
    const out = renderToStaticMarkup(
      <AttributionBlock layout="open" order={{ ...base, visitId: "v-777", utmLast: {}, utmFirst: {}, referrer: null }} />,
    );
    expect(out).toContain("Last touch");
    expect(out).toContain("First touch");
    expect(out).toContain("/admin/attribution/visits");
    // Both columns fall back to the literal "direct" span, not a blank column
    // — and not the unrelated "direct" the SourcePill label can also emit.
    expect(out.match(/>direct</g)?.length).toBe(2);
  });

  it("leaves the compact popover empty for that same direct order, so its behaviour is unchanged", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock order={{ ...base, visitId: "v-777", utmLast: {}, utmFirst: {}, referrer: null }} />,
    );
    expect(out).toBe("");
  });

  it("reads an untouched side as direct rather than vanishing, when the other side has labels", () => {
    const out = renderToStaticMarkup(
      <AttributionBlock
        layout="open"
        order={{ ...base, utmLast: { utm_source: "meta", utm_campaign: "Spring Push" }, utmFirst: {}, referrer: null }}
      />,
    );
    expect(out).toContain("Spring Push");
    // Exactly one side is empty here, so exactly one "direct" fallback span.
    expect(out.match(/>direct</g)?.length).toBe(1);
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
