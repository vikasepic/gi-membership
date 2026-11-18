import { AdminSidebar } from "@/components/admin/sidebar";
import { DeployWatch } from "@/components/admin/deploy-watch";
import { NOINDEX } from "@/lib/seo";
import { navCounts, type NavCounts } from "@/lib/admin-nav";
import { stripeMode } from "@/lib/stripe";
import { needsYou } from "@/lib/needs-you";
import { getSettings } from "@/lib/settings";
import { legalPlaceholdersFrom } from "@/lib/legal";
import { getAdminRole } from "@/lib/admin-guard";

// Admin — always dynamic (server data uses runtime-only env, never prerender).
export const dynamic = "force-dynamic";

// Belt and braces. Middleware already redirects a non-admin to /login, so a
// crawler never sees any of this — but a redirected URL can still be indexed as
// a bare link, and the whole of /admin covered by one export is cheaper than
// remembering it on every page added under it.
export const metadata = NOINDEX;

const NO_COUNTS: NavCounts = { products: 0, courses: 0, offers: 0, orders: 0, members: 0, media: 0, apps: { active: 0, total: 0 }, errors: 0 };

// Admin access is gated in proxy.ts (ADMIN_EMAILS); mutating actions also
// call requireAdmin() as defense in depth.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // A read-only person gets the report pages only (lib/viewer-paths.ts). The
  // counts and the list of jobs are the admin's, and props to a client
  // component travel to the browser, so for a viewer they are never read.
  const viewer = (await getAdminRole())?.role === "viewer";
  const [counts, settings] = await Promise.all([viewer ? NO_COUNTS : navCounts(), getSettings()]);
  return (
    <div className="admin-shell flex min-h-dvh flex-col lg:flex-row">
      <AdminSidebar
        counts={counts}
        live={stripeMode() === "live"}
        nudges={viewer ? [] : needsYou(counts, legalPlaceholdersFrom(settings))}
        viewer={viewer}
      />
      {/* The width is the point of the change. A table with six columns and a
          curriculum with nested rows were both being asked to live in half a
          screen while the other half stayed empty. */}
      <main className="w-full min-w-0 flex-1 px-5 py-7 md:px-8">
        {/* 6xl by default; a page that is mostly a wide table (Transactions)
            opts into the whole screen by carrying the `admin-wide` class. */}
        <div className="mx-auto w-full max-w-6xl has-[.admin-wide]:max-w-[1800px]">{children}</div>
      </main>
      {/* Every admin page, not only the editors.
          Somebody halfway through writing a sales page is the person this is
          for, but so is somebody on Orders about to press a button — and the
          bar has to be in the shell for either to see it. */}
      <DeployWatch />
    </div>
  );
}
