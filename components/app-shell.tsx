"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { publicCoverUrl } from "@/lib/media-url";
import type { Settings } from "@/lib/settings-schema";

// Mobile-first shell (Ajit's stated priority): bottom tab bar on mobile,
// top bar on desktop. Preserves the prototype's single-column mobile feel.

type Item = { href: string; label: string; icon: React.ReactNode };

const NAV: Item[] = [
  { href: "/", label: "Store", icon: <StoreIcon /> },
  { href: "/library", label: "Library", icon: <LibraryIcon /> },
  { href: "/account", label: "Account", icon: <AccountIcon /> },
];

export function AppShell({
  children,
  settings,
}: {
  children: React.ReactNode;
  /** The store's own name, logo and links. Type-only import, so the
      server-only module never reaches the browser. */
  settings: Settings;
}) {
  const pathname = usePathname();
  const logoUrl = publicCoverUrl(settings.logoPath || null);

  // The uploaded logo when there is one, the drawn mark when there is not.
  // Sized by height so a wide wordmark and a square glyph both sit on the
  // same baseline instead of one of them setting the bar height.
  const Mark = ({ className }: { className: string }) =>
    logoUrl ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={logoUrl} alt={settings.name} className={`${className} object-contain`} />
    ) : (
      <Logo className={className} />
    );

  const socials = [
    { href: settings.socialInstagram, label: "Instagram" },
    { href: settings.socialYoutube, label: "YouTube" },
    { href: settings.socialX, label: "X" },
    { href: settings.socialLinkedin, label: "LinkedIn" },
  ].filter((l) => l.href);

  // Pages that own the whole window.
  //
  // The upsell needed this first: it carries its own logo and footer and its
  // bands are full-bleed, and the shell capped it at max-w-5xl. The checkouts
  // are here for the second half of that reason — the shell hands a buyer
  // mid-payment four ways to leave, and a split-screen checkout has nowhere to
  // put its left half inside a centred column.
  //
  // Thank-you is deliberately NOT here: at that point the nav is how someone
  // reaches the thing they just bought.
  const OWNS_THE_WINDOW = ["/checkout", "/checkout/offer", "/checkout/oto"];
  if (OWNS_THE_WINDOW.includes(pathname)) return <>{children}</>;
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Mobile top bar — brand only; navigation lives in the bottom tabs. */}
      <header className="sticky top-0 z-20 flex items-center justify-center border-b border-border bg-surface/85 px-5 py-3.5 backdrop-blur md:hidden"
        style={{ paddingTop: "calc(0.875rem + env(safe-area-inset-top))" }}>
        <Link href="/" aria-label={settings.name}>
          <Mark className="h-7 w-auto text-fg" />
        </Link>
      </header>

      {/* Desktop top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-surface/80 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label={settings.name}>
            <Mark className="h-7 w-auto text-fg" />
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 md:px-6">
        {children}
      </main>

      {/* Policies have to be reachable from every page, not just the home page —
          a buyer looking for the refund terms is rarely standing on the home
          page when they go looking. Bottom padding clears the mobile tab bar. */}
      <footer className="mx-auto w-full max-w-5xl px-5 pt-10 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10">
        <div className="flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Mark className="h-5 w-auto text-fg" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/terms" className="hover:text-fg">Terms</Link>
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
            <Link href="/refunds" className="hover:text-fg">Refunds</Link>
            {socials.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="me noopener noreferrer"
                className="hover:text-fg"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur md:hidden"
        // Sits above the home indicator instead of underneath it.
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
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
