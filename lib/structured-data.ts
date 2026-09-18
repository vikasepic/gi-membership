import type { Settings } from "@/lib/settings-schema";
import type { Product, Offer } from "@/lib/types";
import { publicCoverUrl } from "@/lib/media-url";

/**
 * What the storefront says about itself to a machine.
 *
 * One JSON-LD graph on the home page: who the business is, what the site is,
 * what is for sale and at what price, and the questions the page already
 * answers. A search engine reads it for rich results; an answer engine reads
 * it for the facts it will repeat. Everything in it is derived from the same
 * rows the page draws, so it cannot say a price the page does not.
 *
 * Pure. The page hands in what it has already loaded.
 */

export type SellableLine = {
  name: string;
  description: string | null;
  url: string;
  image: string | null;
  priceCents: number;
  currency: string;
  /** "month", "year" — a subscription. Null is a one-off. */
  interval: string | null;
};

export type Faq = { q: string; a: string };

export function productLine(p: Product, base: string, image: string | null): SellableLine {
  return {
    name: p.title,
    description: p.tagline || p.description || null,
    url: `${base}/p/${p.slug}`,
    image,
    priceCents: p.priceCents,
    currency: p.currency,
    interval: null,
  };
}

export function offerLine(o: Offer, base: string, href: string): SellableLine {
  // The offer's NAME, not its headline: three Content Engine channels share
  // one headline, and a reader given three identical names cannot tell
  // which is which. The headline becomes the description, which is what a
  // headline is.
  return {
    name: o.name,
    description: o.headline && o.headline !== o.name ? o.headline : o.description,
    url: `${base}${href}`,
    image: o.imageUrl,
    priceCents: o.priceCents,
    currency: o.currency,
    interval: o.interval,
  };
}

const major = (cents: number) => (Math.round(cents) / 100).toFixed(2);

export function homeJsonLd(input: {
  settings: Settings;
  base: string;
  lines: SellableLine[];
  faqs: Faq[];
}): Record<string, unknown> {
  const { settings: s, base, lines, faqs } = input;
  const org = `${base}/#organization`;
  const site = `${base}/#website`;
  const logo = publicCoverUrl(s.logoPath || null);
  const image = publicCoverUrl(s.shareImagePath || null);
  const sameAs = [s.socialInstagram, s.socialYoutube, s.socialX, s.socialLinkedin].filter(Boolean);
  const description = s.metaDescription || s.tagline || undefined;

  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": org,
      name: s.legalEntity || s.name,
      url: base,
      ...(logo ? { logo } : {}),
      ...(s.contactEmail ? { email: s.contactEmail } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      "@type": "WebSite",
      "@id": site,
      name: s.name,
      url: base,
      publisher: { "@id": org },
    },
    {
      "@type": "WebPage",
      "@id": `${base}/`,
      url: `${base}/`,
      name: s.metaTitle || s.name,
      ...(description ? { description } : {}),
      isPartOf: { "@id": site },
      about: { "@id": org },
      ...(image ? { primaryImageOfPage: { "@type": "ImageObject", url: image } } : {}),
    },
  ];

  if (lines.length > 0) {
    graph.push({
      "@type": "ItemList",
      "@id": `${base}/#catalogue`,
      name: `What ${s.name} sells`,
      itemListElement: lines.map((l, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@type": "Product", ...productNode(l, org) },
      })),
    });
  }

  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${base}/#faq`,
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * One thing for sale, as its own page says it.
 *
 * The product with its offer at the page's price, the trail back to the
 * store, and the questions the page's FAQ block answers. The business is
 * named the same way the home page names it, so the two graphs describe one
 * seller rather than two that happen to share a name.
 */
export function pageJsonLd(input: {
  settings: Settings;
  base: string;
  line: SellableLine;
  faqs: Faq[];
}): Record<string, unknown> {
  const { settings: s, base, line: l, faqs } = input;
  const org = `${base}/#organization`;
  const logo = publicCoverUrl(s.logoPath || null);
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": org,
      name: s.legalEntity || s.name,
      url: base,
      ...(logo ? { logo } : {}),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: s.name, item: `${base}/` },
        { "@type": "ListItem", position: 2, name: l.name, item: l.url },
      ],
    },
    { "@type": "Product", "@id": `${l.url}#product`, ...productNode(l, org) },
  ];
  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** A Product node's fields, shared by the home list and a page of its own. */
function productNode(l: SellableLine, org: string): Record<string, unknown> {
  return {
    name: l.name,
    ...(l.description ? { description: l.description } : {}),
    url: l.url,
    ...(l.image ? { image: l.image } : {}),
    brand: { "@id": org },
    offers: {
      "@type": "Offer",
      url: l.url,
      price: major(l.priceCents),
      priceCurrency: l.currency.toUpperCase(),
      availability: "https://schema.org/InStock",
      seller: { "@id": org },
      // A subscription says so. "per month" is the one fact a reader
      // repeating the price must not drop.
      ...(l.interval
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: major(l.priceCents),
              priceCurrency: l.currency.toUpperCase(),
              billingDuration: 1,
              billingIncrement: 1,
              unitCode: l.interval === "year" ? "ANN" : l.interval === "week" ? "WEE" : l.interval === "day" ? "DAY" : "MON",
            },
          }
        : {}),
    },
  };
}

/**
 * The same facts as a page a language model reads first.
 *
 * llms.txt: a short markdown file at the site root naming what this is and
 * linking what matters, the way robots.txt names what may be crawled. Plain
 * words, real links, prices as the page states them.
 */
export function llmsText(input: { settings: Settings; base: string; lines: SellableLine[]; faqs: Faq[] }): string {
  const { settings: s, base, lines, faqs } = input;
  const money = (l: SellableLine) => {
    const amount = `${l.currency.toUpperCase()} ${major(l.priceCents)}`;
    return l.interval ? `${amount} per ${l.interval}` : amount;
  };
  const out: string[] = [`# ${s.name}`, ""];
  const blurb = s.metaDescription || s.tagline;
  if (blurb) out.push(`> ${blurb}`, "");
  out.push(`${s.legalEntity || s.name} sells online courses, tools and memberships at ${base}.`, "");
  if (lines.length > 0) {
    out.push("## What is for sale", "");
    for (const l of lines) {
      const tail = l.description ? `: ${oneLine(l.description)}` : "";
      out.push(`- [${l.name}](${l.url}) — ${money(l)}${tail}`);
    }
    out.push("");
  }
  if (faqs.length > 0) {
    out.push("## Questions people ask", "");
    for (const f of faqs) out.push(`- **${oneLine(f.q)}** ${oneLine(f.a)}`);
    out.push("");
  }
  out.push("## Policies", "", `- [Terms](${s.termsUrl || `${base}/terms`})`, `- [Privacy](${s.privacyUrl || `${base}/privacy`})`);
  if (s.contactEmail) out.push("", `Contact: ${s.contactEmail}`);
  return out.join("\n") + "\n";
}

/** Markup and line breaks out, one space between words. */
export function oneLine(text: string): string {
  return text
    // A block boundary is a space; an inline tag is nothing, or "14 days</b>."
    // comes out as "14 days ." with a stray gap before the full stop.
    .replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|tr|td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A JSON-LD payload that cannot close its own script tag. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
