import { requireAdmin } from "@/lib/admin-guard";
import { DeployNoticePreview } from "@/components/admin/deploy-notice-preview";

export const dynamic = "force-dynamic";

/**
 * The deploy warning, to look at before it is wired to anything.
 *
 * Nothing here signals anything and no deploy is involved — pressing the button
 * shows the bar exactly as a real announcement would, so the wording, the
 * countdown and the place it sits can be argued with first.
 */
export default async function DeployNoticePreviewPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl">Deploy warning</h1>
        <p className="text-sm text-muted">
          A prototype. Nothing is signalled and nothing deploys — this is the bar itself, so it can
          be argued with before it is wired up.
        </p>
      </div>
      <DeployNoticePreview />
    </div>
  );
}
