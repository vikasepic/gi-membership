import { SettingsScreen } from "@/components/admin/settings-screen";
import { getSettings } from "@/lib/settings";
import { legalPlaceholdersFrom } from "@/lib/legal";
import { listFonts, fontFaceCss } from "@/lib/fonts";

export default async function AdminSettingsPage() {
  const [settings, fonts] = await Promise.all([getSettings(), listFonts()]);
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
      />
    </>
  );
}
