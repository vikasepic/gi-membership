"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { publicCoverUrl } from "@/lib/media-url";
import type { Settings } from "@/lib/settings-schema";
import { LEGAL_DEFAULTS } from "@/lib/legal-defaults";
import {
  SHELL_CLASS,
  shellHasTabs,
  shellLinks,
  siteShellCss,
  type ShellLink,
} from "@/lib/site-shell";

// Mobile-first shell (Ajit's stated priority): bottom tab bar on mobile,
// top bar on desktop. Preserves the prototype's single-column mobile feel.
//
// Everything below reads from `settings.siteShell`, and every one of those
// values is empty by default — so a store that has never opened the Header &
// navigation panel renders the markup this file has always rendered, class
// attribute for class attribute, and ships no extra CSS.

/** The three links the shell has always had, drawn with the icons it has always drawn. */
const ICONS: Record<string, React.ReactNode> = {
  "/": <StoreIcon />,
  "/library": <LibraryIcon />,
  "/account": <AccountIcon />,
};

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
  // A logo path whose file is no longer in the bucket is not an empty path, so
  // none of the fallbacks below were reachable: `publicCoverUrl` built a URL,
  // the <img> 404d, and every page on the store drew a broken-image glyph where
  // the brand goes. The server cannot tell — it holds a path, not a file — so
  // the browser saying "this did not load" is the only signal there is.
  const [logoGone, setLogoGone] = useState(false);
  const logoUrl = logoGone ? null : publicCoverUrl(settings.logoPath || null);
  const shell = settings.siteShell;
  const css = siteShellCss(shell);

  // The hook classes are worn only when a rule aims at them. An untouched
  // store therefore keeps the exact class strings it had before any of this
  // existed, which is the only way "renders identically" is checkable rather
  // than merely believed.
  const hook = (name: string) => (css ? ` ${name}` : "");

  // Only the bar's mark. The tab used to be pointed at this same path whenever
  // no favicon was uploaded, so a deleted logo killed the icon too and had to
  // be repaired from here — a `<link>` already in the head is not something a
  // re-render reaches. `lib/site-metadata.ts` no longer falls back to the logo,
  // so the tab is either an uploaded favicon or the app's own /icon.png, and
  // neither has anything to do with this file being gone.
  const onLogoMissing = () => setLogoGone(true);

  // The uploaded logo when there is one, then whichever fallback the owner
  // chose. Sized by height so a wide wordmark and a square glyph both sit on
  // the same baseline instead of one of them setting the bar height.
  const Mark = ({ className }: { className: string }) =>
    logoUrl ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt={settings.name}
        className={`${className} object-contain`}
        onError={onLogoMissing}
      />
    ) : shell.brandFallback === "name" ? (
      <span className={`${className} inline-flex items-center font-display leading-none`}>
        {settings.name}
      </span>
    ) : (
      <Logo className={className} />
    );

  // The policies, as published. A store that has named an external one links
  // out to it; one that has not keeps the page this app renders, so the footer
  // is never a dead link either way.
  //
  // The refund policy link went on 11 Sep 2026 — Ajit's call. The earnings
  // disclaimer takes its place and always renders: it is not a page this app
  // has, so it falls back to the published one rather than to a 404.
  const policies = [
    { label: "Terms", href: settings.termsUrl || "/terms", external: Boolean(settings.termsUrl) },
    { label: "Privacy", href: settings.privacyUrl || "/privacy", external: Boolean(settings.privacyUrl) },
    {
      label: "Earnings disclaimer",
      href: settings.earningsUrl || LEGAL_DEFAULTS.earningsUrl,
      external: true,
    },
  ];

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
  // These stay OUTSIDE the shell whatever the settings say. Nothing in the
  // Header & navigation panel reaches them: a header the owner switched on
  // would put those four exits back in front of a buyer mid-payment, which is
  // the one thing this list exists to prevent.
  //
  // Thank-you is deliberately NOT here: at that point the nav is how someone
  // reaches the thing they just bought.
  const OWNS_THE_WINDOW = ["/checkout", "/checkout/offer", "/checkout/oto"];
  if (OWNS_THE_WINDOW.includes(pathname)) return <>{children}</>;
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const items = shellLinks(shell);
  const hasTabs = shellHasTabs(shell);
  // A top menu instead of the bottom tabs. `<details>` rather than state: the
  // browser already knows how to open and close a disclosure, and it works
  // before this component's JavaScript has arrived.
  const menu = !hasTabs && items.length > 0;
  const hasCta = shell.ctaLabel !== "" && shell.ctaHref !== "";
  const ctaOnMobile = hasCta && shell.ctaOnMobile === "on";

  const linkClass = (item: ShellLink) =>
    `rounded-full px-4 py-2 text-sm transition-colors ${
      isActive(item.href) ? `bg-surface-2 text-fg${hook(SHELL_CLASS.current)}` : "text-muted hover:text-fg"
    }${hook(SHELL_CLASS.link)}`;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* After StoreBrand's, so what is set here beats the theme it sits on.
          Empty string until something is actually set, and an empty <style>
          is not rendered at all. */}
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}

      {/* Mobile top bar — brand only; navigation lives in the bottom tabs. */}
      {/* No `relative` for the menu and the CTA to hang off: `sticky` is
          already a positioned ancestor, so adding one only worked as long as
          Tailwind kept emitting `.sticky` after `.relative`. */}
      <header className={`sticky top-0 z-20 flex items-center justify-center border-b border-border bg-surface/85 px-5 py-3.5 backdrop-blur md:hidden${
          hook(SHELL_CLASS.bar)}${hook(SHELL_CLASS.barMobile)}`}
        style={{ paddingTop: "calc(0.875rem + env(safe-area-inset-top))" }}>
        {menu && (
          <details className="absolute left-5 top-1/2 -translate-y-1/2">
            <summary className="flex cursor-pointer list-none items-center text-fg" aria-label="Menu">
              <MenuIcon />
            </summary>
            <ul className="absolute left-0 top-full z-30 mt-2 flex w-48 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg">
              {items.map((item, i) => (
                <li key={`${item.href}-${i}`}>
                  <Link
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      isActive(item.href) ? `text-primary${hook(SHELL_CLASS.current)}` : "text-muted"
                    }${hook(SHELL_CLASS.tab)}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
        <Link href="/" aria-label={settings.name || "Home"}>
          <Mark className={`h-7 w-auto text-fg${hook(SHELL_CLASS.brandMobile)}`} />
        </Link>
        {ctaOnMobile && (
          <Link
            href={shell.ctaHref}
            className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg"
          >
            {shell.ctaLabel}
          </Link>
        )}
      </header>

      {/* Desktop top bar */}
      <header className={`sticky top-0 z-20 hidden border-b border-border bg-surface/80 backdrop-blur md:block${hook(SHELL_CLASS.bar)}`}>
        <div className={`mx-auto flex max-w-5xl items-center justify-between px-6 py-4${hook(SHELL_CLASS.barInner)}`}>
          <Link href="/" aria-label={settings.name || "Home"}>
            <Mark className={`h-7 w-auto text-fg${hook(SHELL_CLASS.brandDesktop)}`} />
          </Link>
          <nav className="flex items-center gap-1">
            {items.map((item, i) => (
              <Link key={`${item.href}-${i}`} href={item.href} className={linkClass(item)}>
                {item.label}
              </Link>
            ))}
            {hasCta && (
              <Link
                href={shell.ctaHref}
                className="ml-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
              >
                {shell.ctaLabel}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 md:px-6">
        {children}
      </main>

      {/* Policies have to be reachable from every page, not just the home page —
          a buyer looking for the refund terms is rarely standing on the home
          page when they go looking. Bottom padding clears the mobile tab bar,
          and goes when the tab bar does — six empty rems at the end of every
          page is what "just leave the padding" costs. */}
      <footer className={`mx-auto w-full max-w-5xl px-5 pt-10 ${
          hasTabs ? "pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10" : "pb-10 md:px-6"
        }`}>
        <div className="flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <Mark className={`h-5 w-auto text-fg${hook(SHELL_CLASS.brandFooter)}`} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {policies.map((l) =>
              // An external policy is a real link out; the in-app one is a
              // route. `Link` prefetching an address on another domain does
              // nothing useful, and `target` on an internal page is a tab
              // nobody asked for — so the two are drawn differently rather
              // than being forced into one shape.
              l.external ? (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-fg"
                >
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} href={l.href} className="hover:text-fg">
                  {l.label}
                </Link>
              ),
            )}
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
        {shell.footerNote && <p className="pt-4 text-xs text-muted">{shell.footerNote}</p>}
      </footer>

      {/* Mobile bottom tab bar */}
      {hasTabs && (
        <nav
          className={`fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur md:hidden${hook(SHELL_CLASS.bar)}`}
          // Sits above the home indicator instead of underneath it.
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-md items-stretch justify-around">
            {items.map((item, i) => {
              const icon = ICONS[item.href];
              // A label is only optional where there is an icon to stand in
              // for it. A custom link has no icon, so switching labels off
              // would leave an invisible tab.
              const label = shell.tabLabels !== "off" || !icon;
              return (
                <Link
                  key={`${item.href}-${i}`}
                  href={item.href}
                  aria-label={label ? undefined : item.label}
                  className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
                    isActive(item.href) ? `text-primary${hook(SHELL_CLASS.current)}` : "text-muted"
                  }${hook(SHELL_CLASS.tab)}`}
                >
                  {icon}
                  {label && item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
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
function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
