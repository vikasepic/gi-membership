import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

// What a crawler may look at.
//
// Only the pages that sell or inform: the storefront, a product's sales page,
// an offer's own page, and the policies. Everything else is either a step in
// someone's purchase, someone's private library, or the admin — and none of
// those want a search result.
//
// Disallow is not a security boundary. /admin is gated by middleware and
// /library by ownership; this stops a page being INDEXED, not fetched. Anything
// that would be a leak if crawled is a leak either way and is guarded in code.

/**
 * The answer engines, named.
 *
 * `*` already covers them, but a named rule is what their operators document
 * looking for, and a site that lists them reads as one that meant to be read
 * by them. Same allow, same disallows: nothing here is a different policy.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  const disallow = [
          // A checkout is a step, not a page. Indexed, it puts someone in the
          // middle of buying something they never chose.
          "/checkout",
          // A one-time offer is one-time. Its whole meaning is that it followed
          // a purchase — reachable from a search result it is neither.
          "/checkout/oto",
          "/checkout/offer",
          "/checkout/thank-you",
          // Someone's own account and their own library.
          "/account",
          "/library",
          // Signing in is not a destination.
          "/login",
          "/reset",
          // Admin, and the previews that render unpublished work.
          "/admin",
          "/oto-preview",
          "/course-preview",
          // Nothing here is a page.
          "/api",
  ];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: AI_CRAWLERS, allow: ["/", "/llms.txt"], disallow },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
