import type { Metadata } from "next";

/**
 * Keep this page out of search results.
 *
 * robots.txt asks a crawler not to fetch; this tells it not to index, and the
 * two fail differently. A disallowed URL someone links to can still appear as
 * a bare result with no description — Google honours the crawl block and
 * indexes the URL anyway. `noindex` is what actually keeps it out, and it only
 * works if the page CAN be fetched, which is why both exist rather than either.
 *
 * `nofollow` is deliberately not set: a checkout links to terms and privacy,
 * and those should keep their credit.
 */
export const NOINDEX: Metadata = {
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};
