import { SettingsScreen } from "@/components/admin/settings-screen";
import { PostPurchaseSection } from "@/components/admin/post-purchase-section";
import { getSettings } from "@/lib/settings";
import { legalPlaceholdersFrom } from "@/lib/legal";
import { listFonts, fontFaceCss } from "@/lib/fonts";
import { getStoreId } from "@/lib/store";
import { getSequence } from "@/lib/post-purchase-store";
import { createServiceClient } from "@/lib/supabase/server";

/** A real offer's name for the preview's "What they bought"; the store series has no single item. */
async function sampleOfferName(storeId: string): Promise<string> {
  const { data } = await createServiceClient().from("offers").select("name").eq("store_id", storeId).order("created_at").limit(1).maybeSingle();
  return (data?.name as string | undefined) ?? "your purchase";
}

export default async function AdminSettingsPage() {
  const [settings, fonts, storeId] = await Promise.all([getSettings(), listFonts(), getStoreId()]);
  const [storeSeries, sample] = await Promise.all([getSequence("store", storeId), sampleOfferName(storeId)]);
  const mail = settings.postPurchaseEmail;
  return (
    <>
      {/* The faces, declared for this page only.
          Only @font-face — no --font-heading override — so a font that fails
          to load cannot change the admin's own typography. It exists so the
          specimen below shows the real face rather than an approximation of
          it, which is the entire point of a specimen. */}
      <style
        dangerouslySetInnerHTML={{
          __html: fontFaceCss(fonts, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
        }}
      />
      <SettingsScreen
      settings={settings}
      legalPlaceholders={legalPlaceholdersFrom(settings)}
      fonts={fonts.map((f) => ({
        id: f.id,
        family: f.family,
        source: f.source,
        count: f.files.length,
      }))}
      emailFollowUps={
        <PostPurchaseSection
          ownerType="store"
          ownerId={storeId}
          ownerName={sample}
          initial={storeSeries}
          senderName={mail.senderName || mail.senderEmail}
          accessUrl={mail.accessUrl}
        />
      }
      />
    </>
  );
}
