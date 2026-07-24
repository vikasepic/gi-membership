"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

// Mobile-first shell (Ajit's stated priority): bottom tab bar on mobile,
// top bar on desktop. Preserves the prototype's single-column mobile feel.

type Item = { href: string; label: string; icon: React.ReactNode };

const NAV: Item[] = [
  { href: "/", label: "Store", icon: <StoreIcon /> },
  { href: "/library", label: "Library", icon: <LibraryIcon /> },
  { href: "/account", label: "Account", icon: <AccountIcon /> },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Mobile top bar — brand only; navigation lives in the bottom tabs. */}
      <header className="sticky top-0 z-20 flex items-center justify-center border-b border-border bg-surface/85 px-5 py-3.5 backdrop-blur md:hidden">
        <Link href="/" aria-label="Greater Inside">
          <Logo className="h-5 w-auto text-fg" />
        </Link>
      </header>

      {/* Desktop top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-surface/80 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Greater Inside">
            <Logo className="h-6 w-auto text-fg" />
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? "bg-surface-2 text-fg"
                    : "text-muted hover:text-fg"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-6 md:px-6 md:pb-10">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
                isActive(item.href) ? "text-primary" : "text-muted"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function StoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9M4 9v10h16V9M4 9h16" />
    </svg>
  );
}
function LibraryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h5v14H4zM11 5h5v14h-5zM17 6l3 .8-3 12.2" />
    </svg>
  );
}
function AccountIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  );
}
