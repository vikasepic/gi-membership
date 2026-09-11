import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AttributionTracker } from "@/components/attribution-tracker";
import { Analytics } from "@/components/analytics";
import { publicAnalyticsIds } from "@/lib/env";
import { pixelMatch } from "@/lib/pixel-match";
import { ConsentBanner } from "@/components/consent-banner";
import { StoreBrand } from "@/components/store-brand";
import { getSettingsOrDefaults } from "@/lib/settings";
import { listFonts } from "@/lib/fonts";
import { storeMetadata } from "@/lib/site-metadata";
import { CodeSnippets } from "@/components/code-snippets";
import { headers } from "next/headers";
import { recordVisit } from "@/lib/visits";

// Live store — never statically prerender (server data uses runtime-only env).
export const dynamic = "force-dynamic";

/**
 * Title, description and share card come from settings, so changing how the
 * store presents itself in a search result or a pasted link is a form rather
 * than a deploy. A page with its own metadata still wins — this is the default
 * beneath it, not a replacement for it.
 */
export async function generateMetadata(): Promise<Metadata> {
  return storeMetadata(await getSettingsOrDefaults());
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettingsOrDefaults();
  // Which page this is, so a snippet that did not opt in stays off the
  // checkout. Read from the header Next sets rather than from a client hook —
  // this is a server component and the answer has to be known before render.
  const path = (await headers()).get("x-pathname");
  // A missing header fails SAFE: unknown counts as the checkout, so the only
  // snippets that run are the ones explicitly allowed there. The failure is
  // then a snippet that does not fire — visible, and reported by somebody —
  // rather than a third-party script quietly appearing on a payment page.
  const onCheckout = path === null || path.startsWith("/checkout");
  // A font table that cannot be read must not take the shop down with it; the
  // page then renders in the fonts it was built with, which is what it did
  // before any of this existed.
  const fonts = await listFonts().catch(() => []);
  // Who is reading, hashed, for the pixel's advanced matching. Null without
  // consent, and never allowed to break the page: a measurement lookup that
  // fails must cost a match rate, not a store.
  const match = await pixelMatch().catch(() => null);
  // Every store page is an entry point, which is the whole reason this sits in
  // the layout rather than in each page: page_counts only ever saw five paths
  // and never the home page at all. Not awaited — a record of a visit must
  // never delay one.
  void recordVisit();
  return (
    <>
      <CodeSnippets snippets={settings.codeSnippets} place="head" onCheckout={onCheckout} />
      <CodeSnippets snippets={settings.codeSnippets} place="bodyStart" onCheckout={onCheckout} />
      <StoreBrand
        settings={settings}
        fonts={fonts}
        publicBase={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      />
      <AttributionTracker />
      <Analytics ids={publicAnalyticsIds()} match={match} />
      <AppShell settings={settings}>{children}</AppShell>
      <ConsentBanner />
      <CodeSnippets snippets={settings.codeSnippets} place="bodyEnd" onCheckout={onCheckout} />
    </>
  );
}
