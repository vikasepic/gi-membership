import { SettingsScreen } from "@/components/admin/settings-screen";
import { getSettings } from "@/lib/settings";
import { legalPlaceholdersFrom } from "@/lib/legal";

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return (
    <SettingsScreen settings={settings} legalPlaceholders={legalPlaceholdersFrom(settings)} />
  );
}
