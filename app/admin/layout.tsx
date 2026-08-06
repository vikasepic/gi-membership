import { AdminSidebar } from "@/components/admin/sidebar";
import { NOINDEX } from "@/lib/seo";
import { navCounts } from "@/lib/admin-nav";
import { stripeMode } from "@/lib/stripe";
import { needsYou } from "@/lib/needs-you";

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
  const counts = await navCounts();
  return (
    <div className="admin-shell flex min-h-dvh flex-col lg:flex-row">
      <AdminSidebar counts={counts} live={stripeMode() === "live"} nudges={needsYou(counts)} />
      {/* The width is the point of the change. A table with six columns and a
          curriculum with nested rows were both being asked to live in half a
          screen while the other half stayed empty. */}
      <main className="w-full min-w-0 flex-1 px-5 py-7 md:px-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
