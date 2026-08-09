import { SettingsScreen } from "@/components/admin/settings-screen";
import { getSettings } from "@/lib/settings";
import { legalPlaceholdersFrom } from "@/lib/legal";
import { listFonts } from "@/lib/fonts";

export default async function AdminSettingsPage() {
  const [settings, fonts] = await Promise.all([getSettings(), listFonts()]);
  return (
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
  );
}
