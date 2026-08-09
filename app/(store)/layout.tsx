import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AttributionTracker } from "@/components/attribution-tracker";
import { Analytics } from "@/components/analytics";
import { publicAnalyticsIds } from "@/lib/env";
import { ConsentBanner } from "@/components/consent-banner";
import { StoreBrand } from "@/components/store-brand";
import { getSettingsOrDefaults } from "@/lib/settings";
import { listFonts } from "@/lib/fonts";
import { storeMetadata } from "@/lib/site-metadata";

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
  // A font table that cannot be read must not take the shop down with it; the
  // page then renders in the fonts it was built with, which is what it did
  // before any of this existed.
  const fonts = await listFonts().catch(() => []);
  return (
    <>
      <StoreBrand
        settings={settings}
        fonts={fonts}
        publicBase={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      />
      <AttributionTracker />
      <Analytics ids={publicAnalyticsIds()} />
      <AppShell settings={settings}>{children}</AppShell>
      <ConsentBanner />
    </>
  );
}
