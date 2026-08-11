import { requireAdmin } from "@/lib/admin-guard";
import { listSavedTemplates } from "@/lib/templates-store";
import { listTemplates } from "@/lib/templates";
import { storePreview } from "@/lib/store-preview";
import { TemplatesScreen } from "@/components/admin/templates-screen";

export const dynamic = "force-dynamic";

// The shelf, as a place rather than a popup.
//
// The library inside the builder answers "which design goes in this section";
// this screen answers "what designs do we have" — building one, changing one,
// throwing one away. Same designs, same previews, same editor.
export default async function TemplatesPage() {
  await requireAdmin();
  const [saved, preview] = await Promise.all([
    listSavedTemplates(),
    // The store's own fonts and type, so a design is drawn here in the type it
    // will be drawn in on a page. Without it the previews are the app's fonts
    // and every measure is subtly wrong.
    storePreview(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl">Templates</h1>
        <p className="max-w-[70ch] text-sm text-muted">
          Designs you can drop into any section. Build one here or save one from the builder, and
          it appears in <strong>Add from library</strong> on every page.
        </p>
      </header>
      <TemplatesScreen saved={saved} builtIns={listTemplates()} preview={preview} />
    </div>
  );
}
