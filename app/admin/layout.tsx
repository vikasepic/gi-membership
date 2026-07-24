import Link from "next/link";
import { Logo } from "@/components/logo";

// ponytail: admin is UNGUARDED for local dev. middleware.ts blocks it in
// production until real owner-auth lands in phase 2 (accounts). Do not deploy
// without that gate.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <Logo className="h-5 w-auto text-fg" />
            <span className="kicker rounded-full bg-surface-2 px-2.5 py-1 text-muted">Admin</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-muted hover:text-fg">Products</Link>
            <Link href="/admin/offers" className="text-muted hover:text-fg">Offers</Link>
            <Link href="/admin/apps" className="text-muted hover:text-fg">Apps</Link>
            <Link href="/admin/settings" className="text-muted hover:text-fg">Settings</Link>
            <Link href="/" className="text-muted hover:text-fg">View store &rarr;</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-6">{children}</main>
    </div>
  );
}
