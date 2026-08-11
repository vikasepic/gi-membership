import type { Metadata } from "next";
import { publicCoverUrl } from "@/lib/media-url";
import type { Settings } from "@/lib/settings-schema";

/**
 * How the store introduces itself to a search result, a pasted link and a
 * browser tab.
 *
 * Everything falls back rather than blanks: an unset meta title is the store
 * name, an unset description is the tagline. A store that has filled in nothing
 * still gets a sensible card, and one that has filled in everything gets its
 * own words — with no state in between where a link previews as empty.
 */
export function storeMetadata(s: Settings): Metadata {
  const title = s.metaTitle || s.name;
  const description = s.metaDescription || s.tagline || undefined;
  const image = publicCoverUrl(s.shareImagePath || null);
  // The favicon, and ONLY the favicon. This used to fall back to the logo,
  // which is how the tab icon became a 518×242 black wordmark: unreadable at
  // 16px and invisible against a dark tab strip. A logo is wide and a favicon
  // is square, and no code here can tell whether an uploaded file is one or the
  // other without a storage round trip on every render — so it stops guessing.
  // Unset means no `icons` key at all, and Next's own app/icon.svg stands,
  // which is the store's actual mark.
  //
  // A path, not a file: nothing here can tell that the object behind it was
  // deleted from the bucket. That case is repaired in components/app-shell.tsx,
  // which is where the browser reports the 404.
  const icon = publicCoverUrl(s.faviconPath || null);

  return {
    title,
    description,
    ...(icon ? { icons: { icon } } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      siteName: s.name,
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      // A large card with no image renders as a bare link, which is worse than
      // the small card — so the shape follows whether there is actually art.
      card: image ? "summary_large_image" : "summary",
      title,
      ...(description ? { description } : {}),
      ...(image ? { images: [image] } : {}),
    },
  };
}
