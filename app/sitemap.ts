import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { listPublishedProducts } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The pages worth finding.
 *
 * Built from what is actually published rather than a hand-kept list, so a
 * product taken down stops being advertised to Google the moment it is, and a
 * new one appears without anyone remembering this file exists.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const fixed: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const products = await listPublishedProducts();
    return [
      ...fixed,
      ...products.map((p) => ({
        url: `${base}/p/${p.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // A sitemap that 500s is worse than a short one: Google treats the failure
    // as a signal about the site, not about this file.
    return fixed;
  }
}
