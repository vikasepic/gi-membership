import { SettingsForm } from "@/components/admin/settings-form";
import { getStoreSettings } from "@/lib/admin";

export default async function AdminSettingsPage() {
  const settings = await getStoreSettings();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl">Store settings</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
