import { AdminSidebar } from "@/components/admin/sidebar";
import { navCounts } from "@/lib/admin-nav";
import { stripeMode } from "@/lib/stripe";

// Admin — always dynamic (server data uses runtime-only env, never prerender).
export const dynamic = "force-dynamic";

// Admin access is gated in middleware.ts (ADMIN_EMAILS); mutating actions also
// call requireAdmin() as defense in depth.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const counts = await navCounts();
  return (
    <div className="admin-shell flex min-h-dvh flex-col lg:flex-row">
      <AdminSidebar counts={counts} live={stripeMode() === "live"} />
      {/* The width is the point of the change. A table with six columns and a
          curriculum with nested rows were both being asked to live in half a
          screen while the other half stayed empty. */}
      <main className="w-full min-w-0 flex-1 px-5 py-7 md:px-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
