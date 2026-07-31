import Link from "next/link";
import { Logo } from "@/components/logo";
import { stripeMode } from "@/lib/stripe";

// Admin — always dynamic (server data uses runtime-only env, never prerender).
export const dynamic = "force-dynamic";

// Admin access is gated in middleware.ts (ADMIN_EMAILS); mutating actions also
// call requireAdmin() as defense in depth.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <Logo className="h-6 w-auto text-fg" />
            <span className="kicker rounded-full bg-surface-2 px-2.5 py-1 text-muted">Admin</span>
            {/* Which Stripe mode this store is actually running. Quiet in test
                mode as a reminder that none of this is real money; loud in live
                mode because all of it is. At go-live the dangerous state is not
                knowing which set of orders you are looking at. */}
            {stripeMode() === "live" ? (
              <span className="kicker rounded-full bg-primary px-2.5 py-1 text-primary-fg">
                Live payments
              </span>
            ) : (
              <span className="kicker rounded-full border border-border px-2.5 py-1 text-muted">
                Stripe test mode
              </span>
            )}
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-muted hover:text-fg">Products</Link>
            <Link href="/admin/courses" className="text-muted hover:text-fg">Courses</Link>
            <Link href="/admin/orders" className="text-muted hover:text-fg">Orders</Link>
            <Link href="/admin/members" className="text-muted hover:text-fg">Members</Link>
            <Link href="/admin/offers" className="text-muted hover:text-fg">Offers</Link>
            <Link href="/admin/apps" className="text-muted hover:text-fg">Apps</Link>
            <Link href="/admin/errors" className="text-muted hover:text-fg">Errors</Link>
            <Link href="/admin/settings" className="text-muted hover:text-fg">Settings</Link>
            <Link href="/" className="text-muted hover:text-fg">View store &rarr;</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-6">{children}</main>
    </div>
  );
}
