import { requireAdmin } from "@/lib/admin-guard";
import { listSavedTemplates, listGlobalBlocks, globalUsage } from "@/lib/templates-store";
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
  const [saved, globals, preview] = await Promise.all([
    listSavedTemplates(),
    listGlobalBlocks(),
    // The store's own fonts and type, so a design is drawn here in the type it
    // will be drawn in on a page. Without it the previews are the app's fonts
    // and every measure is subtly wrong.
    storePreview(),
  ]);

  // How many sections point at each global, so a card can say what deleting it
  // would cost before the guard has to refuse.
  const usage = Object.fromEntries(
    await Promise.all(
      globals.map(async (g) => [g.savedId, (await globalUsage(g.savedId)).length] as const),
    ),
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl">Templates</h1>
        <p className="max-w-[70ch] text-sm text-muted">
          Designs you can drop into any section. Build one here or save one from the builder, and
          it appears in <strong>Add from library</strong> on every page.
        </p>
      </header>
      <TemplatesScreen
        saved={saved}
        globals={globals}
        usage={usage}
        builtIns={listTemplates()}
        preview={preview}
      />
    </div>
  );
}
