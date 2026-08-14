"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavCounts } from "@/lib/admin-nav";

// The admin navigation.
//
// Nine links in a flat row asked you to scan all nine every time, and put
// Errors — a debug surface — at the same level as Orders. They are not peers:
// Products, Courses and Offers are what the store sells; Orders and Members are
// who bought; Apps, Errors and Settings are how it runs.
//
// The counts are why this is worth 216px. "Apps 1/2" says one app is not set up
// without going to look, and Errors is a page nobody would otherwise open.

type Item = { href: string; label: string; badge?: string; warn?: boolean; icon: string };

// One glyph per destination, so navigating becomes recognising a shape rather
// than reading nine words. It is also what makes the collapsed rail possible.
const ICON = {
  home: "M12 3 3 10.2V21h6v-6h6v6h6V10.2L12 3Z",
  products: "M4 5h16v14H4V5Zm2 2v10h12V7H6Z",
  courses: "M4 4h16v3H4V4Zm0 5h16v11H4V9Z",
  offers: "M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4Z",
  media: "M4 5h16v14H4V5Zm2 2v7l3.5-3.5L13 14l3-3 2 2V7H6Z",
  orders: "M3 6h18v3H3V6Zm0 5h18v7H3v-7Z",
  members: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z",
  apps: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  errors: "M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z",
  // A card with a stripe. The page money passes through.
  checkout: "M3 5h18v14H3V5Zm2 3v2h14V8H5Zm0 5v4h6v-4H5Z",
  // A page with its bands stacked up — what a template is a piece of.
  templates: "M4 3h16v4H4V3Zm0 6h7v12H4V9Zm9 0h7v5h-7V9Zm0 7h7v5h-7v-5Z",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-2-1.2.3-2.3-2.2-.8-.7-2.2-2.3.3L12 3.8 10.9 5.8l-2.3-.3-.7 2.2-2.2.8.3 2.3L3.8 12l2.2 1.2-.3 2.3 2.2.8.7 2.2 2.3-.3 1.1 2 1.1-2 2.3.3.7-2.2 2.2-.8-.3-2.3L21 12Z",
} as const;

function groups(c: NavCounts): { title: string; items: Item[] }[] {
  const n = (v: number) => (v > 0 ? String(v) : undefined);
  return [
    {
      title: "Catalogue",
      items: [
        // First, because it is the page a visitor lands on and the only one of
        // these that is a page rather than a list of things.
        { href: "/admin/home", label: "Home page", icon: ICON.home },
        { href: "/admin", label: "Products", icon: ICON.products, badge: n(c.products) },
        { href: "/admin/courses", label: "Courses", icon: ICON.courses, badge: n(c.courses) },
        { href: "/admin/offers", label: "Offers", icon: ICON.offers, badge: n(c.offers) },
        { href: "/admin/media", label: "Media", icon: ICON.media, badge: n(c.media) },
        // Beside Media, because it is the same kind of thing: a shelf of
        // material a page is assembled from, rather than a thing being sold.
        { href: "/admin/templates", label: "Templates", icon: ICON.templates },
      ],
    },
    {
      title: "Customers",
      items: [
        // Above Orders, because it is the page an order comes from.
        { href: "/admin/checkout", label: "Checkout", icon: ICON.checkout },
        { href: "/admin/orders", label: "Orders", icon: ICON.orders, badge: n(c.orders) },
        { href: "/admin/members", label: "Members", icon: ICON.members, badge: n(c.members) },
      ],
    },
    {
      title: "System",
      items: [
        {
          href: "/admin/apps",
          label: "Apps",
          icon: ICON.apps,
          badge: c.apps.total ? `${c.apps.active}/${c.apps.total}` : undefined,
          // An app that is not connected sells nothing, which is worth seeing
          // from the navigation rather than from the page.
          warn: c.apps.total > c.apps.active,
        },
        { href: "/admin/errors", label: "Errors", icon: ICON.errors, badge: n(c.errors), warn: c.errors > 0 },
        { href: "/admin/settings", label: "Settings", icon: ICON.settings },
      ],
    },
  ];
}

export function AdminSidebar({
  counts,
  live,
  nudges = [],
}: {
  counts: NavCounts;
  live: boolean;
  /** Things the admin already knows are wrong. Absent when there are none. */
  nudges?: { label: string; href: string }[];
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Remembered, because someone who collapsed it did so for a reason and being
  // given the 212px back on every navigation is the same annoyance repeatedly.
  const [tight, setTight] = useState(false);
  useEffect(() => {
    setTight(window.localStorage.getItem("gi.nav.tight") === "1");
  }, []);
  const collapse = (next: boolean) => {
    setTight(next);
    window.localStorage.setItem("gi.nav.tight", next ? "1" : "0");
  };

  // "/admin" is a prefix of every other admin route, so it can only match
  // exactly — otherwise Products stays lit on all nine pages.
  const isOn = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  const nav = (
    <nav className="flex h-full flex-col gap-0.5 p-3" aria-label="Admin">
      {/* Only where there is something. A panel that is absent when nothing is
          wrong is one you believe the moment it appears — and every line in it
          is a fact the admin already held and mentioned nowhere you look. */}
      {nudges.length > 0 && !tight && (
        <div className="mb-2 flex flex-col gap-1 rounded-lg bg-[#f0c98a]/20 p-2.5">
          <span className="text-[0.68rem] font-semibold text-[#f0c98a]">
            {nudges.length} need{nudges.length === 1 ? "s" : ""} you
          </span>
          {nudges.slice(0, 3).map((nudge) => (
            <Link
              key={nudge.label}
              href={nudge.href}
              onClick={() => setOpen(false)}
              className="text-[0.7rem] leading-snug text-white/80 underline-offset-2 hover:text-white hover:underline"
            >
              {nudge.label}
            </Link>
          ))}
        </div>
      )}

      {groups(counts).map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          <span
            className={`pb-1 pt-4 text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-white/55 ${
              tight ? "px-0 text-center text-[0.5rem]" : "px-2.5"
            }`}
          >
            {tight ? g.title.slice(0, 3) : g.title}
          </span>
          {g.items.map((i) => {
            const on = isOn(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                onClick={() => setOpen(false)}
                title={tight ? i.label : undefined}
                className={`flex items-center gap-2 rounded-lg py-1.5 text-sm transition-colors ${
                  tight ? "justify-center px-0" : "px-2.5"
                } ${on ? "bg-white font-medium text-navy" : "text-white/85 hover:bg-white/10"}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-current opacity-80">
                  <path d={i.icon} />
                </svg>
                {!tight && i.label}
                {!tight && i.badge && (
                  <span
                    className={`ml-auto text-xs tabular-nums ${
                      i.warn
                        ? "rounded-full bg-[#f0c98a] px-1.5 font-semibold text-[#5b3708]"
                        : on
                          ? "text-navy/60"
                          : "text-white/60"
                    }`}
                  >
                    {i.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-1 border-t border-white/15 pt-3">
        {/* Which Stripe mode this store is running. It has to stay visible —
            the dangerous state is not knowing which set of orders you are
            looking at — but it does not need to be the loudest thing on the
            screen, which is what a filled pill beside the logo made it. */}
        <span
          title={live ? "Live payments" : "Stripe test mode"}
          className={`flex items-center gap-2 py-1 text-xs text-white/70 ${
            tight ? "justify-center px-0" : "px-2.5"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${live ? "bg-[#7ee0a8]" : "bg-white/40"}`}
          />
          {!tight && (live ? "Live payments" : "Stripe test mode")}
        </span>
        <Link
          href="/"
          title="View store"
          className={`rounded-lg py-1.5 text-sm text-white/85 hover:bg-white/10 ${
            tight ? "text-center" : "px-2.5"
          }`}
        >
          {tight ? "\u2192" : "View store \u2192"}
        </Link>
        {/* Desktop only: on a phone the whole rail is already behind a toggle,
            and a second way to shrink it would be shrinking nothing. */}
        <button
          type="button"
          onClick={() => collapse(!tight)}
          aria-label={tight ? "Expand the navigation" : "Collapse the navigation"}
          className={`hidden rounded-lg py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white lg:block ${
            tight ? "text-center" : "px-2.5 text-left"
          }`}
        >
          {tight ? "\u00bb" : "\u00ab Collapse"}
        </button>
      </div>
    </nav>
  );

  return (
    <>
      {/* Phone: a bar with a toggle, because 216px of permanent navigation on a
          390px screen leaves no room for the thing you came to do. */}
      <div className="flex items-center gap-3 border-b border-border bg-navy px-4 py-2.5 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="admin-nav"
          className="rounded-lg border border-white/25 px-2.5 py-1 text-sm"
        >
          Menu
        </button>
        <span className="font-medium">Admin</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-white/70">
          <span aria-hidden className={`size-1.5 rounded-full ${live ? "bg-[#7ee0a8]" : "bg-white/40"}`} />
          {live ? "Live" : "Test"}
        </span>
      </div>
      <div id="admin-nav" className={`bg-navy lg:hidden ${open ? "" : "hidden"}`}>
        {nav}
      </div>
      {/* Width lives in --admin-nav (globals.css) because the full-bleed pages
          have to subtract it from the window. */}
      <aside
        className="sticky top-0 hidden h-dvh shrink-0 bg-navy lg:block"
        style={{ width: tight ? "3.25rem" : "var(--admin-nav)" }}
      >
        {nav}
      </aside>
    </>
  );
}
