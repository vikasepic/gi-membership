import { AdminSidebar } from "@/components/admin/sidebar";
import { DeployWatch } from "@/components/admin/deploy-watch";
import { NOINDEX } from "@/lib/seo";
import { navCounts } from "@/lib/admin-nav";
import { stripeMode } from "@/lib/stripe";
import { needsYou } from "@/lib/needs-you";
import { getSettings } from "@/lib/settings";
import { legalPlaceholdersFrom } from "@/lib/legal";

// Admin — always dynamic (server data uses runtime-only env, never prerender).
export const dynamic = "force-dynamic";

// Belt and braces. Middleware already redirects a non-admin to /login, so a
// crawler never sees any of this — but a redirected URL can still be indexed as
// a bare link, and the whole of /admin covered by one export is cheaper than
// remembering it on every page added under it.
export const metadata = NOINDEX;

// Admin access is gated in middleware.ts (ADMIN_EMAILS); mutating actions also
// call requireAdmin() as defense in depth.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [counts, settings] = await Promise.all([navCounts(), getSettings()]);
  return (
    <div className="admin-shell flex min-h-dvh flex-col lg:flex-row">
      <AdminSidebar
        counts={counts}
        live={stripeMode() === "live"}
        nudges={needsYou(counts, legalPlaceholdersFrom(settings))}
      />
      {/* The width is the point of the change. A table with six columns and a
          curriculum with nested rows were both being asked to live in half a
          screen while the other half stayed empty. */}
      <main className="w-full min-w-0 flex-1 px-5 py-7 md:px-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      {/* Every admin page, not only the editors.
          Somebody halfway through writing a sales page is the person this is
          for, but so is somebody on Orders about to press a button — and the
          bar has to be in the shell for either to see it. */}
      <DeployWatch />
    </div>
  );
}
