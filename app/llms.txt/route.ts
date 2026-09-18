import { siteUrl } from "@/lib/env";
import { getSettingsOrDefaults } from "@/lib/settings";
import { storeLines, storeFaqs } from "@/lib/store-facts";
import { llmsText } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/**
 * /llms.txt — the store, for a language model.
 *
 * Built from what is published, like the sitemap, so it is never a hand-kept
 * list that goes stale. A failure returns a short file rather than a 500: a
 * crawler that gets an error learns something about the site, not the file.
 */
export async function GET() {
  const base = siteUrl();
  const settings = await getSettingsOrDefaults();
  const [lines, faqs] = await Promise.all([storeLines(base).catch(() => []), storeFaqs().catch(() => [])]);
  return new Response(llmsText({ settings, base, lines, faqs }), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
