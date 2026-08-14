import type { Metadata } from "next";
import { publicCoverUrl } from "@/lib/media-url";
import type { Settings } from "@/lib/settings-schema";

/**
 * How ONE sales page introduces itself, rather than how the store does.
 *
 * Neither /p/[slug] nor /o/[key] used to say anything, so every product page in
 * the shop inherited the store's title, description and share card. Two
 * products pasted into the same thread previewed identically, and a search
 * result for a course was headed with the name of the shop.
 *
 * Three steps down, never a blank: what somebody typed for this page, then what
 * the page is already called, then the store's default. That is the whole rule,
 * and it is why the fields can ship empty — an untouched page keeps exactly the
 * card it has now, and filling one field in changes one thing.
 *
 * The store's title template is deliberately not applied here. Next appends a
 * parent template to a child title, and "Course name · Greater Inside · Greater
 * Inside" is what happens when both ends assume the other did not.
 */
export function pageMetadata(args: {
  /** What the admin typed for this page. Any of them may be empty. */
  page: { metaTitle: string; metaDescription: string; shareImagePath: string };
  /** What the page already is. */
  fallback: { title: string; description?: string | null; coverPath?: string | null };
  store: Settings;
  /** Absolute, so a shared link resolves the card from anywhere. */
  url?: string;
  /**
   * Keep it out of search results, while still giving it a share card.
   *
   * An unlisted offer page is linked from an email, not found on Google, and
   * the two are separate decisions: WhatsApp still needs a picture.
   */
  noindex?: boolean;
}): Metadata {
  const { page, fallback, store } = args;

  const title = page.metaTitle.trim() || fallback.title;
  const description =
    page.metaDescription.trim() || (fallback.description ?? "").trim() || store.metaDescription || undefined;

  // The page's own card, then the picture the page is already about, then the
  // store's. A cover is rarely 1200×630 and is still far better than the
  // store's logo on every product ever shared.
  const image =
    publicCoverUrl(page.shareImagePath || null) ??
    publicCoverUrl(fallback.coverPath || null) ??
    publicCoverUrl(store.shareImagePath || null);

  return {
    title,
    ...(description ? { description } : {}),
    ...(args.url ? { alternates: { canonical: args.url } } : {}),
    ...(args.noindex
      ? { robots: { index: false, follow: true, googleBot: { index: false, follow: true } } }
      : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      siteName: store.name,
      // `article` would be wrong — these are things for sale, and the type is
      // what decides whether a scraper looks for an author and a publish date.
      type: "website",
      ...(args.url ? { url: args.url } : {}),
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

/** The absolute address of a page, for canonical and og:url. */
export function absoluteUrl(path: string): string | undefined {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : undefined;
}
